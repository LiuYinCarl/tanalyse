/** 自定义标题栏:macOS 式"红绿灯"窗口控制 + 拖拽区(仅 Tauri 下显示控制钮)。 */

import { h } from "./dom.ts";
import { isTauri } from "../bridge.ts";
import { t } from "../logic/i18n.ts";
import type { MsgKey } from "../logic/i18n.ts";

export interface Titlebar {
  root: HTMLElement;
}

export function createTitlebar(appName: string): Titlebar {
  // 红绿灯集群置于左侧(整体悬停时才浮现符号);无 Tauri 环境(浏览器预览)则不渲染
  const cluster = h("div", { class: "traffic" });

  const root = h(
    "header",
    { class: "titlebar", "data-tauri-drag-region": "" },
    cluster,
    h(
      "div",
      { class: "titlebar-brand", "data-tauri-drag-region": "" },
      h("span", { class: "brand-dot" }),
      h("span", { class: "brand-name", "data-tauri-drag-region": "" }, appName),
    ),
  );

  if (isTauri) {
    const light = (
      kind: "close" | "min" | "max",
      glyph: string,
      titleKey: MsgKey,
      action: () => Promise<void>,
    ): HTMLElement =>
      h(
        "button",
        {
          class: `tl tl-${kind}`,
          title: t(titleKey),
          onclick: () => void action(),
        },
        h("span", { class: "tl-glyph" }, glyph),
      );
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      cluster.append(
        light("close", "✕", "titlebar.close", () => win.close()),
        light("min", "–", "titlebar.minimize", () => win.minimize()),
        light("max", "⤢", "titlebar.maximize", () => win.toggleMaximize()),
      );
    })();
  }

  return { root };
}
