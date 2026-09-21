/**
 * 格子模型:一天 = 144 个 10 分钟位置,30 分钟格子 = 3 个连续位置。
 * 全部为纯函数,便于单元测试与模糊测试。
 */

import {
  POSITIONS_PER_DAY,
  SLOTS_PER_DAY,
  SUB_SLOTS,
  emptyDay,
  findCategory,
} from "./schema.ts";
import type { AppData } from "./schema.ts";
import { dayRange, isDayKey } from "./time.ts";
import { joinList, t } from "./i18n.ts";

export type Day = (string | null)[];

/** 取某天的数据(不存在则返回空白数组,不修改原数据)。 */
export function getDay(data: AppData, dayKey: string): Day {
  const day = data.entries[dayKey];
  if (!Array.isArray(day)) return emptyDay();
  const out = emptyDay();
  for (let i = 0; i < Math.min(day.length, POSITIONS_PER_DAY); i++) {
    const v = day[i];
    out[i] = typeof v === "string" ? v : null;
  }
  return out;
}

function ensureDay(data: AppData, dayKey: string): Day {
  if (!isDayKey(dayKey)) throw new Error(`非法日期:${dayKey}`);
  let day = data.entries[dayKey];
  if (!Array.isArray(day)) {
    day = emptyDay();
    data.entries[dayKey] = day;
  }
  return day;
}

function assertSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS_PER_DAY) {
    throw new Error(`非法格子下标:${slot}`);
  }
}

function assertSub(sub: number): void {
  if (!Number.isInteger(sub) || sub < 0 || sub >= SUB_SLOTS) {
    throw new Error(`非法细分下标:${sub}`);
  }
}

/** 把整个 30 分钟格子设为某分类(null 清除)。返回是否发生变化。 */
export function setSlot(data: AppData, dayKey: string, slot: number, categoryId: string | null): boolean {
  assertSlot(slot);
  const day = ensureDay(data, dayKey);
  const base = slot * SUB_SLOTS;
  let changed = false;
  for (let i = base; i < base + SUB_SLOTS; i++) {
    if (day[i] !== categoryId) {
      day[i] = categoryId;
      changed = true;
    }
  }
  return changed;
}

/** 设置 30 分钟格子里某一小格(10 分钟)。返回是否发生变化。 */
export function setSubSlot(
  data: AppData,
  dayKey: string,
  slot: number,
  sub: number,
  categoryId: string | null,
): boolean {
  assertSlot(slot);
  assertSub(sub);
  const day = ensureDay(data, dayKey);
  const idx = slot * SUB_SLOTS + sub;
  if (day[idx] === categoryId) return false;
  day[idx] = categoryId;
  return true;
}

/** 读格子三小格的分类。 */
export function getSlotStates(data: AppData, dayKey: string, slot: number): (string | null)[] {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS_PER_DAY) return [null, null, null];
  const day = getDay(data, dayKey);
  const base = slot * SUB_SLOTS;
  return [day[base], day[base + 1], day[base + 2]];
}

/** 单击行为:同一分类再点一次清除,否则设置为当前分类。 */
export function toggleSlot(
  data: AppData,
  dayKey: string,
  slot: number,
  categoryId: string,
): boolean {
  assertSlot(slot);
  const states = getSlotStates(data, dayKey, slot);
  const full =
    states[0] === categoryId && states[1] === categoryId && states[2] === categoryId;
  return setSlot(data, dayKey, slot, full ? null : categoryId);
}

/** 格子是否完全为空。 */
export function isSlotEmpty(data: AppData, dayKey: string, slot: number): boolean {
  return getSlotStates(data, dayKey, slot).every((v) => v === null);
}

/** 清空一天。 */
export function clearDay(data: AppData, dayKey: string): boolean {
  if (!(dayKey in data.entries)) return false;
  delete data.entries[dayKey];
  return true;
}

/** 某分类的全部标记改为另一分类(删除分类时合并数据用)。 */
export function reassignCategory(data: AppData, from: string, to: string | null): number {
  let count = 0;
  for (const day of Object.values(data.entries)) {
    if (!Array.isArray(day)) continue;
    for (let i = 0; i < day.length; i++) {
      if (day[i] === from) {
        day[i] = to;
        count++;
      }
    }
  }
  return count;
}

export interface DayTotals {
  /** categoryId → 分钟数 */
  byCategory: Record<string, number>;
  /** 已记录的总分钟数 */
  total: number;
}

/** 单天统计:每分类分钟数。 */
export function dayMinutes(data: AppData, dayKey: string): DayTotals {
  const day = getDay(data, dayKey);
  const byCategory: Record<string, number> = {};
  let total = 0;
  for (const v of day) {
    if (v !== null) {
      byCategory[v] = (byCategory[v] ?? 0) + 10;
      total += 10;
    }
  }
  return { byCategory, total };
}

export interface RangeStats {
  from: string;
  to: string;
  /** categoryId → 总分钟 */
  byCategory: Record<string, number>;
  /** 按天升序:每天每分类分钟数(仅含有记录的天) */
  perDay: { day: string; byCategory: Record<string, number>; total: number }[];
  total: number;
  /** 有记录的天数 */
  activeDays: number;
}

/** 区间统计(含端点)。非法/倒置区间返回空统计。 */
export function rangeStats(
  data: AppData,
  from: string,
  to: string,
  days?: string[],
): RangeStats {
  const empty: RangeStats = {
    from,
    to,
    byCategory: {},
    perDay: [],
    total: 0,
    activeDays: 0,
  };
  if (!isDayKey(from) || !isDayKey(to) || from > to) return empty;
  const list = days ?? [];
  const keys = days ? list.filter((d) => d >= from && d <= to) : dayRange(from, to);
  const byCategory: Record<string, number> = {};
  const perDay: RangeStats["perDay"] = [];
  let total = 0;
  let activeDays = 0;
  for (const day of keys) {
    const t = dayMinutes(data, day);
    if (t.total === 0) continue;
    activeDays++;
    total += t.total;
    for (const [cat, min] of Object.entries(t.byCategory)) {
      byCategory[cat] = (byCategory[cat] ?? 0) + min;
    }
    perDay.push({ day, byCategory: t.byCategory, total: t.total });
  }
  return { from, to, byCategory, perDay, total, activeDays };
}

export type HeatLevel = 0 | 1 | 2 | 3 | 4;

/** GitHub 提交图色阶:0 空白,1..4 由浅到深(按当天记录分钟数)。 */
export function heatLevel(minutes: number): HeatLevel {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 90) return 2;
  if (minutes < 180) return 3;
  return 4;
}

/** 热力图数据:给定升序 dayKey 列表,输出每天的色阶与分钟数。 */
export function heatmapData(
  data: AppData,
  days: string[],
): { day: string; level: HeatLevel; minutes: number }[] {
  return days.map((day) => {
    const t = dayMinutes(data, day);
    return { day, level: heatLevel(t.total), minutes: t.total };
  });
}

/** 格子的提示文本:30 分钟格子汇总其中的分类,细分小格只显示该 10 分钟。 */
export function slotTooltip(
  data: AppData,
  dayKey: string,
  slot: number,
  sub?: number,
): string {
  const start = slot * 30 + (sub !== undefined ? sub * 10 : 0);
  const span = sub !== undefined ? 10 : 30;
  const states = getSlotStates(data, dayKey, slot);
  const names = (sub !== undefined ? [states[sub]] : states)
    .filter((v): v is string => v !== null)
    .map((v) => findCategory(data, v)?.name ?? v);
  const unique = [...new Set(names)];
  const hh = (m: number): string =>
    `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return `${dayKey} ${hh(start)}–${hh(start + span)} · ${unique.length ? joinList(unique) : t("modal.unrecorded")}`;
}
