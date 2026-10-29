import { describe, expect, it } from "vitest";
import {
  bucketDayTotals,
  computeDayBars,
  computeLineSeries,
  computePieSlices,
} from "./stats.ts";

const TAU = Math.PI * 2;

describe("computePieSlices", () => {
  const cx = 100;
  const cy = 100;
  const r = 80;
  const r0 = 48;

  it("空数据返回空数组", () => {
    expect(computePieSlices({}, cx, cy, r, r0)).toEqual([]);
    expect(computePieSlices({ a: 0, b: -5 }, cx, cy, r, r0)).toEqual([]);
    expect(computePieSlices({ a: 10 }, cx, cy, 0, 10)).toEqual([]);
    expect(computePieSlices({ a: 10 }, cx, cy, 10, 20)).toEqual([]);
  });

  it("单分类为一个满圆扇形", () => {
    const slices = computePieSlices({ work: 60 }, cx, cy, r, r0);
    expect(slices).toHaveLength(1);
    expect(slices[0].fraction).toBeCloseTo(1);
    expect(slices[0].path).toContain("A");
  });

  it("多分类占比相加为 1,角度按比例分派", () => {
    const slices = computePieSlices({ a: 30, b: 10 }, cx, cy, r, r0);
    expect(slices.map((s) => s.categoryId)).toEqual(["a", "b"]);
    const total = slices.reduce((sum, s) => sum + s.fraction, 0);
    expect(total).toBeCloseTo(1);
    expect(slices[0].fraction).toBeCloseTo(0.75);
    expect(slices[1].fraction).toBeCloseTo(0.25);
    // 起点在 12 点方向
    expect(slices[0].midAngle).toBeCloseTo(-Math.PI / 2 + (0.75 * TAU) / 2);
  });

  it("扇形路径格式正确且弧线半径一致", () => {
    const slices = computePieSlices({ a: 1, b: 1, c: 2 }, cx, cy, r, r0);
    for (const s of slices) {
      expect(s.path.startsWith("M")).toBe(true);
      expect(s.path.endsWith("Z")).toBe(true);
      // 外弧 + 内弧:两条 A 命令
      expect(s.path.match(/A /g)?.length).toBe(2);
      // 半径参数出现在 A 命令中
      expect(s.path).toContain(`A ${r} ${r} 0`);
      expect(s.path).toContain(`A ${r0} ${r0} 0`);
    }
  });
});

describe("computeLineSeries", () => {
  it("空输入", () => {
    const out = computeLineSeries([], ["a"], 0, 0, 100, 100);
    expect(out.series).toEqual([]);
    expect(out.yMax).toBe(120);
    expect(computeLineSeries([{ day: "2026-09-21", byCategory: { a: 10 } }], ["a"], 0, 0, 0, 0).series).toEqual([]);
  });

  it("y 轴最大值向上取整到 120 分钟倍数", () => {
    const out = computeLineSeries(
      [{ day: "2026-09-21", byCategory: { a: 65 } }],
      ["a"],
      0,
      0,
      100,
      100,
    );
    expect(out.yMax).toBe(120);
    // 刻度都是 30 分钟整倍数
    for (const tick of out.yTicks) expect(tick % 30).toBe(0);
  });

  it("点数与天数一致,单天居中", () => {
    const days = ["2026-09-20", "2026-09-21", "2026-09-22"];
    const out = computeLineSeries(
      days.map((day) => ({ day, byCategory: { a: 30, b: 60 } })),
      ["a", "b"],
      10,
      10,
      300,
      100,
    );
    expect(out.series).toHaveLength(2);
    for (const s of out.series) expect(s.points).toHaveLength(3);
    // 单天:略
    const single = computeLineSeries([{ day: days[0], byCategory: { a: 10 } }], ["a"], 0, 0, 200, 100);
    expect(single.series[0].points[0].x).toBe(100); // 居中
  });

  it("y 坐标随数值缩放:最大值贴顶,0 贴底", () => {
    const out = computeLineSeries(
      [
        { day: "2026-09-20", byCategory: { a: 30 } },
        { day: "2026-09-21", byCategory: { a: 360 } },
        { day: "2026-09-22", byCategory: { a: 0 } },
      ],
      ["a"],
      0,
      10,
      300,
      100,
    );
    const [p0, p1, p2] = out.series[0].points;
    expect(out.yMax).toBe(360);
    expect(p1.y).toBe(10); // padT 顶部
    expect(p2.y).toBe(110); // y0 = padT + height 底部
    expect(p0.y).toBeGreaterThan(p1.y);
    expect(p0.y).toBeLessThan(p2.y);
  });

  it("xTicks 稀疏化不超过 6 个", () => {
    const days = Array.from({ length: 90 }, (_, i) => `2026-06-${String((i % 30) + 1).padStart(2, "0")}`);
    const out = computeLineSeries(
      days.map((day) => ({ day, byCategory: { a: 10 } })),
      ["a"],
      0,
      0,
      600,
      200,
    );
    expect(out.xTicks.length).toBeLessThanOrEqual(6);
    expect(out.xTicks.length).toBeGreaterThanOrEqual(5);
  });
});

/** 生成从 start 开始连续 n 天的逐天输入。 */
function genDays(n: number, start = "2026-01-01"): { day: string; total: number }[] {
  const out: { day: string; total: number }[] = [];
  let cur = start;
  for (let i = 0; i < n; i++) {
    out.push({ day: cur, total: (i % 5) * 30 });
    const d = new Date(`${cur}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return out;
}

describe("bucketDayTotals", () => {
  it("空输入返回空数组", () => {
    expect(bucketDayTotals([])).toEqual([]);
  });

  it("不超过 120 天时逐日成桶", () => {
    const days = genDays(120);
    const buckets = bucketDayTotals(days);
    expect(buckets).toHaveLength(120);
    expect(buckets[0]).toEqual({ label: "2026-01-01", total: 0, from: "2026-01-01", to: "2026-01-01" });
  });

  it("121..730 天按 7 天聚合,总和保持一致", () => {
    const days = genDays(200);
    const buckets = bucketDayTotals(days);
    expect(buckets).toHaveLength(Math.ceil(200 / 7));
    expect(buckets[0].from).toBe("2026-01-01");
    expect(buckets[0].to).toBe("2026-01-07");
    expect(buckets[buckets.length - 1].to).toBe("2026-07-19"); // 最后一个不完整周
    const sumDays = days.reduce((s, d) => s + d.total, 0);
    const sumBuckets = buckets.reduce((s, b) => s + b.total, 0);
    expect(sumBuckets).toBe(sumDays);
  });

  it("超过 730 天按自然月聚合", () => {
    const days = genDays(800);
    const buckets = bucketDayTotals(days);
    const months = new Set(days.map((d) => d.day.slice(0, 7)));
    expect(buckets).toHaveLength(months.size);
    expect(buckets[0].label).toBe("2026-01");
    expect(buckets[0].from).toBe("2026-01-01");
    expect(buckets[0].to).toBe("2026-01-31");
    const sumDays = days.reduce((s, d) => s + d.total, 0);
    const sumBuckets = buckets.reduce((s, b) => s + b.total, 0);
    expect(sumBuckets).toBe(sumDays);
  });
});

describe("computeDayBars", () => {
  it("空桶或非法尺寸返回空几何", () => {
    expect(computeDayBars([], 0, 0, 100, 100).bars).toEqual([]);
    const out = computeDayBars(
      [{ label: "2026-01-01", total: 30, from: "2026-01-01", to: "2026-01-01" }],
      0,
      0,
      0,
      100,
    );
    expect(out.bars).toEqual([]);
    expect(out.yMax).toBe(60);
  });

  it("yMax 向上取整到 60 分钟倍数且最小为 60", () => {
    const mk = (total: number) => [{ label: "a", total, from: "a", to: "a" }];
    expect(computeDayBars(mk(0), 0, 0, 100, 100).yMax).toBe(60);
    expect(computeDayBars(mk(61), 0, 0, 100, 100).yMax).toBe(120);
    expect(computeDayBars(mk(300), 0, 0, 100, 100).yMax).toBe(300);
  });

  it("柱体等宽居中步进,高度按比例,零值高度为 0", () => {
    const buckets = [
      { label: "1", total: 60, from: "1", to: "1" },
      { label: "2", total: 30, from: "2", to: "2" },
      { label: "3", total: 0, from: "3", to: "3" },
    ];
    const { bars, yMax } = computeDayBars(buckets, 10, 20, 300, 100);
    expect(yMax).toBe(60);
    expect(bars).toHaveLength(3);
    // 步进 100,柱宽封顶 36,依次在步进内居中
    expect(bars[0].x).toBeCloseTo(10 + 32);
    expect(bars[1].x).toBeCloseTo(110 + 32);
    expect(bars[2].x).toBeCloseTo(210 + 32);
    expect(bars[0].h).toBeCloseTo(100); // 满值贴顶
    expect(bars[0].y).toBeCloseTo(20);
    expect(bars[1].h).toBeCloseTo(50);
    expect(bars[2].h).toBeCloseTo(0);
    expect(bars[2].y).toBeCloseTo(120); // 贴基线
  });

  it("ticks:≤16 根全部标注,更密时抽稀且必含最后一根", () => {
    const seven = bucketDayTotals(genDays(7));
    expect(computeDayBars(seven, 0, 0, 600, 100).ticks).toHaveLength(7);
    const thirty = bucketDayTotals(genDays(30));
    const dense = computeDayBars(thirty, 0, 0, 600, 100);
    expect(dense.ticks.length).toBeLessThanOrEqual(8);
    expect(dense.ticks[dense.ticks.length - 1].index).toBe(29);
  });
});
