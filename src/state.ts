/**
 * 应用状态存储:持有数据与视图状态,所有变更都触发订阅者通知,
 * 并对数据做防抖持久化。持久化通过注入函数完成(便于测试)。
 */

import { loadData, serializeData } from "./logic/migrate.ts";
import type { LoadResult } from "./logic/migrate.ts";
import { findCategory } from "./logic/schema.ts";
import type { AppData, Category } from "./logic/schema.ts";
import { todayKey } from "./logic/time.ts";
import { t } from "./logic/i18n.ts";

export type Unsubscribe = () => void;

export interface StoreEvents {
  /** 数据内容变化(需要重渲染) */
  data: void;
  /** 仅视图状态变化(选中分类、当前日期等) */
  view: void;
}

type Handler = () => void;

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

export class AppStore {
  data!: AppData;
  loadResult!: LoadResult;
  /** 当前查看的日期(视图状态) */
  viewDay: string;
  /** 当前选中的分类(视图状态) */
  selectedCategoryId: string | null;
  /** 是否允许写入(数据来自更高版本时只读) */
  readonlyMode = false;

  private handlers: { data: Set<Handler>; view: Set<Handler> } = {
    data: new Set(),
    view: new Set(),
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
    const json = await this.deps.loadJson();
    const result = loadData(json);
    this.data = result.data;
    this.loadResult = result;
    this.readonlyMode = result.readonly;
    if (!findCategory(this.data, this.selectedCategoryId)) {
      this.selectedCategoryId = this.data.categories[0]?.id ?? null;
    }
    this.emit("data");
  }

  on(event: keyof StoreEvents, handler: Handler): Unsubscribe {
    this.handlers[event].add(handler);
    return () => this.handlers[event].delete(handler);
  }

  private emit(event: keyof StoreEvents): void {
    for (const h of Array.from(this.handlers[event])) h();
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
    this.dirty = false;
    await this.deps.persistJson(serializeData(this.data));
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

  /** 删除分类(内置分类不可删):其数据标记一并清除。 */
  removeCategory(id: string): boolean {
    const cat = findCategory(this.data, id);
    if (!cat || cat.builtin) return false;
    this.data = {
      ...this.data,
      categories: this.data.categories.filter((c) => c.id !== id),
    };
    for (const day of Object.values(this.data.entries)) {
      if (!Array.isArray(day)) continue;
      for (let i = 0; i < day.length; i++) if (day[i] === id) day[i] = null;
    }
    if (this.selectedCategoryId === id) {
      this.selectedCategoryId = this.data.categories[0]?.id ?? null;
    }
    this.changed();
    this.emit("view");
    return true;
  }
}
