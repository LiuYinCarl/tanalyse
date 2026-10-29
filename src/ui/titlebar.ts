/**
 * 自定义标题栏。
 *
 * 窗口控制钮不分平台,统一用 Windows 系统式:右置最小化/最大化/关闭
 * (悬停高亮、关闭按钮红底)。符号一律用 CSS 画,不依赖字体里的箭头/
 * 叉号字符,避免在缺字体的系统上显示成"豆腐块"。
 * 仅 Tauri 环境渲染控制钮;浏览器预览只留拖拽条与品牌名。
 */

import { h } from "./dom.ts";
import { isTauri } from "../bridge.ts";
import { t } from "../logic/i18n.ts";
import type { Window as TauriWindow } from "@tauri-apps/api/window";

export interface Titlebar {
  root: HTMLElement;
}

/** 惰性获取当前窗口:首次点击时才加载窗口 API,标题栏可同步渲染。 */
let winPromise: Promise<TauriWindow> | null = null;
function currentWindow(): Promise<TauriWindow> {
  if (!winPromise) {
    winPromise = import("@tauri-apps/api/window").then((m) => m.getCurrentWindow());
  }
  return winPromise;
}

/** 把"需要窗口实例的动作"包成可直接挂到 onclick 的处理器。 */
function windowAction(fn: (win: TauriWindow) => Promise<unknown>): () => void {
  return () => {
    void currentWindow()
      .then(fn)
      .catch(() => {});
  };
}

export function createTitlebar(appName: string): Titlebar {
  const brand = h(
    "div",
    { class: "titlebar-brand", "data-tauri-drag-region": "" },
    h("span", { class: "brand-dot" }),
    h("span", { class: "brand-name", "data-tauri-drag-region": "" }, appName),
  );

  const controls = h("div", { class: "window-controls" });

  if (isTauri) {
    const minBtn = h("button", {
      class: "wbtn wbtn-min",
      title: t("titlebar.minimize"),
      onclick: windowAction((win) => win.minimize()),
    });
    const maxBtn = h("button", {
      class: "wbtn wbtn-max",
      title: t("titlebar.maximize"),
      onclick: () => {
        void currentWindow()
          .then(async (win) => {
            await win.toggleMaximize();
            setMaximized(await win.isMaximized());
          })
          .catch(() => {});
      },
    });
    const closeBtn = h("button", {
      class: "wbtn wbtn-close",
      title: t("titlebar.close"),
      onclick: windowAction((win) => win.close()),
    });
    controls.append(minBtn, maxBtn, closeBtn);

    const setMaximized = (max: boolean): void => {
      controls.classList.toggle("is-maximized", max);
      maxBtn.title = t(max ? "titlebar.restore" : "titlebar.maximize");
    };
    void currentWindow()
      .then(async (win) => {
        setMaximized(await win.isMaximized());
        await win.onResized(async () => setMaximized(await win.isMaximized()));
      })
      .catch(() => {});
  }

  const root = h("header", { class: "titlebar", "data-tauri-drag-region": "" });
  // 品牌名在左、控制钮在右(所有平台一致)
  root.append(brand, controls);

  return { root };
}
