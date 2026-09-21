/**
 * 图表数据计算(纯几何,输出给 SVG 渲染):
 * - 饼图(donut):各分类时间占比
 * - 折线图:随时间各分类花费分钟数
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
 * y 轴最大值向上取整到 30 分钟的倍数,最小为 30。
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
    return { series: [], yMax: 30, yTicks: [], xTicks: [] };
  }
  let yMax = 30;
  for (const d of data) {
    for (const id of categoryIds) {
      const v = d.byCategory[id] ?? 0;
      if (Number.isFinite(v) && v > yMax) yMax = v;
    }
  }
  yMax = Math.ceil(yMax / 30) * 30;
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
