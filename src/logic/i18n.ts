/**
 * 中英文文案与本地化格式化。
 *
 * 结构:zh 表定义全部键(单一事实来源),en 表以类型约束补齐——
 * 少一个键会在编译期报错,避免文案漂移。语言偏好持久化在数据 JSON 的
 * settings.locale 中(见 schema/migrate);模块内状态由 main 在数据
 * 事件里用 setLocale 同步,渲染层在渲染时调用 t() 取词。
 */

import { dayKeyToDate, isDayKey } from "./time.ts";

export type Locale = "zh" | "en";

const zh = {
  "tab.grid": "格子",
  "tab.stats": "统计",
  "tab.settings": "设置",

  "grid.today": "今天",
  "grid.prevDay": "前一天",
  "grid.nextDay": "后一天",
  "grid.hint": "单击填入所选分类 · 双击切分 10 分钟 · 右键清除",
  "grid.addCategory": "+ 分类",
  "grid.manageCategories": "管理分类",

  "heatmap.weeks": "近 {n} 周",
  "heatmap.less": "少",
  "heatmap.more": "多",
  "heatmap.aria": "近 {n} 周时间记录热力图",
  "heatmap.noRecord": "无记录",

  "modal.eachTen": "每个小格 10 分钟",
  "modal.empty": "空",
  "modal.clear": "清空",
  "modal.done": "完成",
  "modal.unrecorded": "未记录",

  "stats.range7d": "近 7 天",
  "stats.range30d": "近 30 天",
  "stats.range90d": "近 90 天",
  "stats.rangeAll": "全部",
  "stats.total": "累计记录",
  "stats.activeDays": "有记录天数",
  "stats.daily": "日均",
  "stats.pieTitle": "分类占比",
  "stats.lineTitle": "随时间变化",
  "stats.empty": "该时间段还没有记录",
  "stats.unknown": "未知",

  "settings.appearance": "外观",
  "settings.theme": "主题",
  "settings.themeSystem": "跟随系统",
  "settings.themeLight": "浅色",
  "settings.themeDark": "深色",
  "settings.accent": "主题色",
  "settings.language": "语言",
  "settings.categories": "分类管理",
  "settings.categoriesDesc":
    "工作与休息为内置分类,可改名换色;自定义分类可删除。颜色取自莫兰迪色板。",
  "settings.newCategoryPlaceholder": "新分类名称…",
  "settings.add": "新增",
  "settings.delete": "删除",
  "settings.general": "通用",
  "settings.autoStart": "开机自启",
  "settings.weekStart": "一周起始",
  "settings.monday": "周一",
  "settings.sunday": "周日",
  "settings.data": "数据",
  "settings.dataFile": "数据文件",
  "settings.loading": "加载中…",
  "settings.openLocation": "打开位置",
  "settings.share": "导出 / 分享",
  "settings.exportJson": "导出 JSON…",
  "settings.importJson": "导入 JSON…",
  "settings.versionLine": "应用 v{app} · 数据格式 v{schema}",

  "titlebar.close": "关闭",
  "titlebar.minimize": "最小化",
  "titlebar.maximize": "最大化/还原",

  "notice.repaired": "数据已自动修复:{msg}",
  "notice.readonly":
    "此数据文件由更新版本的 tanalyse 创建,当前版本以只读模式运行,修改不会被保存。",
  "state.imported": "已导入新数据",

  "repair.jsonParse": "JSON 解析失败,已创建新数据",
  "repair.missingVersion": "缺少 version,已按当前格式重建",
  "repair.invalidVersion": 'version:"{v}" 非法,已按当前格式重建',
  "repair.categoriesReset": "categories:空或全部非法,已重置为默认分类",
  "repair.categoriesNotArray": "categories:不是数组,已重置",
  "repair.entriesDropped": "entries:丢弃 {n} 个非法日期",
  "repair.entriesUnknown": "entries:清除 {n} 个未知分类的标记",
  "repair.entriesReset": "entries:不是对象,已重置",
  "repair.settingsReset": "settings:不是对象,已重置",
  "repair.themeReset": "settings.theme:非法,已重置",
  "repair.accentReset": "settings.accentColor:非法,已重置",
  "repair.localeReset": "settings.locale:非法,已重置",

  "cat.work": "工作",
  "cat.rest": "休息",

  "format.zero": "0 分钟",
  "format.minutes": "{n} 分钟",
  "format.hours": "{n} 小时",
  "format.hourMinute": "{h} 小时 {m} 分",

  "weekday.0": "日",
  "weekday.1": "一",
  "weekday.2": "二",
  "weekday.3": "三",
  "weekday.4": "四",
  "weekday.5": "五",
  "weekday.6": "六",
  "month.0": "1月",
  "month.1": "2月",
  "month.2": "3月",
  "month.3": "4月",
  "month.4": "5月",
  "month.5": "6月",
  "month.6": "7月",
  "month.7": "8月",
  "month.8": "9月",
  "month.9": "10月",
  "month.10": "11月",
  "month.11": "12月",
};

export type MsgKey = keyof typeof zh;

const en: Record<MsgKey, string> = {
  "tab.grid": "Grid",
  "tab.stats": "Stats",
  "tab.settings": "Settings",

  "grid.today": "Today",
  "grid.prevDay": "Previous day",
  "grid.nextDay": "Next day",
  "grid.hint":
    "Click to fill with the selected category · Double-click for 10-minute segments · Right-click to clear",
  "grid.addCategory": "+ Category",
  "grid.manageCategories": "Manage categories",

  "heatmap.weeks": "Last {n} weeks",
  "heatmap.less": "Less",
  "heatmap.more": "More",
  "heatmap.aria": "Time recorded over the last {n} weeks",
  "heatmap.noRecord": "No record",

  "modal.eachTen": "Each segment is 10 minutes",
  "modal.empty": "Empty",
  "modal.clear": "Clear",
  "modal.done": "Done",
  "modal.unrecorded": "Unrecorded",

  "stats.range7d": "Last 7 days",
  "stats.range30d": "Last 30 days",
  "stats.range90d": "Last 90 days",
  "stats.rangeAll": "All time",
  "stats.total": "Total recorded",
  "stats.activeDays": "Days with records",
  "stats.daily": "Daily average",
  "stats.pieTitle": "Share by category",
  "stats.lineTitle": "Time over days",
  "stats.empty": "No records in this period",
  "stats.unknown": "Unknown",

  "settings.appearance": "Appearance",
  "settings.theme": "Theme",
  "settings.themeSystem": "System",
  "settings.themeLight": "Light",
  "settings.themeDark": "Dark",
  "settings.accent": "Accent color",
  "settings.language": "Language",
  "settings.categories": "Categories",
  "settings.categoriesDesc":
    "Work and Rest are built-in and can be renamed or recolored; custom categories can be deleted. Colors come from a Morandi palette.",
  "settings.newCategoryPlaceholder": "New category name…",
  "settings.add": "Add",
  "settings.delete": "Delete",
  "settings.general": "General",
  "settings.autoStart": "Launch at login",
  "settings.weekStart": "Week starts on",
  "settings.monday": "Mon",
  "settings.sunday": "Sun",
  "settings.data": "Data",
  "settings.dataFile": "Data file",
  "settings.loading": "Loading…",
  "settings.openLocation": "Reveal",
  "settings.share": "Export / Share",
  "settings.exportJson": "Export JSON…",
  "settings.importJson": "Import JSON…",
  "settings.versionLine": "App v{app} · Data schema v{schema}",

  "titlebar.close": "Close",
  "titlebar.minimize": "Minimize",
  "titlebar.maximize": "Maximize/Restore",

  "notice.repaired": "Data auto-repaired: {msg}",
  "notice.readonly":
    "This data file was created by a newer version of tanalyse. It runs in read-only mode; changes will not be saved.",
  "state.imported": "Imported new data",

  "repair.jsonParse": "JSON failed to parse; started fresh",
  "repair.missingVersion": 'Missing "version"; rebuilt in the current format',
  "repair.invalidVersion": 'Invalid version "{v}"; rebuilt in the current format',
  "repair.categoriesReset": "categories: empty or invalid; reset to defaults",
  "repair.categoriesNotArray": "categories: not an array; reset",
  "repair.entriesDropped": "entries: dropped {n} invalid days",
  "repair.entriesUnknown": "entries: cleared {n} marks with unknown categories",
  "repair.entriesReset": "entries: not an object; reset",
  "repair.settingsReset": "settings: not an object; reset",
  "repair.themeReset": "settings.theme: invalid; reset",
  "repair.accentReset": "settings.accentColor: invalid; reset",
  "repair.localeReset": "settings.locale: invalid; reset",

  "cat.work": "Work",
  "cat.rest": "Rest",

  "format.zero": "0 min",
  "format.minutes": "{n} min",
  "format.hours": "{n} h",
  "format.hourMinute": "{h} h {m} min",

  "weekday.0": "Sun",
  "weekday.1": "Mon",
  "weekday.2": "Tue",
  "weekday.3": "Wed",
  "weekday.4": "Thu",
  "weekday.5": "Fri",
  "weekday.6": "Sat",
  "month.0": "Jan",
  "month.1": "Feb",
  "month.2": "Mar",
  "month.3": "Apr",
  "month.4": "May",
  "month.5": "Jun",
  "month.6": "Jul",
  "month.7": "Aug",
  "month.8": "Sep",
  "month.9": "Oct",
  "month.10": "Nov",
  "month.11": "Dec",
};

const TABLES: Record<Locale, Record<MsgKey, string>> = { zh, en };

let current: Locale = detectLocale();

/** 从运行环境探测默认语言;无法识别时回退英文。 */
export function detectLocale(): Locale {
  const lang =
    typeof navigator !== "undefined" && typeof navigator.language === "string"
      ? navigator.language
      : "en";
  return lang.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export function getLocale(): Locale {
  return current;
}

export function setLocale(locale: Locale): void {
  if (locale !== "zh" && locale !== "en") return;
  current = locale;
}

/** 取文案并做 {name} 插值;未知键原样返回键名(便于发现缺失)。 */
export function t(key: MsgKey, params?: Record<string, string | number>): string {
  let text = TABLES[current][key] ?? key;
  for (const [name, value] of Object.entries(params ?? {})) {
    text = text.replaceAll(`{${name}}`, String(value));
  }
  return text;
}

/** 列表连接符:中文顿号,英文逗号。 */
export function joinList(items: string[]): string {
  return items.join(current === "zh" ? "、" : ", ");
}

/** 分钟数 → 本地化时长:0 分钟 / 45 分钟 / 1 小时 / 2 小时 5 分。 */
export function formatMinutes(min: number): string {
  if (!Number.isFinite(min) || min <= 0) return t("format.zero");
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h === 0) return t("format.minutes", { n: m });
  if (m === 0) return t("format.hours", { n: h });
  return t("format.hourMinute", { h, m });
}

/** dayKey → “2026-09-21 周一” / “Mon, 2026-09-21”。非法键原样返回。 */
export function formatDayLabel(key: string): string {
  if (!isDayKey(key)) return key;
  const dow = dayKeyToDate(key)!.getUTCDay();
  const weekday = t(`weekday.${dow}` as MsgKey);
  return current === "zh" ? `${key} 周${weekday}` : `${weekday}, ${key}`;
}

/** 星期短名(dow:0=周日)与月份短名(month:0..11),供热力图使用。 */
export function weekdayShort(dow: number): string {
  return t(`weekday.${dow}` as MsgKey);
}

export function monthLabel(month: number): string {
  return t(`month.${month}` as MsgKey);
}
