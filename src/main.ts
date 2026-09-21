/** 应用入口:标题栏 + 三个 Tab(格子 / 统计 / 设置)。 */

import "./style.css";
import { h, clear } from "./ui/dom.ts";
import { createTitlebar } from "./ui/titlebar.ts";
import { createGridView } from "./ui/grid.ts";
import { createHeatmap } from "./ui/heatmap.ts";
import { createStatsView } from "./ui/stats.ts";
import { createSettingsView } from "./ui/settings.ts";
import { AppStore } from "./state.ts";
import { invoke } from "./bridge.ts";
import { hexMix } from "./logic/color.ts";
import { APP_VERSION } from "./logic/schema.ts";
import { EV } from "./ui/events.ts";
import { setLocale, t } from "./logic/i18n.ts";
import type { MsgKey } from "./logic/i18n.ts";

type TabKey = "grid" | "stats" | "settings";

const TABS: { key: TabKey; labelKey: MsgKey }[] = [
  { key: "grid", labelKey: "tab.grid" },
  { key: "stats", labelKey: "tab.stats" },
  { key: "settings", labelKey: "tab.settings" },
];

function resolveTheme(mode: "system" | "light" | "dark"): "light" | "dark" {
  if (mode !== "system") return mode;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(store: AppStore): void {
  const theme = resolveTheme(store.data.settings.theme);
  const rootEl = document.documentElement;
  rootEl.dataset.theme = theme;
  const accent = store.data.settings.accentColor;
  rootEl.style.setProperty("--accent", accent);
  rootEl.style.setProperty("--accent-soft", hexMix(accent, theme === "dark" ? "#0e1116" : "#f4f7f5", 0.65));
  rootEl.style.setProperty("--heat-empty", theme === "dark" ? "#ffffff14" : "#00000012");
}

async function main(): Promise<void> {
  const app = document.getElementById("app")!;

  const store = new AppStore({
    loadJson: () => invoke<string | null>("load_data"),
    persistJson: (json) => invoke("save_data", { json }).then(() => undefined),
  });

  // ---- 布局 ----
  const titlebar = createTitlebar("tanalyse");
  const tabBar = h("nav", { class: "tab-bar glass" });
  const panels: Record<TabKey, HTMLElement> = {
    grid: h("div", { class: "tab-host", id: "tab-grid" }),
    stats: h("div", { class: "tab-host", id: "tab-stats" }),
    settings: h("div", { class: "tab-host", id: "tab-settings" }),
  };
  const notice = h("div", { class: "notice", hidden: true });
  app.append(titlebar.root, tabBar, notice, panels.grid, panels.stats, panels.settings);

  const heatmap = createHeatmap(store);
  const gridView = createGridView(store, heatmap.root);
  const statsView = createStatsView(store);
  const settingsView = createSettingsView(store);
  panels.grid.append(gridView.root);
  panels.stats.append(statsView.root);
  panels.settings.append(settingsView.root);

  let activeTab: TabKey = "grid";

  function renderTabs(): void {
    clear(tabBar);
    for (const tab of TABS) {
      tabBar.append(
        h(
          "button",
          {
            class: `tab-btn ${activeTab === tab.key ? "tab-active" : ""}`,
            onclick: () => switchTab(tab.key),
          },
          t(tab.labelKey),
        ),
      );
    }
  }

  function switchTab(key: TabKey): void {
    activeTab = key;
    for (const [k, host] of Object.entries(panels)) {
      host.hidden = k !== activeTab;
    }
    renderTabs();
    renderActive();
  }

  function renderActive(): void {
    if (activeTab === "grid") gridView.render();
    else if (activeTab === "stats") statsView.render();
    else settingsView.render();
  }

  window.addEventListener(EV.gotoGridTab, () => switchTab("grid"));
  window.addEventListener(EV.gotoSettingsCategories, () => switchTab("settings"));
  window.addEventListener(EV.renderHeatmap, () => heatmap.render());
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (store.data.settings.theme === "system") applyTheme(store);
  });

  store.on("data", () => {
    // 语言偏好随数据更新:先同步 i18n,再重渲染 Tab 与当前视图
    setLocale(store.data.settings.locale);
    applyTheme(store);
    renderTabs();
    renderActive();
  });
  store.on("view", () => {
    if (activeTab === "grid") gridView.render();
  });

  renderTabs();
  switchTab("grid");

  await store.init();
  applyTheme(store);
  let message = store.loadResult.repairs.length
    ? t("notice.repaired", { msg: store.loadResult.repairs.join("; ") })
    : "";
  if (store.readonlyMode) {
    message = t("notice.readonly");
  }
  notice.textContent = message;
  notice.hidden = message === "";
  // 版本号写入页面,方便用户反馈问题;暴露 store 便于调试与端到端测试
  document.title = `tanalyse v${APP_VERSION}`;
  (window as unknown as Record<string, unknown>).__tanalyse = { store };
}

void main();
