import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppStore } from "./state.ts";
import { loadData } from "./logic/migrate.ts";
import { POSITIONS_PER_DAY } from "./logic/schema.ts";
import { setSlot } from "./logic/model.ts";

function makeStore(json: string | null = null, debounceMs = 5) {
  let persisted: string | null = null;
  const store = new AppStore(
    {
      loadJson: async () => json,
      persistJson: async (s) => {
        persisted = s;
      },
      debounceMs,
    },
    new Date(2026, 8, 21, 10, 0),
  );
  return { store, getPersisted: () => persisted };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

import { setLocale } from "./logic/i18n.ts";
beforeAll(() => setLocale("zh"));

describe("AppStore 初始化", () => {
  it("初始默认状态", async () => {
    const { store } = makeStore();
    expect(store.viewDay).toBe("2026-09-21");
    expect(store.selectedCategoryId).toBe("work");
    expect(store.readonlyMode).toBe(false);
    await store.init();
    expect(store.data.categories.map((c) => c.id)).toContain("work");
  });

  it("从 JSON 恢复并修复选中分类", async () => {
    const raw = { version: "1.0.0", categories: [{ id: "solo", name: "独苗", color: "#c8b6a6" }], entries: {} };
    const { store } = makeStore(JSON.stringify(raw));
    store.selectedCategoryId = "work";
    await store.init();
    expect(store.selectedCategoryId).toBe("solo");
  });

  it("未来版本数据进入只读模式", async () => {
    const { store } = makeStore(JSON.stringify({ version: "9.0.0", entries: {} }));
    await store.init();
    expect(store.readonlyMode).toBe(true);
  });
});

describe("持久化", () => {
  it("数据变更后防抖落盘", async () => {
    const { store, getPersisted } = makeStore();
    await store.init();
    setSlot(store.data, "2026-09-21", 0, "work");
    store.notifyDataChanged();
    expect(getPersisted()).toBeNull();
    await vi.advanceTimersByTimeAsync(50);
    expect(getPersisted()).not.toBeNull();
    const out = JSON.parse(getPersisted()!);
    expect(out.entries["2026-09-21"][0]).toBe("work");
  });

  it("只读模式不落盘", async () => {
    const { store, getPersisted } = makeStore(JSON.stringify({ version: "9.0.0" }));
    await store.init();
    setSlot(store.data, "2026-09-21", 0, "work");
    store.notifyDataChanged();
    await vi.advanceTimersByTimeAsync(50);
    expect(getPersisted()).toBeNull();
  });

  it("flush 立即落盘且空转不写", async () => {
    const { store, getPersisted } = makeStore();
    await store.init();
    await store.flush();
    expect(getPersisted()).toBeNull();
    setSlot(store.data, "2026-09-21", 0, "work");
    store.notifyDataChanged();
    await store.flush();
    expect(getPersisted()).not.toBeNull();
  });
});

describe("视图状态", () => {
  it("setViewDay 触发 view 事件", () => {
    const { store } = makeStore();
    let views = 0;
    store.on("view", () => views++);
    store.setViewDay("2026-09-20");
    store.setViewDay("2026-09-20"); // 相同不触发
    expect(views).toBe(1);
    expect(store.viewDay).toBe("2026-09-20");
  });

  it("selectCategory 忽略相同值", () => {
    const { store } = makeStore();
    let views = 0;
    store.on("view", () => views++);
    store.selectCategory("rest");
    store.selectCategory("rest");
    expect(views).toBe(1);
  });
});

describe("分类管理", () => {
  it("新增分类并自动选中(当无选中时)", () => {
    const { store } = makeStore();
    store.addCategory({ id: "read", name: "阅读", color: "#c8b6a6" });
    expect(store.data.categories.some((c) => c.id === "read")).toBe(true);
    store.selectCategory(null);
    store.addCategory({ id: "run", name: "跑步", color: "#c7a4a0" });
    expect(store.selectedCategoryId).toBe("run");
  });

  it("重复 id 不重复添加", () => {
    const { store } = makeStore();
    store.addCategory({ id: "read", name: "阅读", color: "#c8b6a6" });
    store.addCategory({ id: "read", name: "又读", color: "#c7a4a0" });
    expect(store.data.categories.filter((c) => c.id === "read")).toHaveLength(1);
  });

  it("更新名称与颜色", () => {
    const { store } = makeStore();
    store.updateCategory("work", { name: "搬砖", color: "#b8a9c0" });
    expect(store.data.categories.find((c) => c.id === "work")?.name).toBe("搬砖");
  });

  it("删除自定义分类并清空其标记,内置分类不可删", () => {
    const { store } = makeStore();
    store.addCategory({ id: "read", name: "阅读", color: "#c8b6a6" });
    setSlot(store.data, "2026-09-21", 0, "read");
    expect(store.removeCategory("work")).toBe(false);
    expect(store.removeCategory("read")).toBe(true);
    expect(store.data.categories.some((c) => c.id === "read")).toBe(false);
    expect(store.data.entries["2026-09-21"]?.[0] ?? null).toBeNull();
    expect(store.selectedCategoryId).toBe("work");
  });
});

describe("导入数据", () => {
  it("replaceData 覆盖数据并解除只读", async () => {
    const { store, getPersisted } = makeStore(JSON.stringify({ version: "9.0.0" }));
    await store.init();
    const fresh = loadData(null).data;
    fresh.entries["2026-09-21"] = new Array(POSITIONS_PER_DAY).fill("work");
    store.replaceData(fresh);
    expect(store.readonlyMode).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(JSON.parse(getPersisted()!).entries["2026-09-21"]).toBeDefined();
  });

  it("updateSettings 合并字段", () => {
    const { store } = makeStore();
    store.updateSettings({ theme: "dark" });
    expect(store.data.settings.theme).toBe("dark");
    expect(store.data.settings.weekStartsOn).toBe(1);
  });
});

describe("格子写入(经 store 统一入口)", () => {
  it("toggle / setSubSlot / setSlot 触发 data 事件,无变化不触发", async () => {
    const { store } = makeStore();
    await store.init();
    let events = 0;
    store.on("data", () => events++);
    expect(store.toggleSlot("2026-09-21", 0, "work")).toBe(true);
    expect(store.toggleSlot("2026-09-21", 0, "work")).toBe(true); // 同分类再点 = 清除
    expect(store.setSubSlot("2026-09-21", 1, 1, "rest")).toBe(true);
    expect(store.setSubSlot("2026-09-21", 1, 1, "rest")).toBe(false); // 相同值不触发
    expect(store.setSlot("2026-09-21", 2, "work")).toBe(true);
    expect(store.setSlot("2026-09-21", 2, null)).toBe(true);
    expect(events).toBe(5);
  });

  it("只读模式拒绝所有写入", async () => {
    const { store } = makeStore(JSON.stringify({ version: "9.0.0" }));
    await store.init();
    expect(store.readonlyMode).toBe(true);
    expect(store.toggleSlot("2026-09-21", 0, "work")).toBe(false);
    expect(store.setSlot("2026-09-21", 0, "work")).toBe(false);
    expect(store.setSubSlot("2026-09-21", 0, 0, "work")).toBe(false);
  });
});

describe("错误处理", () => {
  it("加载失败进入只读并广播错误(避免默认数据覆盖原文件)", async () => {
    let errored = "";
    const store = new AppStore({
      loadJson: async () => {
        throw new Error("disk boom");
      },
      persistJson: async () => {},
    });
    store.on("error", (m) => {
      errored = m;
    });
    await store.init();
    expect(store.readonlyMode).toBe(true);
    expect(store.errorMessage).toContain("disk boom");
    expect(errored).toContain("disk boom");
    // 只读下写入被拒绝,不会落盘
    expect(store.toggleSlot("2026-09-21", 0, "work")).toBe(false);
  });

  it("非 Error 异常也能转成提示文本", async () => {
    const store = new AppStore({
      loadJson: async () => {
        throw "plain failure";
      },
      persistJson: async () => {},
    });
    await store.init();
    expect(store.errorMessage).toContain("plain failure");
  });

  it("写盘失败保留脏标记并广播;恢复后重试成功并清除错误", async () => {
    let fail = true;
    let persisted: string | null = null;
    const store = new AppStore({
      loadJson: async () => null,
      persistJson: async (s) => {
        if (fail) throw new Error("read-only fs");
        persisted = s;
      },
      debounceMs: 5,
    });
    await store.init();
    let errored = "";
    store.on("error", (m) => {
      errored = m;
    });
    store.toggleSlot("2026-09-21", 0, "work");
    await vi.advanceTimersByTimeAsync(50);
    expect(errored).toContain("read-only fs");
    expect(persisted).toBeNull();
    expect(store.errorMessage).not.toBeNull();
    // 环境恢复后手动 flush:脏标记还在 → 重试成功并清除错误
    fail = false;
    await store.flush();
    expect(persisted).not.toBeNull();
    expect(store.errorMessage).toBeNull();
  });

  it("forceReadonly 后拒绝写入并保留提示(第二实例场景)", async () => {
    const { store, getPersisted } = makeStore();
    await store.init();
    store.forceReadonly("已有实例在运行");
    expect(store.readonlyMode).toBe(true);
    expect(store.errorMessage).toBe("已有实例在运行");
    expect(store.toggleSlot("2026-09-21", 0, "work")).toBe(false);
    await vi.advanceTimersByTimeAsync(50);
    expect(getPersisted()).toBeNull();
  });

  it("保存冲突(stale-file)给出专门提示并保留脏标记", async () => {
    let attempts = 0;
    const store = new AppStore({
      loadJson: async () => null,
      persistJson: async () => {
        attempts++;
        throw "stale-file"; // 与 bridge.ts 的 ERR_SAVE_CONFLICT 一致
      },
      debounceMs: 5,
    });
    await store.init();
    store.toggleSlot("2026-09-21", 0, "work");
    await vi.advanceTimersByTimeAsync(50);
    expect(attempts).toBe(1);
    // 用专门的冲突文案,而不是"保存失败"
    expect(store.errorMessage).toContain("已被其它程序修改");
    // 脏标记保留:下次变更会重试
    store.toggleSlot("2026-09-21", 1, "work");
    await vi.advanceTimersByTimeAsync(50);
    expect(attempts).toBe(2);
  });
});
