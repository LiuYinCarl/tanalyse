/** 自定义标题栏:macOS 式"红绿灯"窗口控制 + 拖拽区(仅 Tauri 下显示控制钮)。 */

import { h } from "./dom.ts";
import { isTauri } from "../bridge.ts";

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
      action: () => Promise<void>,
    ): HTMLElement =>
      h(
        "button",
        {
          class: `tl tl-${kind}`,
          title: kind === "close" ? "关闭" : kind === "min" ? "最小化" : "最大化/还原",
          onclick: () => void action(),
        },
        h("span", { class: "tl-glyph" }, glyph),
      );
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      cluster.append(
        light("close", "✕", () => win.close()),
        light("min", "–", () => win.minimize()),
        light("max", "⤢", () => win.toggleMaximize()),
      );
    })();
  }

  return { root };
}
