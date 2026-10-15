/**
 * 运行平台判定。
 *
 * 窗口外观需要按系统分叉:macOS 用左置"红绿灯",Windows 用右置系统式按钮;
 * 判断结果同时写到 <html data-os>,让 CSS 能按平台调整标题栏布局与窗口圆角。
 * UA 在 Tauri 的各平台 WebView 里都带有系统标识,足够可靠(不依赖额外插件)。
 */

export type OsKind = "macos" | "windows" | "linux";

function detectOs(): OsKind {
  const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Windows|Win32|Win64/i.test(ua)) return "windows";
  return "linux";
}

export const osKind: OsKind = detectOs();

/** 在渲染任何内容前把平台写到根元素,避免标题栏先按错误平台布局再跳动。 */
export function applyPlatformClass(): void {
  if (typeof document !== "undefined") {
    document.documentElement.dataset.os = osKind;
  }
}
