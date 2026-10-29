/**
 * 未记录提醒:工作时段内每隔 2 小时检查一次,当天还没有任何记录时
 * 弹一条系统通知。默认关闭,由设置里的开关(AppSettings.remindRecord)
 * 控制;开关打开时顺带请求通知权限,避免权限弹窗出现在两小时之后。
 *
 * 检查节奏:每分钟醒来看一眼(开销可忽略),但按 REMIND_INTERVAL_MIN
 * 节流,一次运行内最多每 2 小时提醒一次;记录了数据或超出工作时段则安静。
 */

import { isTauri } from "./bridge.ts";
import { dayMinutes } from "./logic/model.ts";
import { todayKey } from "./logic/time.ts";
import { shouldRemind } from "./logic/reminder.ts";
import { t } from "./logic/i18n.ts";
import type { AppStore } from "./state.ts";

const TICK_MS = 60_000;

export interface RecordReminder {
  stop: () => void;
}

/** 请求系统通知权限(在 Tauri 环境下)。返回是否已授予。 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (!isTauri) return false;
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted) granted = (await mod.requestPermission()) === "granted";
    return granted;
  } catch {
    return false;
  }
}

async function sendRecordNotification(): Promise<void> {
  if (!(await ensureNotificationPermission())) return;
  const { sendNotification } = await import("@tauri-apps/plugin-notification");
  sendNotification({ title: t("remind.recordTitle"), body: t("remind.recordBody") });
}

export function createRecordReminder(store: AppStore): RecordReminder {
  let lastNotifiedAt: number | null = null;

  const tick = (): void => {
    if (!store.data.settings.remindRecord) return;
    if (store.readonlyMode) return;
    const now = new Date();
    const hasRecord = dayMinutes(store.data, todayKey(now)).total > 0;
    const minutesSinceLast =
      lastNotifiedAt === null ? null : (now.getTime() - lastNotifiedAt) / 60_000;
    if (!shouldRemind({ hour: now.getHours(), minutesSinceLast, hasRecordToday: hasRecord })) return;
    lastNotifiedAt = now.getTime();
    void sendRecordNotification().catch(() => {});
  };

  const timer = setInterval(tick, TICK_MS);
  return {
    stop: () => clearInterval(timer),
  };
}
