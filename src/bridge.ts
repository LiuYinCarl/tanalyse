/**
 * 与 Tauri 后端通信的桥接层。
 * 在纯浏览器里(开发/测试)自动降级到 localStorage,便于 UI 调试。
 */

import { APP_VERSION } from "./logic/schema.ts";

/**
 * 与 Rust `commands.rs` 的 `invoke_handler!` 一一对应的命令清单。
 * 单一来源:`Cmd` 类型从这里派生,并有测试比对 Rust 侧,避免两份清单漂移。
 */
export const COMMANDS = [
  "app_version",
  "is_secondary_instance",
  "set_window_theme",
  "get_data_path",
  "load_data",
  "save_data",
  "export_data_to",
  "import_data_from",
] as const;

export type Cmd = (typeof COMMANDS)[number];

/**
 * 后端"数据文件被外部改动、拒绝覆盖"的错误标识。
 * 与 Rust commands.rs 的 `SAVE_CONFLICT` 保持一致;有测试断言两边相同。
 */
export const ERR_SAVE_CONFLICT = "stale-file";

const LS_KEY = "tanalyse-data";

export const isTauri: boolean =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

async function tauriInvoke<T>(cmd: Cmd, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(cmd, args);
}

function browserFallback<T>(cmd: Cmd, args?: Record<string, unknown>): Promise<T> {
  switch (cmd) {
    case "get_data_path":
      return Promise.resolve("浏览器模式:/localstorage/tanalyse-data.json" as T);
    case "load_data":
      return Promise.resolve((localStorage.getItem(LS_KEY) ?? null) as T);
    case "save_data":
      localStorage.setItem(LS_KEY, String(args?.json ?? ""));
      return Promise.resolve(null as T);
    case "export_data_to":
      return Promise.resolve(null as T);
    case "import_data_from":
      return Promise.resolve((localStorage.getItem(LS_KEY) ?? "{}") as T);
    case "app_version":
      return Promise.resolve(APP_VERSION as T);
    case "is_secondary_instance":
      // 浏览器预览没有第二实例的概念
      return Promise.resolve(false as T);
    case "set_window_theme":
      // 浏览器没有原生窗口层,主题只由 CSS 变量承担
      return Promise.resolve(null as T);
  }
}

export function invoke<T = unknown>(cmd: Cmd, args?: Record<string, unknown>): Promise<T> {
  if (isTauri) return tauriInvoke<T>(cmd, args);
  return browserFallback<T>(cmd, args);
}

/**
 * 让原生窗口外观跟随应用主题。
 * 原生窗口层的底色按外观取色,只改 CSS 会在缩放/首绘时露出系统主题底色。
 * 浏览器调试环境没有原生层,静默忽略。
 */
export async function setWindowTheme(theme: "light" | "dark"): Promise<void> {
  if (!isTauri) return;
  try {
    await invoke("set_window_theme", { theme });
  } catch {
    // 旧版本后端没有该命令时不影响前端主题
  }
}

// ---- 插件封装(仅在 Tauri 下真正生效)----

export async function setAutoStart(enabled: boolean): Promise<void> {
  if (!isTauri) return;
  const mod = await import("@tauri-apps/plugin-autostart");
  if (enabled) await mod.enable();
  else await mod.disable();
}

export async function pickSavePath(defaultName: string): Promise<string | null> {
  if (!isTauri) return null;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath: defaultName, filters: [{ name: "JSON", extensions: ["json"] }] });
}

export async function pickOpenPath(): Promise<string | null> {
  if (!isTauri) return null;
  const { open } = await import("@tauri-apps/plugin-dialog");
  return open({
    multiple: false,
    directory: false,
    filters: [{ name: "JSON", extensions: ["json"] }],
  }) as Promise<string | null>;
}

export async function revealPath(path: string): Promise<void> {
  if (!isTauri) return;
  const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
  await revealItemInDir(path);
}
