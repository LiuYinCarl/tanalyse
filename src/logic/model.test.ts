import { describe, expect, it } from "vitest";
import {
  clearDay,
  dayMinutes,
  getDay,
  getSlotStates,
  heatLevel,
  heatmapData,
  isSlotEmpty,
  rangeStats,
  reassignCategory,
  setSlot,
  setSubSlot,
  slotTooltip,
  toggleSlot,
} from "./model.ts";
import { createDefaultData, emptyDay } from "./schema.ts";

function withWork(data = createDefaultData()) {
  return { data, work: "work", rest: "rest" };
}

describe("setSlot / setSubSlot / getDay", () => {
  it("设置整个 30 分钟格子", () => {
    const { data } = withWork();
    expect(setSlot(data, "2026-09-21", 3, "work")).toBe(true);
    const day = getDay(data, "2026-09-21");
    expect(day.slice(9, 12)).toEqual(["work", "work", "work"]);
    expect(day.slice(8, 9)).toEqual([null]);
  });

  it("设置细分小格(10 分钟)", () => {
    const { data } = withWork();
    setSubSlot(data, "2026-09-21", 0, 2, "rest");
    expect(getSlotStates(data, "2026-09-21", 0)).toEqual([null, null, "rest"]);
    expect(getSlotStates(data, "2026-09-21", 1)).toEqual([null, null, null]);
  });

  it("重复设置不报告变化", () => {
    const { data } = withWork();
    setSlot(data, "2026-09-21", 5, "work");
    expect(setSlot(data, "2026-09-21", 5, "work")).toBe(false);
    expect(setSubSlot(data, "2026-09-21", 5, 0, "work")).toBe(false);
  });

  it("非法参数抛出异常", () => {
    const { data } = withWork();
    expect(() => setSlot(data, "2026-09-21", 48, "work")).toThrow();
    expect(() => setSlot(data, "2026-09-21", -1, "work")).toThrow();
    expect(() => setSubSlot(data, "2026-09-21", 0, 3, "work")).toThrow();
    expect(() => setSlot(data, "bad-day", 0, "work")).toThrow();
  });

  it("getDay 对不存在的日期返回空白数组", () => {
    const { data } = withWork();
    expect(getDay(data, "2020-01-01")).toEqual(emptyDay());
  });
});

describe("toggleSlot", () => {
  it("同分类再点一次清除", () => {
    const { data, work } = withWork();
    toggleSlot(data, "2026-09-21", 0, work);
    expect(getSlotStates(data, "2026-09-21", 0)).toEqual([work, work, work]);
    toggleSlot(data, "2026-09-21", 0, work);
    expect(getSlotStates(data, "2026-09-21", 0)).toEqual([null, null, null]);
  });

  it("部分填充时点击补满", () => {
    const { data, work } = withWork();
    setSubSlot(data, "2026-09-21", 0, 1, work);
    toggleSlot(data, "2026-09-21", 0, work);
    expect(getSlotStates(data, "2026-09-21", 0)).toEqual([work, work, work]);
  });
});

describe("isSlotEmpty / clearDay / reassignCategory", () => {
  it("空格子判断", () => {
    const { data, work } = withWork();
    expect(isSlotEmpty(data, "2026-09-21", 10)).toBe(true);
    setSlot(data, "2026-09-21", 10, work);
    expect(isSlotEmpty(data, "2026-09-21", 10)).toBe(false);
  });

  it("clearDay 删除整天", () => {
    const { data } = withWork();
    setSlot(data, "2026-09-21", 0, "work");
    expect(clearDay(data, "2026-09-21")).toBe(true);
    expect("2026-09-21" in data.entries).toBe(false);
    expect(clearDay(data, "2026-09-21")).toBe(false);
  });

  it("reassignCategory 迁移标记", () => {
    const { data, work } = withWork();
    setSlot(data, "2026-09-21", 0, work);
    setSubSlot(data, "2026-09-22", 1, 1, work);
    expect(reassignCategory(data, work, "rest")).toBe(4);
    expect(getSlotStates(data, "2026-09-21", 0)).toEqual(["rest", "rest", "rest"]);
  });
});

describe("统计", () => {
  it("dayMinutes 按 10 分钟累计", () => {
    const { data, work, rest } = withWork();
    setSlot(data, "2026-09-21", 0, work); // 30 分
    setSubSlot(data, "2026-09-21", 1, 0, rest); // 10 分
    const t = dayMinutes(data, "2026-09-21");
    expect(t.byCategory).toEqual({ [work]: 30, [rest]: 10 });
    expect(t.total).toBe(40);
  });

  it("rangeStats 汇总区间并跳过空白天", () => {
    const { data, work } = withWork();
    setSlot(data, "2026-09-20", 0, work);
    setSlot(data, "2026-09-21", 1, work);
    const stats = rangeStats(data, "2026-09-19", "2026-09-22");
    expect(stats.activeDays).toBe(2);
    expect(stats.total).toBe(60);
    expect(stats.perDay.map((d) => d.day)).toEqual(["2026-09-20", "2026-09-21"]);
  });

  it("rangeStats 非法区间返回空", () => {
    const { data } = withWork();
    expect(rangeStats(data, "bad", "2026-09-21").total).toBe(0);
    expect(rangeStats(data, "2026-09-21", "2026-09-20").total).toBe(0);
  });
});

describe("热力图", () => {
  it("heatLevel 分档", () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(10)).toBe(1);
    expect(heatLevel(29)).toBe(1);
    expect(heatLevel(30)).toBe(2);
    expect(heatLevel(89)).toBe(2);
    expect(heatLevel(90)).toBe(3);
    expect(heatLevel(180)).toBe(4);
    expect(heatLevel(-5)).toBe(0);
    expect(heatLevel(NaN)).toBe(0);
  });

  it("heatmapData 输出色阶与分钟", () => {
    const { data, work } = withWork();
    setSlot(data, "2026-09-21", 0, work); // 30 分钟 → 档 2
    const rows = heatmapData(data, ["2026-09-21", "2026-09-22"]);
    expect(rows[0]).toEqual({ day: "2026-09-21", level: 2, minutes: 30 });
    expect(rows[1].level).toBe(0);
  });
});

describe("slotTooltip", () => {
  it("显示分类名", () => {
    const { data, work } = withWork();
    setSlot(data, "2026-09-21", 0, work);
    expect(slotTooltip(data, "2026-09-21", 0)).toContain("工作");
    expect(slotTooltip(data, "2026-09-21", 0)).toContain("00:00");
    expect(slotTooltip(data, "2026-09-21", 5)).toContain("未记录");
    expect(slotTooltip(data, "2026-09-21", 0, 2)).toContain("00:20");
  });
});
