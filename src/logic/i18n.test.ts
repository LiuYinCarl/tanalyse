import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  detectLocale,
  formatDayLabel,
  formatMinutes,
  getLocale,
  joinList,
  monthLabel,
  setLocale,
  t,
  weekdayShort,
} from "./i18n.ts";
import type { Locale, MsgKey } from "./i18n.ts";

beforeEach(() => {
  setLocale("zh");
});

afterEach(() => {
  setLocale("zh");
});

describe("t() 取词与插值", () => {
  it("中英文案切换", () => {
    expect(t("tab.grid")).toBe("格子");
    setLocale("en");
    expect(t("tab.grid")).toBe("Grid");
    expect(getLocale()).toBe("en");
  });

  it("参数插值", () => {
    expect(t("heatmap.weeks", { n: 26 })).toBe("近 26 周");
    setLocale("en");
    expect(t("heatmap.weeks", { n: 26 })).toBe("Last 26 weeks");
    expect(t("repair.entriesDropped", { n: 3 })).toBe("entries: dropped 3 invalid days");
  });

  it("未知键回退为键名本身", () => {
    expect(t("nope.missing" as MsgKey)).toBe("nope.missing");
  });

  it("setLocale 忽略非法值", () => {
    setLocale("fr" as Locale);
    expect(getLocale()).toBe("zh");
  });

  it("detectLocale 返回受支持的语言", () => {
    expect(["zh", "en"]).toContain(detectLocale());
  });
});

describe("列表连接与本地化格式", () => {
  it("joinList 中文顿号 / 英文逗号", () => {
    expect(joinList(["工作", "休息"])).toBe("工作、休息");
    setLocale("en");
    expect(joinList(["Work", "Rest"])).toBe("Work, Rest");
  });

  it("formatMinutes 中文时长", () => {
    expect(formatMinutes(0)).toBe("0 分钟");
    expect(formatMinutes(45)).toBe("45 分钟");
    expect(formatMinutes(60)).toBe("1 小时");
    expect(formatMinutes(125)).toBe("2 小时 5 分");
    expect(formatMinutes(NaN)).toBe("0 分钟");
  });

  it("formatMinutes 英文时长", () => {
    setLocale("en");
    expect(formatMinutes(0)).toBe("0 min");
    expect(formatMinutes(45)).toBe("45 min");
    expect(formatMinutes(60)).toBe("1 h");
    expect(formatMinutes(125)).toBe("2 h 5 min");
  });

  it("formatDayLabel 中英文", () => {
    expect(formatDayLabel("2026-09-21")).toBe("2026-09-21 周一");
    setLocale("en");
    expect(formatDayLabel("2026-09-21")).toBe("Mon, 2026-09-21");
    expect(formatDayLabel("bad")).toBe("bad");
  });

  it("星期与月份短名", () => {
    expect(t("weekday.1" as MsgKey)).toBe("一");
    expect(monthLabel(8)).toBe("9月");
    setLocale("en");
    expect(weekdayShort(1)).toBe("Mon");
    expect(monthLabel(8)).toBe("Sep");
  });
});
