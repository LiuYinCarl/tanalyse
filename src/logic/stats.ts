/**
 * 图表数据计算(纯几何,输出给 SVG 渲染):
 * - 饼图(donut):各分类时间占比
 * - 折线图:随时间各分类花费分钟数
 * - 柱状图:逐天(或聚合到周/月)记录时长
 */

export interface PieSlice {
  categoryId: string;
  /** 0..1 */
  fraction: number;
  minutes: number;
  /** 扇形 SVG 路径(圆心 cx,cy;外半径 r;内半径 r0) */
  path: string;
  /** 扇形中点角度(弧度,用于标签定位) */
  midAngle: number;
}

const TAU = Math.PI * 2;

function polar(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

function donutSlicePath(
  cx: number,
  cy: number,
  r: number,
  r0: number,
  a0: number,
  a1: number,
): string {
  const large = a1 - a0 > Math.PI ? 1 : 0;
  // 满圆(360°)用一条路径无法表示,略微收短 1e-4 弧度
  const end = a1 - a0 >= TAU ? a1 - 1e-4 : a1;
  const [x0, y0] = polar(cx, cy, r, a0);
  const [xe, ye] = polar(cx, cy, r, end);
  const [x2e, y2e] = polar(cx, cy, r0, end);
  const [x3, y3] = polar(cx, cy, r0, a0);
  return [
    `M ${x0.toFixed(2)} ${y0.toFixed(2)}`,
    `A ${r} ${r} 0 ${large} 1 ${xe.toFixed(2)} ${ye.toFixed(2)}`,
    `L ${x2e.toFixed(2)} ${y2e.toFixed(2)}`,
    `A ${r0} ${r0} 0 ${large} 0 ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    "Z",
  ].join(" ");
}

/**
 * 计算饼图扇形。`values` 为 categoryId → 分钟;忽略 0 值。
 * 空数据返回空数组。
 */
export function computePieSlices(
  values: Record<string, number>,
  cx: number,
  cy: number,
  r: number,
  r0: number,
): PieSlice[] {
  const entries = Object.entries(values).filter(
    ([, m]) => Number.isFinite(m) && m > 0,
  );
  const total = entries.reduce((s, [, m]) => s + m, 0);
  if (total <= 0 || r <= 0 || r0 < 0 || r0 >= r) return [];
  const slices: PieSlice[] = [];
  let angle = -Math.PI / 2; // 从 12 点方向开始
  for (const [categoryId, minutes] of entries) {
    const fraction = minutes / total;
    const sweep = fraction * TAU;
    const path = donutSlicePath(cx, cy, r, r0, angle, angle + Math.max(sweep, 1e-4));
    slices.push({
      categoryId,
      fraction,
      minutes,
      path,
      midAngle: angle + sweep / 2,
    });
    angle += sweep;
  }
  return slices;
}

export interface LineSeries {
  categoryId: string;
  /** 每个点的像素坐标 */
  points: { x: number; y: number; day: string; minutes: number }[];
  /** SVG polyline points 属性 */
  polyline: string;
}

export interface LineChartInput {
  day: string;
  /** categoryId → 分钟 */
  byCategory: Record<string, number>;
}

/**
 * 折线图坐标计算:多分类多天。
 * y 轴最大值向上取整到 120 分钟(2 小时)的倍数,最小 120,
 * 保证三条刻度线都是 30 分钟的整倍数,标签不会出现零碎数字。
 */
export function computeLineSeries(
  data: LineChartInput[],
  categoryIds: string[],
  x0: number,
  y0: number,
  width: number,
  height: number,
): { series: LineSeries[]; yMax: number; yTicks: number[]; xTicks: { x: number; day: string }[] } {
  if (width <= 0 || height <= 0 || data.length === 0) {
    return { series: [], yMax: 120, yTicks: [], xTicks: [] };
  }
  let yMax = 120;
  for (const d of data) {
    for (const id of categoryIds) {
      const v = d.byCategory[id] ?? 0;
      if (Number.isFinite(v) && v > yMax) yMax = v;
    }
  }
  yMax = Math.ceil(yMax / 120) * 120;
  const n = data.length;
  const xAt = (i: number): number =>
    n === 1 ? x0 + width / 2 : x0 + (width * i) / (n - 1);
  const yAt = (v: number): number => y0 + height - (height * Math.min(v, yMax)) / yMax;

  const series: LineSeries[] = categoryIds.map((categoryId) => {
    const points = data.map((d, i) => {
      const minutes = d.byCategory[categoryId] ?? 0;
      return { x: xAt(i), y: yAt(minutes), day: d.day, minutes };
    });
    const polyline = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return { categoryId, points, polyline };
  });

  const tickCount = 3;
  const yTicks: number[] = [];
  for (let i = 1; i <= tickCount; i++) yTicks.push(Math.round((yMax * i) / (tickCount + 1)));

  const xTickTarget = Math.min(6, n);
  const step = Math.max(1, Math.floor(n / xTickTarget));
  const xTicks: { x: number; day: string }[] = [];
  for (let i = 0; i < n; i += step) xTicks.push({ x: xAt(i), day: data[i].day });

  return { series, yMax, yTicks, xTicks };
}

/** 柱状图的一个数据桶:label 为代表日(月桶为 YYYY-MM),from/to 为覆盖范围。 */
export interface DayBucket {
  label: string;
  total: number;
  from: string;
  to: string;
}

/**
 * 把逐天时长聚合成柱状图的桶:≤120 天逐日;≤730 天按 7 天一周;
 * 更长按自然月。桶数过多会让柱体细过 1px,数值标签也没地方放。
 */
export function bucketDayTotals(
  days: { day: string; total: number }[],
  maxDailyDays = 120,
): DayBucket[] {
  if (days.length === 0) return [];
  if (days.length <= maxDailyDays) {
    return days.map((d) => ({ label: d.day, total: d.total, from: d.day, to: d.day }));
  }
  if (days.length <= 730) {
    const buckets: DayBucket[] = [];
    for (let i = 0; i < days.length; i += 7) {
      const chunk = days.slice(i, i + 7);
      buckets.push({
        label: chunk[0].day,
        total: chunk.reduce((s, d) => s + (Number.isFinite(d.total) ? d.total : 0), 0),
        from: chunk[0].day,
        to: chunk[chunk.length - 1].day,
      });
    }
    return buckets;
  }
  const buckets: DayBucket[] = [];
  let month = "";
  let total = 0;
  let from = "";
  let last = "";
  for (const d of days) {
    const key = d.day.slice(0, 7);
    if (key !== month) {
      if (month !== "") buckets.push({ label: month, total, from, to: last });
      month = key;
      total = 0;
      from = d.day;
    }
    total += Number.isFinite(d.total) ? d.total : 0;
    last = d.day;
  }
  if (month !== "") buckets.push({ label: month, total, from, to: last });
  return buckets;
}

/**
 * 柱状图坐标计算:x0/y0 为绘图区左上角,width/height 为绘图区尺寸。
 * y 轴最大值向上取整到 60 分钟的倍数(最小 60);柱宽随步进伸缩并封顶。
 */
export function computeDayBars(
  buckets: DayBucket[],
  x0: number,
  y0: number,
  width: number,
  height: number,
): {
  bars: { x: number; w: number; y: number; h: number; total: number; from: string; to: string }[];
  yMax: number;
  ticks: { index: number; x: number }[];
} {
  if (buckets.length === 0 || width <= 0 || height <= 0) {
    return { bars: [], yMax: 60, ticks: [] };
  }
  let max = 0;
  for (const b of buckets) {
    if (Number.isFinite(b.total) && b.total > max) max = b.total;
  }
  const yMax = Math.max(60, Math.ceil(max / 60) * 60);
  const n = buckets.length;
  const step = width / n;
  const w = Math.max(2, Math.min(36, step * 0.6));
  const bars = buckets.map((b, i) => {
    const h = (Math.min(Math.max(b.total, 0), yMax) / yMax) * height;
    const x = x0 + step * i + (step - w) / 2;
    return { x, w, y: y0 + height - h, h, total: b.total, from: b.from, to: b.to };
  });
  // ≤16 根全部标 x 轴;更密时隔步进抽稀(x 坐标取柱中线)
  const tickStep = n <= 16 ? 1 : Math.max(1, Math.ceil(n / 8));
  const ticks: { index: number; x: number }[] = [];
  for (let i = n - 1; i >= 0; i -= tickStep) {
    ticks.push({ index: i, x: bars[i].x + bars[i].w / 2 });
  }
  ticks.reverse();
  return { bars, yMax, ticks };
}

/**
 * 顶部圆角的柱体路径(底部平直贴基线)。圆角不超过柱宽一半与柱高。
 * h ≤ 0 返回空串(零值由调用方画基线小横条)。
 */
export function topRoundedBar(x: number, y: number, w: number, h: number): string {
  if (w <= 0 || h <= 0) return "";
  const r = Math.min(w / 2, h, 6);
  const x2 = x + w;
  const yb = y + h;
  return [
    `M ${x.toFixed(2)} ${(y + r).toFixed(2)}`,
    `A ${r} ${r} 0 0 1 ${(x + r).toFixed(2)} ${y.toFixed(2)}`,
    `L ${(x2 - r).toFixed(2)} ${y.toFixed(2)}`,
    `A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${(y + r).toFixed(2)}`,
    `L ${x2.toFixed(2)} ${yb.toFixed(2)}`,
    `L ${x.toFixed(2)} ${yb.toFixed(2)}`,
    "Z",
  ].join(" ");
}
