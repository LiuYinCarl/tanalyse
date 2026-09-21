import { describe, expect, it } from "vitest";
import { computeLineSeries, computePieSlices } from "./stats.ts";

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
    expect(out.yMax).toBe(30);
    expect(computeLineSeries([{ day: "2026-09-21", byCategory: { a: 10 } }], ["a"], 0, 0, 0, 0).series).toEqual([]);
  });

  it("y 轴最大值向上取整到 30 分钟倍数", () => {
    const out = computeLineSeries(
      [{ day: "2026-09-21", byCategory: { a: 65 } }],
      ["a"],
      0,
      0,
      100,
      100,
    );
    expect(out.yMax).toBe(90);
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
        { day: "2026-09-21", byCategory: { a: 300 } },
        { day: "2026-09-22", byCategory: { a: 0 } },
      ],
      ["a"],
      0,
      10,
      300,
      100,
    );
    const [p0, p1, p2] = out.series[0].points;
    expect(out.yMax).toBe(300);
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
