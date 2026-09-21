/** 日期工具:所有函数均为纯函数,日期一律以 `YYYY-MM-DD` 字符串(dayKey)表示。 */

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(s: string): boolean {
  if (!DAY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Date → dayKey(按本地时间)。 */
export function dayKeyOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayKey(now: Date = new Date()): string {
  return dayKeyOf(now);
}

/** dayKey → UTC 午夜的 Date(仅用于日期运算,不受时区影响)。 */
export function dayKeyToDate(key: string): Date | null {
  if (!isDayKey(key)) return null;
  return new Date(`${key}T00:00:00Z`);
}

/** 平移天数:负数向前。返回新的 dayKey。非法输入返回 null。 */
export function addDays(key: string, days: number): string | null {
  const d = dayKeyToDate(key);
  if (!d || !Number.isInteger(days)) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** [from, to] 之间(含端点)的 dayKey 列表。非法区间返回空数组。 */
export function dayRange(from: string, to: string): string[] {
  if (!isDayKey(from) || !isDayKey(to)) return [];
  const out: string[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 100000) {
    out.push(cur);
    const next = addDays(cur, 1);
    if (!next) break;
    cur = next;
    guard++;
  }
  return out;
}

/** 最近 n 天(含今天)的 dayKey 列表,按时间升序。 */
export function lastNDays(n: number, now: Date = new Date()): string[] {
  if (!Number.isInteger(n) || n <= 0) return [];
  const end = todayKey(now);
  const start = addDays(end, -(n - 1));
  return start ? dayRange(start, end) : [];
}

/** 一周的第一天:0=周日,1=周一(ISO)。 */
export type WeekStart = 0 | 1;

/** dayKey 所在周的起始日 dayKey。 */
export function startOfWeek(key: string, weekStart: WeekStart = 1): string | null {
  const d = dayKeyToDate(key);
  if (!d) return null;
  const dow = d.getUTCDay(); // 0..6
  const diff = (dow - weekStart + 7) % 7;
  return addDays(key, -diff);
}

/** 某月第一天/最后一天的 dayKey。 */
export function monthRange(year: number, month1to12: number): [string, string] | null {
  if (!Number.isInteger(year) || !Number.isInteger(month1to12)) return null;
  if (month1to12 < 1 || month1to12 > 12) return null;
  const first = new Date(Date.UTC(year, month1to12 - 1, 1));
  const last = new Date(Date.UTC(year, month1to12, 0));
  return [first.toISOString().slice(0, 10), last.toISOString().slice(0, 10)];
}

/** 格子下标(0..143)→ 当天分钟偏移。10 分钟一格。 */
export function posToMinutes(pos: number): number {
  return pos * 10;
}

/** 分钟偏移 → “HH:MM”。 */
export function minutesToLabel(min: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.floor(min)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** 30 分钟格子下标(0..47)→ “HH:MM”。 */
export function slotLabel(slot: number): string {
  return minutesToLabel(slot * 30);
}
