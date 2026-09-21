import { beforeAll, describe, expect, it } from "vitest";
import { loadData, serializeData } from "./migrate.ts";
import {
  APP_VERSION,
  DATA_VERSION,
  POSITIONS_PER_DAY,
  defaultCategories,
} from "./schema.ts";
import { setLocale } from "./i18n.ts";

describe("loadData", () => {
  beforeAll(() => setLocale("zh"));
  it("空输入生成默认数据", () => {
    const r = loadData(null);
    expect(r.data.version).toBe(DATA_VERSION);
    expect(r.data.categories).toEqual(defaultCategories());
    expect(r.migratedFrom).toBeNull();
    expect(r.repairs).toEqual([]);
    expect(r.readonly).toBe(false);
  });

  it("JSON 损坏时重置", () => {
    const r = loadData("{oops");
    expect(r.repairs.length).toBeGreaterThan(0);
    expect(r.data.version).toBe(DATA_VERSION);
  });

  it("完整合法数据原样保留", () => {
    const raw = {
      version: DATA_VERSION,
      appVersion: APP_VERSION,
      categories: [
        { id: "work", name: "工作", color: "#9caf9f", builtin: "work" },
        { id: "rest", name: "休息", color: "#a2b9c7", builtin: "rest" },
        { id: "c_1", name: "阅读", color: "#c8b6a6" },
      ],
      entries: { "2026-09-21": [null, "work", "work", ...new Array(POSITIONS_PER_DAY - 3).fill(null)] },
      settings: { theme: "dark", accentColor: "#8FCBA8", weekStartsOn: 0, autoStart: true },
    };
    const r = loadData(JSON.stringify(raw));
    expect(r.repairs).toEqual([]);
    expect(r.data.settings.theme).toBe("dark");
    expect(r.data.categories).toHaveLength(3);
    expect(r.data.entries["2026-09-21"][1]).toBe("work");
  });

  it("修复非法字段", () => {
    const raw = {
      version: DATA_VERSION,
      categories: [{ id: "bad id!", name: "", color: "red" }, "junk"],
      entries: { "not-a-day": [1], "2026-09-21": ["ghost-cat", "work", 42] },
      settings: { theme: "sepia", accentColor: "yellow", weekStartsOn: 5 },
    };
    const r = loadData(JSON.stringify(raw));
    expect(r.repairs.join("\n")).toContain("categories");
    expect(r.data.categories.length).toBeGreaterThanOrEqual(1); // 内置默认分类兜底
    expect("not-a-day" in r.data.entries).toBe(false);
    expect(r.data.entries["2026-09-21"][0]).toBeNull();
    expect(r.data.entries["2026-09-21"][1]).toBe("work");
    expect(r.data.entries["2026-09-21"]).toHaveLength(POSITIONS_PER_DAY);
    expect(r.data.settings.theme).toBe("system");
    expect(r.data.settings.accentColor).toBe("#8fcba8");  });

  it("来自未来主版本的数据只读", () => {
    const raw = { version: "2.0.0", entries: {} };
    const r = loadData(JSON.stringify(raw));
    expect(r.readonly).toBe(true);
    expect(r.migratedFrom).toBe("2.0.0");
  });

  it("非法版本号被迁移修复", () => {
    const raw = { version: "banana", entries: {} };
    const r = loadData(JSON.stringify(raw));
    expect(r.readonly).toBe(false);
    expect(r.data.version).toBe(DATA_VERSION);
    expect(r.repairs.join("\n")).toContain("version");
  });

  it("缺少版本号时重建", () => {
    const r = loadData(JSON.stringify({ entries: {} }));
    expect(r.data.version).toBe(DATA_VERSION);
    expect(r.repairs.join("\n")).toContain("version");
  });
});

describe("serializeData", () => {
  it("丢弃空日期并保留版本号", () => {
    const r = loadData(null);
    r.data.entries["2026-09-21"] = new Array(POSITIONS_PER_DAY).fill(null);
    r.data.entries["2026-09-22"] = new Array(POSITIONS_PER_DAY).fill("work");
    const json = serializeData(r.data);
    const out = JSON.parse(json);
    expect(out.version).toBe(DATA_VERSION);
    expect(out.appVersion).toBe(APP_VERSION);
    expect("2026-09-21" in out.entries).toBe(false);
    expect("2026-09-22" in out.entries).toBe(true);
  });

  it("序列化后再加载保持一致", () => {
    const r = loadData(null);
    r.data.entries["2026-09-21"] = Array.from({ length: POSITIONS_PER_DAY }, (_, i) =>
      i < 3 ? "work" : null,
    );
    const again = loadData(serializeData(r.data));
    expect(again.repairs).toEqual([]);
    expect(again.data.entries["2026-09-21"][0]).toBe("work");
    expect(again.data.categories.map((c) => c.id)).toEqual(
      r.data.categories.map((c) => c.id),
    );
  });

  it("内置分类保留 builtin 标记", () => {
    const r = loadData(null);
    const out = JSON.parse(serializeData(r.data));
    expect(out.categories.find((c: { id: string }) => c.id === "work").builtin).toBe("work");
  });
});
