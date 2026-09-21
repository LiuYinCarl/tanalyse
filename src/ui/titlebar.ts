/** 自定义标题栏:拖拽区 + 窗口控制(仅 Tauri 下显示控制按钮)。 */

import { h } from "./dom.ts";
import { isTauri } from "../bridge.ts";

export interface Titlebar {
  root: HTMLElement;
}

export function createTitlebar(appName: string): Titlebar {
  const controls = h("div", { class: "titlebar-controls" });
  if (isTauri) {
    void (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const win = getCurrentWindow();
      controls.append(
        h("button", { class: "win-btn", title: "最小化", onclick: () => void win.minimize() }, "─"),
        h(
          "button",
          { class: "win-btn", title: "最大化/还原", onclick: () => void win.toggleMaximize() },
          "▢",
        ),
        h("button", { class: "win-btn win-close", title: "关闭", onclick: () => void win.close() }, "✕"),
      );
    })();
  }

  const root = h(
    "header",
    { class: "titlebar", "data-tauri-drag-region": "" },
    h(
      "div",
      { class: "titlebar-brand", "data-tauri-drag-region": "" },
      h("span", { class: "brand-dot" }),
      h("span", { class: "brand-name", "data-tauri-drag-region": "" }, appName),
    ),
    controls,
  );
  return { root };
}
