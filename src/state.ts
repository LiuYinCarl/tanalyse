/**
 * 应用状态存储:持有数据与视图状态,所有变更都触发订阅者通知,
 * 并对数据做防抖持久化。持久化通过注入函数完成(便于测试)。
 *
 * 数据所有权约定:AppStore 独占 `data`;任何写入都必须经过 store 的方法
 * (含分类、设置、格子),由 store 统一 `changed()`/落盘。`logic/model.ts`
 * 里那些"原地修改"的函数是 store 的内部实现细节,UI 层不要直接调用后
 * 手动 `notifyDataChanged`。`notifyDataChanged` 仅保留给确实在 store 之外
 * 改过数据的调用方(目前只有测试),新代码请优先用 store 方法。
 */

import { loadData, serializeData } from "./logic/migrate.ts";
import type { LoadResult } from "./logic/migrate.ts";
import { ERR_SAVE_CONFLICT } from "./bridge.ts";
import { findCategory } from "./logic/schema.ts";
import type { AppData, Category } from "./logic/schema.ts";
import {
  setSlot as modelSetSlot,
  setSubSlot as modelSetSubSlot,
  toggleSlot as modelToggleSlot,
} from "./logic/model.ts";
import { todayKey } from "./logic/time.ts";
import { t } from "./logic/i18n.ts";

export type Unsubscribe = () => void;

export interface StoreEvents {
  /** 数据内容变化(需要重渲染) */
  data: void;
  /** 仅视图状态变化(选中分类、当前日期等) */
  view: void;
  /** 加载/保存失败;空字符串表示错误已清除 */
  error: string;
}

type Handler = () => void;
type ErrorHandler = (message: string) => void;

export interface StoreDeps {
  /** 读取原始 JSON(启动时调用一次) */
  loadJson: () => Promise<string | null>;
  /** 持久化 JSON(防抖后调用) */
  persistJson: (json: string) => Promise<void>;
  /** 防抖毫秒数 */
  debounceMs?: number;
}

/** 以注入的持久化函数构造时刻,返回默认视图日期(今天)。 */
function defaultViewDay(now: Date): string {
  return todayKey(now);
}

/** 把任意异常整理成可展示的一行文本。 */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}

export class AppStore {
  data!: AppData;
  loadResult!: LoadResult;
  /** 当前查看的日期(视图状态) */
  viewDay: string;
  /** 当前选中的分类(视图状态) */
  selectedCategoryId: string | null;
  /** 是否允许写入(数据来自更高版本时只读) */
  readonlyMode = false;
  /** 最近一次加载/保存失败的本地化提示;null 表示无错误 */
  errorMessage: string | null = null;

  private handlers: { data: Set<Handler>; view: Set<Handler>; error: Set<ErrorHandler> } = {
    data: new Set(),
    view: new Set(),
    error: new Set(),
  };
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private deps: StoreDeps;

  constructor(deps: StoreDeps, now: Date = new Date()) {
    this.deps = deps;
    const initial = loadData(null);
    this.data = initial.data;
    this.loadResult = initial;
    this.readonlyMode = initial.readonly;
    this.viewDay = defaultViewDay(now);
    this.selectedCategoryId = initial.data.categories[0]?.id ?? null;
  }

  /** 启动:从后端读取数据。 */
  async init(): Promise<void> {
    let json: string | null = null;
    let loadFailed = false;
    try {
      json = await this.deps.loadJson();
    } catch (e) {
      // 读取失败时不能拿默认数据回写磁盘(会覆盖真实数据),因此进入只读。
      loadFailed = true;
      this.setError(t("error.loadFailed", { msg: describeError(e) }));
    }
    const result = loadData(json);
    this.data = result.data;
    this.loadResult = result;
    this.readonlyMode = result.readonly || loadFailed;
    if (!findCategory(this.data, this.selectedCategoryId)) {
      this.selectedCategoryId = this.data.categories[0]?.id ?? null;
    }
    this.emit("data");
  }

  on(event: "data" | "view", handler: Handler): Unsubscribe;
  on(event: "error", handler: ErrorHandler): Unsubscribe;
  on(event: "data" | "view" | "error", handler: Handler | ErrorHandler): Unsubscribe {
    const set = this.handlers[event] as Set<Handler | ErrorHandler>;
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  private emit(event: "data" | "view"): void {
    for (const h of Array.from(this.handlers[event])) h();
  }

  /** 记录并广播错误(传 null 清除)。 */
  private setError(message: string | null): void {
    this.errorMessage = message;
    for (const h of Array.from(this.handlers.error)) h(message ?? "");
  }

  /**
   * 因运行环境强制只读(例如已有实例在写同一份数据),并把原因显示在通知条。
   * 只读下所有写入与落盘都会被拒绝。
   */
  forceReadonly(message: string): void {
    this.readonlyMode = true;
    this.setError(message);
  }

  /** 数据变更后调用:通知渲染并安排持久化。 */
  private changed(): void {
    this.emit("data");
    this.schedulePersist();
  }

  private schedulePersist(): void {
    if (this.readonlyMode) return;
    this.dirty = true;
    if (this.timer !== null) return;
    const ms = this.deps.debounceMs ?? 400;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, ms);
  }

  /** 立即写盘(若脏)。 */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    const snapshot = serializeData(this.data);
    this.dirty = false;
    try {
      await this.deps.persistJson(snapshot);
      // 上一次失败过、这次成功了:清掉错误提示
      if (this.errorMessage) this.setError(null);
    } catch (e) {
      // 写盘失败:保留脏标记(下次变更/手动 flush 会重试),并把错误暴露给界面,
      // 避免"以为已保存、其实没写进去"的静默丢数据。
      this.dirty = true;
      const raw = describeError(e);
      // 保存冲突(磁盘文件被外部改动)有专门的提示与处置建议
      this.setError(
        raw === ERR_SAVE_CONFLICT ? t("error.saveConflict") : t("error.saveFailed", { msg: raw }),
      );
    }
  }

  /** 外部(如弹窗)直接修改 data 后调用:通知渲染并安排持久化。 */
  notifyDataChanged(): void {
    this.changed();
  }

  // ---- 视图状态 ----

  setViewDay(day: string): void {
    if (day === this.viewDay) return;
    this.viewDay = day;
    this.emit("view");
  }

  selectCategory(id: string | null): void {
    if (id === this.selectedCategoryId) return;
    this.selectedCategoryId = id;
    this.emit("view");
  }

  // ---- 数据变更 ----

  replaceData(next: AppData): void {
    this.data = next;
    this.loadResult = {
      data: next,
      migratedFrom: this.loadResult.migratedFrom,
      repairs: [t("state.imported")],
      readonly: false,
    };
    this.readonlyMode = false;
    if (!findCategory(this.data, this.selectedCategoryId)) {
      this.selectedCategoryId = this.data.categories[0]?.id ?? null;
    }
    this.changed();
  }

  updateSettings(patch: Partial<AppData["settings"]>): void {
    this.data = { ...this.data, settings: { ...this.data.settings, ...patch } };
    this.changed();
    this.emit("view");
  }

  addCategory(cat: Category): void {
    if (this.data.categories.some((c) => c.id === cat.id)) return;
    this.data = { ...this.data, categories: [...this.data.categories, cat] };
    if (!this.selectedCategoryId) this.selectedCategoryId = cat.id;
    this.changed();
    this.emit("view");
  }

  updateCategory(id: string, patch: Partial<Omit<Category, "id" | "builtin">>): void {
    this.data = {
      ...this.data,
      categories: this.data.categories.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    };
    this.changed();
    this.emit("view");
  }

  // ---- 格子写入(统一入口:调用 model 的修改器,再统一通知 + 落盘) ----

  /** 整格写入(null 清除)。返回是否发生变化。 */
  setSlot(dayKey: string, slot: number, categoryId: string | null): boolean {
    if (this.readonlyMode) return false;
    if (!modelSetSlot(this.data, dayKey, slot, categoryId)) return false;
    this.changed();
    return true;
  }

  /** 单击行为:同一分类再点一次清除,否则填入该分类。 */
  toggleSlot(dayKey: string, slot: number, categoryId: string): boolean {
    if (this.readonlyMode) return false;
    if (!modelToggleSlot(this.data, dayKey, slot, categoryId)) return false;
    this.changed();
    return true;
  }

  /** 10 分钟小格写入。返回是否发生变化。 */
  setSubSlot(dayKey: string, slot: number, sub: number, categoryId: string | null): boolean {
    if (this.readonlyMode) return false;
    if (!modelSetSubSlot(this.data, dayKey, slot, sub, categoryId)) return false;
    this.changed();
    return true;
  }

  /** 删除分类(内置分类不可删):其数据标记一并清除。 */
  removeCategory(id: string): boolean {
    const cat = findCategory(this.data, id);
    if (!cat || cat.builtin) return false;
    // 重建 entries(而不是原地改嵌套数组),与其它写操作保持同一"换新对象"风格
    const entries: AppData["entries"] = {};
    for (const [day, marks] of Object.entries(this.data.entries)) {
      entries[day] = Array.isArray(marks) ? marks.map((v) => (v === id ? null : v)) : marks;
    }
    this.data = {
      ...this.data,
      categories: this.data.categories.filter((c) => c.id !== id),
      entries,
    };
    if (this.selectedCategoryId === id) {
      this.selectedCategoryId = this.data.categories[0]?.id ?? null;
    }
    this.changed();
    this.emit("view");
    return true;
  }
}
