/**
 * 数据模型与常量。
 * 数据以 JSON 存储,根对象带语义版本号 `version`,方便分享与迁移。
 * 一天的数据是长度 144 的数组:每 10 分钟一个位置,30 分钟格子 = 3 个连续位置。
 */

import { detectLocale, t } from "./i18n.ts";
import type { Locale } from "./i18n.ts";
import { compareSemver } from "./version.ts";

/** 数据文件的 schema 版本(语义版本号)。 */
export const DATA_VERSION = "1.0.0";
/** 当前应用版本(与 package.json / Cargo.toml 保持一致)。 */
export const APP_VERSION = "1.0.0";

export const SLOTS_PER_DAY = 48; // 24h × 30min
export const SUB_SLOTS = 3; // 弹窗把 30 分钟切成 3 份
export const POSITIONS_PER_DAY = SLOTS_PER_DAY * SUB_SLOTS; // 144 = 10 分钟一格

/** 分类:工作/休息为内置,其余为自定义;颜色默认取莫兰迪色。 */
export interface Category {
  id: string;
  name: string;
  color: string;
  builtin?: "work" | "rest";
}

export type ThemeMode = "system" | "light" | "dark";

export interface AppSettings {
  theme: ThemeMode;
  accentColor: string;
  weekStartsOn: 0 | 1;
  autoStart: boolean;
  /** 界面语言;随数据持久化,缺省时按系统语言探测。 */
  locale: Locale;
}

export interface AppData {
  version: string;
  appVersion: string;
  createdAt?: string;
  categories: Category[];
  /** dayKey → 长度 144 的 (categoryId | null) 数组 */
  entries: Record<string, (string | null)[]>;
  settings: AppSettings;
}

/** 默认主题色:浅绿色(与应用图标一致)。统一使用小写十六进制。 */
export const DEFAULT_ACCENT = "#8fcba8";

/** 莫兰迪色板:分类与主题色的默认候选。 */
export const MORANDI_PALETTE: string[] = [
  "#9CAF9F", // 灰绿
  "#A2B9C7", // 灰蓝
  "#C8B6A6", // 灰棕
  "#B8A9C0", // 灰紫
  "#C7A4A0", // 灰粉
  "#A8B5A0", // 橄榄灰
  "#B5B8C4", // 蓝灰
  "#C4C0A8", // 苔藓黄
  "#A9BCB2", // 青灰绿
  "#C2A8B0", // 干玫瑰
  "#8FB6A8", // 浅青绿
  "#BFAD9E", // 浅驼
];

/** 主题色候选(浅绿优先,其后为莫兰迪色)。 */
export const ACCENT_CHOICES: string[] = [
  DEFAULT_ACCENT,
  "#6FBF8E",
  "#5FA77D",
  ...MORANDI_PALETTE.slice(0, 6),
];

/**
 * 内置分类(工作/休息)。名称在创建数据时按当前语言生成,
 * 之后作为用户数据处理——切换语言不会改写已有数据的名称。
 */
export function defaultCategories(): Category[] {
  return [
    { id: "work", name: t("cat.work"), color: MORANDI_PALETTE[0], builtin: "work" },
    { id: "rest", name: t("cat.rest"), color: MORANDI_PALETTE[1], builtin: "rest" },
  ];
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  accentColor: DEFAULT_ACCENT,
  weekStartsOn: 1,
  autoStart: false,
  locale: detectLocale(),
};

export function emptyDay(): (string | null)[] {
  return new Array<string | null>(POSITIONS_PER_DAY).fill(null);
}

export function createDefaultData(): AppData {
  return {
    version: DATA_VERSION,
    appVersion: APP_VERSION,
    createdAt: new Date().toISOString(),
    categories: defaultCategories(),
    entries: {},
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** 颜色格式校验:#RRGGBB。 */
export function isValidHexColor(s: unknown): s is string {
  return typeof s === "string" && /^#[0-9a-fA-F]{6}$/.test(s);
}

/** 生成的分类 id。 */
export function newCategoryId(): string {
  const rnd = crypto.getRandomValues(new Uint8Array(6));
  return "c_" + Array.from(rnd, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** 按 id 查找分类。 */
export function findCategory(data: AppData, id: string | null): Category | undefined {
  if (!id) return undefined;
  return data.categories.find((c) => c.id === id);
}

/** 内置分类(工作/休息)不可删除。 */
export function isBuiltinCategory(c: Category): boolean {
  return c.builtin === "work" || c.builtin === "rest";
}

/** schema 兼容性:数据版本是否可由当前程序打开。 */
export function checkDataVersion(dataVersion: string): {
  ok: boolean;
  reason?: "newer-major" | "invalid";
} {
  const c = compareSemver(dataVersion, DATA_VERSION);
  if (c === null) return { ok: false, reason: "invalid" };
  const majorCurrent = Number(DATA_VERSION.split(".")[0]);
  const majorData = Number(dataVersion.split(".")[0]);
  if (majorData > majorCurrent) return { ok: false, reason: "newer-major" };
  return { ok: true };
}
