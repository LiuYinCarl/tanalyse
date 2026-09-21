import { describe, expect, it } from "vitest";
import {
  addDays,
  dayKeyOf,
  dayRange,
  isDayKey,
  lastNDays,
  minutesToLabel,
  monthRange,
  slotLabel,
  startOfWeek,
} from "./time.ts";

describe("isDayKey / dayKeyOf", () => {
  it("识别合法 dayKey", () => {
    expect(isDayKey("2026-09-21")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false); // 2 月没有 30 日
    expect(isDayKey("2026-13-01")).toBe(false);
    expect(isDayKey("2026-9-1")).toBe(false);
    expect(isDayKey("abc")).toBe(false);
  });

  it("dayKeyOf 按本地时间取整", () => {
    expect(dayKeyOf(new Date(2026, 8, 21, 23, 59))).toBe("2026-09-21");
    expect(dayKeyOf(new Date(2026, 0, 1))).toBe("2026-01-01");
  });
});

describe("addDays / dayRange / lastNDays", () => {
  it("跨月平移", () => {
    expect(addDays("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29"); // 闰年
  });

  it("非法输入返回 null", () => {
    expect(addDays("bad", 1)).toBeNull();
    expect(addDays("2026-01-01", 1.5)).toBeNull();
  });

  it("dayRange 含端点", () => {
    expect(dayRange("2026-09-20", "2026-09-22")).toEqual([
      "2026-09-20",
      "2026-09-21",
      "2026-09-22",
    ]);
    expect(dayRange("2026-09-22", "2026-09-20")).toEqual([]);
  });

  it("lastNDays 含今天且升序", () => {
    const now = new Date(2026, 8, 21, 12, 0);
    expect(lastNDays(3, now)).toEqual(["2026-09-19", "2026-09-20", "2026-09-21"]);
    expect(lastNDays(0, now)).toEqual([]);
    expect(lastNDays(-1, now)).toEqual([]);
  });
});

describe("startOfWeek / monthRange", () => {
  it("周一为一周起始", () => {
    expect(startOfWeek("2026-09-21", 1)).toBe("2026-09-21"); // 周一
    expect(startOfWeek("2026-09-27", 1)).toBe("2026-09-21"); // 周日
  });

  it("周日为一周起始", () => {
    expect(startOfWeek("2026-09-21", 0)).toBe("2026-09-20");
  });

  it("monthRange 返回首尾", () => {
    expect(monthRange(2026, 9)).toEqual(["2026-09-01", "2026-09-30"]);
    expect(monthRange(2024, 2)).toEqual(["2024-02-01", "2024-02-29"]);
    expect(monthRange(2026, 13)).toBeNull();
  });
});

describe("展示格式", () => {
  it("minutesToLabel / slotLabel", () => {
    expect(minutesToLabel(0)).toBe("00:00");
    expect(minutesToLabel(510)).toBe("08:30");
    expect(minutesToLabel(1439)).toBe("23:59");
    expect(minutesToLabel(2000)).toBe("24:00");
    expect(slotLabel(0)).toBe("00:00");
    expect(slotLabel(17)).toBe("08:30");
    expect(slotLabel(47)).toBe("23:30");
  });
});
