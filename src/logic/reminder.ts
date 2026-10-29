/**
 * 未记录提醒的判定逻辑(纯函数,便于单测):
 * 工作时段内、当天还没有任何记录、且距上次提醒满间隔,才提醒一次。
 * 开关默认关闭,由用户在设置里打开(见 AppSettings.remindRecord)。
 */

/** 提醒间隔:2 小时。 */
export const REMIND_INTERVAL_MIN = 120;
/** 工作时段(本地时间):9:00 起、19:00 前,含头不含尾。 */
export const REMIND_START_HOUR = 9;
export const REMIND_END_HOUR = 19;

export interface RemindInput {
  /** 当前小时(0..23,本地时间) */
  hour: number;
  /** 距上次提醒的分钟数;本次运行还没提醒过为 null */
  minutesSinceLast: number | null;
  /** 今天是否已有任意记录 */
  hasRecordToday: boolean;
}

/** 小时是否落在工作时段。 */
export function inWorkHours(hour: number): boolean {
  return (
    Number.isInteger(hour) &&
    hour >= REMIND_START_HOUR &&
    hour < REMIND_END_HOUR
  );
}

/** 是否应该弹未记录提醒。 */
export function shouldRemind({ hour, minutesSinceLast, hasRecordToday }: RemindInput): boolean {
  if (hasRecordToday) return false;
  if (!inWorkHours(hour)) return false;
  if (minutesSinceLast === null) return true;
  return minutesSinceLast >= REMIND_INTERVAL_MIN;
}
