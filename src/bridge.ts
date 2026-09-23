/**
 * 与 Tauri 后端通信的桥接层。
 * 在纯浏览器里(开发/测试)自动降级到 localStorage,便于 UI 调试。
 */

import { APP_VERSION } from "./logic/schema.ts";

type Cmd =
  | "get_data_path"
  | "set_window_theme"
  | "load_data"
  | "save_data"
  | "export_data_to"
  | "import_data_from"
  | "reveal_data_dir"
  | "app_version";

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
    case "reveal_data_dir":
      return Promise.resolve(null as T);
    case "app_version":
      return Promise.resolve(APP_VERSION as T);
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
 * 原生 vibrancy / Acrylic 按窗口外观取材质,只改 CSS 会让深色模式停在系统主题上。
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
