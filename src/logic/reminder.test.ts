import { describe, expect, it } from "vitest";
import {
  REMIND_END_HOUR,
  REMIND_INTERVAL_MIN,
  REMIND_START_HOUR,
  inWorkHours,
  shouldRemind,
} from "./reminder.ts";

describe("inWorkHours", () => {
  it("9 点起(含)19 点前(不含)为工作时段", () => {
    expect(inWorkHours(REMIND_START_HOUR)).toBe(true);
    expect(inWorkHours(12)).toBe(true);
    expect(inWorkHours(REMIND_END_HOUR - 1)).toBe(true);
    expect(inWorkHours(REMIND_END_HOUR)).toBe(false);
    expect(inWorkHours(0)).toBe(false);
    expect(inWorkHours(23)).toBe(false);
  });

  it("非整数小时一律不算", () => {
    expect(inWorkHours(Number.NaN)).toBe(false);
    expect(inWorkHours(10.5)).toBe(false);
  });
});

describe("shouldRemind", () => {
  const base = { hour: 10, minutesSinceLast: null as number | null, hasRecordToday: false };

  it("当天已有记录则永不提醒", () => {
    expect(shouldRemind({ ...base, hasRecordToday: true })).toBe(false);
    expect(shouldRemind({ ...base, hasRecordToday: true, minutesSinceLast: 999 })).toBe(false);
  });

  it("非工作时段不提醒", () => {
    expect(shouldRemind({ ...base, hour: 8 })).toBe(false);
    expect(shouldRemind({ ...base, hour: 20 })).toBe(false);
  });

  it("本次运行首次到达条件即提醒", () => {
    expect(shouldRemind(base)).toBe(true);
  });

  it("距上次提醒满 2 小时才再次提醒", () => {
    expect(shouldRemind({ ...base, minutesSinceLast: REMIND_INTERVAL_MIN - 1 })).toBe(false);
    expect(shouldRemind({ ...base, minutesSinceLast: REMIND_INTERVAL_MIN })).toBe(true);
    expect(shouldRemind({ ...base, minutesSinceLast: REMIND_INTERVAL_MIN + 30 })).toBe(true);
  });
});
