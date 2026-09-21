/**
 * 数据文件的解析、校验与迁移。
 * 任何来源的 JSON 都先经过 `loadData`:损坏的字段被修复为默认值,
 * 未来主版本的数据保持只读并给出提示,避免旧程序写坏新数据。
 */

import {
  APP_VERSION,
  DATA_VERSION,
  DEFAULT_SETTINGS,
  MORANDI_PALETTE,
  POSITIONS_PER_DAY,
  checkDataVersion,
  createDefaultData,
  emptyDay,
  isBuiltinCategory,
  isValidHexColor,
} from "./schema.ts";
import type { AppData, AppSettings, Category } from "./schema.ts";
import { isDayKey } from "./time.ts";
import { compareSemver, parseSemver } from "./version.ts";

export interface LoadResult {
  data: AppData;
  /** 从旧版本迁移而来的原版本号(无迁移为 null)。 */
  migratedFrom: string | null;
  /** 修复过的字段说明。 */
  repairs: string[];
  /** 数据来自更新版本的程序,禁止写入。 */
  readonly: boolean;
}

/** 已知的迁移路径:按“从哪个版本升上来”登记升级函数。 */
const MIGRATIONS: Record<string, (d: AppData) => void> = {
  // 1.0.0 是首个正式版本;这里保留扩展点,例如:
  // "0.9.0": (d) => { d.settings.weekStartsOn ??= 1; },
};

/** 把任意解析出的 JSON 值规整为合法 AppData,损坏字段回退默认值。 */
export function sanitizeData(raw: unknown): { data: AppData; repairs: string[] } {
  const repairs: string[] = [];
  const data = createDefaultData();
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    repairs.push("root:数据不是对象,已重置");
    return { data, repairs };
  }
  const obj = raw as Record<string, unknown>;

  // categories
  if (Array.isArray(obj.categories)) {
    const cats: Category[] = [];
    const seen = new Set<string>();
    for (const c of obj.categories) {
      const cat = sanitizeCategory(c, seen);
      if (cat) {
        seen.add(cat.id);
        cats.push(cat);
      }
    }
    if (cats.length > 0) {
      data.categories = cats;
    } else {
      repairs.push("categories:空或全部非法,已重置为默认分类");
    }
  } else if (obj.categories !== undefined) {
    repairs.push("categories:不是数组,已重置");
  }

  // entries
  if (typeof obj.entries === "object" && obj.entries !== null && !Array.isArray(obj.entries)) {
    const src = obj.entries as Record<string, unknown>;
    const entries: Record<string, (string | null)[]> = {};
    const catIds = new Set(data.categories.map((c) => c.id));
    let droppedDays = 0;
    let unknownCats = 0;
    for (const [key, value] of Object.entries(src)) {
      if (!isDayKey(key) || !Array.isArray(value)) {
        droppedDays++;
        continue;
      }
      const day = emptyDay();
      const len = Math.min(POSITIONS_PER_DAY, value.length);
      for (let i = 0; i < len; i++) {
        const v = value[i];
        if (typeof v === "string" && catIds.has(v)) day[i] = v;
        else if (v !== null && v !== undefined) unknownCats++;
      }
      entries[key] = day;
    }
    data.entries = entries;
    if (droppedDays > 0) repairs.push(`entries:丢弃 ${droppedDays} 个非法日期`);
    if (unknownCats > 0) repairs.push(`entries:清除 ${unknownCats} 个未知分类的标记`);
  } else if (obj.entries !== undefined) {
    repairs.push("entries:不是对象,已重置");
  }

  // settings
  data.settings = sanitizeSettings(obj.settings, repairs);

  return { data, repairs };
}

function sanitizeCategory(raw: unknown, taken: Set<string>): Category | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(o.id)) return null;
  if (taken.has(o.id)) return null;
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 24) : null;
  if (!name) return null;
  const color = isValidHexColor(o.color) ? o.color.toLowerCase() : MORANDI_PALETTE[0].toLowerCase();
  const builtin =
    o.builtin === "work" || o.builtin === "rest" ? (o.builtin as "work" | "rest") : undefined;
  return { id: o.id, name, color, ...(builtin ? { builtin } : {}) };
}

function sanitizeSettings(raw: unknown, repairs: string[]): AppSettings {
  const s: AppSettings = { ...DEFAULT_SETTINGS };
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    if (raw !== undefined) repairs.push("settings:不是对象,已重置");
    return s;
  }
  const o = raw as Record<string, unknown>;
  if (o.theme === "light" || o.theme === "dark" || o.theme === "system") s.theme = o.theme;
  else if (o.theme !== undefined) repairs.push("settings.theme:非法,已重置");
  if (isValidHexColor(o.accentColor)) s.accentColor = o.accentColor.toLowerCase();
  else if (o.accentColor !== undefined) repairs.push("settings.accentColor:非法,已重置");
  if (o.weekStartsOn === 0 || o.weekStartsOn === 1) s.weekStartsOn = o.weekStartsOn;
  if (typeof o.autoStart === "boolean") s.autoStart = o.autoStart;
  return s;
}

/**
 * 从 JSON 字符串加载并迁移数据。统一流程:
 * 解析 → 判定版本(缺失/非法视为旧数据)→ 迁移 → 清洗 → 给出只读与修复信息。
 * 只读:数据主版本高于当前程序时,允许查看但拒绝写盘。
 */
export function loadData(json: string | null | undefined): LoadResult {
  if (json === null || json === undefined || json.trim() === "") {
    return { data: createDefaultData(), migratedFrom: null, repairs: [], readonly: false };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {
      data: createDefaultData(),
      migratedFrom: null,
      repairs: ["JSON 解析失败,已创建新数据"],
      readonly: false,
    };
  }

  const version = typeof (raw as Record<string, unknown>)?.version === "string"
    ? ((raw as Record<string, unknown>).version as string)
    : null;
  const repairs: string[] = [];
  let migratedFrom: string | null = null;

  if (version === null) {
    repairs.push("缺少 version,已按当前格式重建");
  } else if (parseSemver(version) === null) {
    // 非法版本号当作未知旧数据处理,清洗后写回当前版本
    repairs.push(`version:"${version}" 非法,已按当前格式重建`);
    migratedFrom = version;
  }

  const known = version !== null && parseSemver(version) !== null;
  const readonly = known ? !checkDataVersion(version).ok : false;
  if (readonly) {
    migratedFrom = version;
  }

  const migrated = known && !readonly ? applyMigrations(raw as Record<string, unknown>, version) : raw;
  const { data, repairs: sanitizeRepairs } = sanitizeData(migrated);
  if (known && !readonly && version !== DATA_VERSION && !migratedFrom) {
    migratedFrom = version; // 经迁移升级到当前版本
  }
  return { data, migratedFrom, repairs: [...repairs, ...sanitizeRepairs], readonly };
}

/**
 * 依序执行 MIGRATIONS 中登记的升级函数,直到没有下一步可走。
 * 迁移函数在 AppData 形状上补充新字段即可,之后总有 sanitizeData 兜底清洗。
 */
function applyMigrations(raw: Record<string, unknown>, version: string): unknown {
  let cur: Record<string, unknown> = raw;
  let curVersion = version;
  for (let steps = 0; steps < 64; steps++) {
    const step = MIGRATIONS[curVersion];
    if (!step) break;
    const draft = { ...cur } as unknown as AppData;
    step(draft);
    const next = String(draft.version);
    const cmp = compareSemver(next, curVersion);
    if (cmp === null || cmp <= 0) break; // 迁移函数必须抬高版本号,否则视为完成
    cur = draft as unknown as Record<string, unknown>;
    curVersion = next;
  }
  return cur;
}

/** 序列化为待保存的 JSON:盖章当前 schema/应用版本,裁剪空日期,内置分类保留标记。 */
export function serializeData(data: AppData): string {
  const entries: Record<string, (string | null)[]> = {};
  for (const [key, day] of Object.entries(data.entries)) {
    if (!Array.isArray(day)) continue;
    if (day.every((v) => v === null)) continue; // 空日期不落盘
    entries[key] = day;
  }
  const out: AppData = {
    ...data,
    // 保存即代表数据符合当前 schema,版本号以当前程序为准
    version: DATA_VERSION,
    appVersion: APP_VERSION,
    categories: data.categories.map((c) =>
      isBuiltinCategory(c) ? { ...c } : { id: c.id, name: c.name, color: c.color },
    ),
    entries,
  };
  return JSON.stringify(out, null, 2);
}
