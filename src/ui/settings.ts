/** 设置 Tab:外观(主题/主题色)、分类管理、通用(开机自启)、数据管理。 */

import { h, clear } from "./dom.ts";
import { AppStore } from "../state.ts";
import {
  ACCENT_CHOICES,
  DATA_VERSION,
  MORANDI_PALETTE,
  isBuiltinCategory,
  newCategoryId,
} from "../logic/schema.ts";
import type { AppSettings, Category } from "../logic/schema.ts";
import {
  invoke,
  isTauri,
  pickOpenPath,
  pickSavePath,
  revealPath,
  setAutoStart,
} from "../bridge.ts";
import { loadData } from "../logic/migrate.ts";

export interface SettingsView {
  root: HTMLElement;
  render: () => void;
}

export function createSettingsView(store: AppStore): SettingsView {
  const root = h("section", { class: "tab-panel settings-panel" });
  let dataPath = "";

  function card(title: string): { card: HTMLElement; body: HTMLElement } {
    const c = h("div", { class: "card glass settings-card" });
    const b = h("div", { class: "card-body" });
    c.append(h("div", { class: "card-title" }, title), b);
    return { card: c, body: b };
  }

  // ---- 外观 ----
  const appearance = card("外观");
  const themeRow = h("div", { class: "setting-row" });
  const accentRow = h("div", { class: "setting-row" });
  appearance.body.append(themeRow, accentRow);

  function renderAppearance(): void {
    clear(themeRow);
    themeRow.append(h("label", { class: "setting-label" }, "主题"));
    const seg = h("div", { class: "segmented" });
    const modes: { key: AppSettings["theme"]; label: string }[] = [
      { key: "system", label: "跟随系统" },
      { key: "light", label: "浅色" },
      { key: "dark", label: "深色" },
    ];
    for (const m of modes) {
      seg.append(
        h(
          "button",
          {
            class: `seg-btn ${store.data.settings.theme === m.key ? "seg-active" : ""}`,
            onclick: () => {
              // updateSettings 触发 store 的 data 事件,main 统一应用主题并重渲染
              store.updateSettings({ theme: m.key });
            },
          },
          m.label,
        ),
      );
    }
    themeRow.append(seg);

    clear(accentRow);
    accentRow.append(h("label", { class: "setting-label" }, "主题色"));
    const swatches = h("div", { class: "swatch-row" });
    for (const color of ACCENT_CHOICES) {
      swatches.append(
        h("button", {
          class: `swatch ${store.data.settings.accentColor === color ? "swatch-active" : ""}`,
          style: `background: ${color}`,
          title: color,
          "aria-label": `主题色 ${color}`,
          onclick: () => {
            store.updateSettings({ accentColor: color });
          },
        }),
      );
    }
    accentRow.append(swatches);
  }

  // ---- 分类管理 ----
  const categoriesCard = card("分类管理");
  const catList = h("div", { class: "category-list" });
  categoriesCard.body.append(
    h("p", { class: "card-desc" }, "工作与休息为内置分类,可改名换色;自定义分类可删除。颜色取自莫兰迪色板。"),
    catList,
  );

  function palettePicker(current: string, onPick: (c: string) => void): HTMLElement {
    const wrap = h("div", { class: "palette" });
    for (const color of MORANDI_PALETTE) {
      wrap.append(
        h("button", {
          class: `swatch swatch-sm ${current === color ? "swatch-active" : ""}`,
          style: `background: ${color}`,
          title: color,
          onclick: () => onPick(color),
        }),
      );
    }
    return wrap;
  }

  function renderCategories(): void {
    clear(catList);
    for (const cat of store.data.categories) {
      const row = h("div", { class: "cat-row" });
      const nameInput = h("input", {
        class: "input cat-name",
        type: "text",
        maxlength: "24",
        value: cat.name,
        onchange: (e: Event) => {
          const v = (e.target as HTMLInputElement).value.trim();
          if (v) store.updateCategory(cat.id, { name: v });
        },
      }) as HTMLInputElement;
      const colorBtn = h("button", {
        class: "swatch",
        style: `background: ${cat.color}`,
        title: "更换颜色",
        onclick: () => row.classList.toggle("cat-row-open"),
      });
      const picker = palettePicker(cat.color, (c) => {
        store.updateCategory(cat.id, { color: c });
      });
      row.append(colorBtn, nameInput);
      if (!isBuiltinCategory(cat)) {
        row.append(
          h(
            "button",
            {
              class: "btn btn-ghost btn-danger",
              title: "删除分类",
              onclick: () => {
                store.removeCategory(cat.id);
              },
            },
            "删除",
          ),
        );
      }
      row.append(picker);
      catList.append(row);
    }
    // 新增行:色块即时反馈所选莫兰迪色,回车或点“新增”提交
    const addRow = h("div", { class: "cat-row cat-row-add" });
    let newName = "";
    let newColor = MORANDI_PALETTE[2];
    const addSwatch = h("button", {
      class: "swatch",
      style: `background: ${newColor}`,
      title: "更换颜色",
      onclick: () => addRow.classList.toggle("cat-row-open"),
    });
    addRow.append(
      addSwatch,
      h("input", {
        class: "input cat-name",
        type: "text",
        maxlength: "24",
        placeholder: "新分类名称…",
        oninput: (e: Event) => {
          newName = (e.target as HTMLInputElement).value.trim();
        },
        onkeydown: (e: Event) => {
          if ((e as KeyboardEvent).key === "Enter") addNew();
        },
      }),
      h("button", { class: "btn btn-ghost", onclick: () => addNew() }, "新增"),
      palettePicker(newColor, (c) => {
        newColor = c;
        addSwatch.style.background = c;
      }),
    );
    function addNew(): void {
      if (!newName) return;
      const cat: Category = { id: newCategoryId(), name: newName, color: newColor };
      store.addCategory(cat);
    }
    catList.append(addRow);
  }

  // ---- 通用 ----
  const general = card("通用");
  const autoRow = h("div", { class: "setting-row" });
  const weekRow = h("div", { class: "setting-row" });
  general.body.append(autoRow, weekRow);

  function renderGeneral(): void {
    clear(autoRow);
    autoRow.append(h("label", { class: "setting-label" }, "开机自启"));
    const toggle = h("button", {
      class: `toggle ${store.data.settings.autoStart ? "toggle-on" : ""}`,
      role: "switch",
      "aria-checked": String(store.data.settings.autoStart),
      onclick: async () => {
        const next = !store.data.settings.autoStart;
        await setAutoStart(next);
        store.updateSettings({ autoStart: next });
        renderGeneral();
      },
    });
    autoRow.append(toggle);

    clear(weekRow);
    weekRow.append(h("label", { class: "setting-label" }, "一周起始"));
    const seg = h("div", { class: "segmented" });
    for (const opt of [
      { v: 1 as const, label: "周一" },
      { v: 0 as const, label: "周日" },
    ]) {
      seg.append(
        h(
          "button",
          {
            class: `seg-btn ${store.data.settings.weekStartsOn === opt.v ? "seg-active" : ""}`,
            onclick: () => {
              store.updateSettings({ weekStartsOn: opt.v });
              renderGeneral();
            },
          },
          opt.label,
        ),
      );
    }
    weekRow.append(seg);
  }

  // ---- 数据 ----
  const dataCard = card("数据");
  const dataBody = h("div", { class: "data-info" });
  dataCard.body.append(dataBody);

  root.append(
    appearance.card,
    categoriesCard.card,
    general.card,
    dataCard.card,
  );

  async function renderData(): Promise<void> {
    clear(dataBody);
    dataBody.append(
      h(
        "div",
        { class: "setting-row" },
        h("label", { class: "setting-label" }, "数据文件"),
        h("span", { class: "path-text", title: dataPath }, dataPath || "加载中…"),
        h(
          "button",
          {
            class: "btn btn-ghost",
            onclick: async () => {
              if (dataPath) await revealPath(dataPath);
            },
          },
          "打开位置",
        ),
      ),
      h(
        "div",
        { class: "setting-row" },
        h("label", { class: "setting-label" }, "导出 / 分享"),
        h(
          "button",
          {
            class: "btn btn-ghost",
            onclick: async () => {
              const path = await pickSavePath(`tanalyse-${new Date().toISOString().slice(0, 10)}.json`);
              if (!path) return;
              const json = JSON.stringify(store.data, null, 2);
              await invoke("export_data_to", { path, json });
            },
          },
          "导出 JSON…",
        ),
        h(
          "button",
          {
            class: "btn btn-ghost",
            onclick: async () => {
              const path = await pickOpenPath();
              if (!path) return;
              const raw = await invoke<string>("import_data_from", { path });
              const result = loadData(raw);
              if (result.readonly) {
                alert("该文件由更新版本的 tanalyse 创建,当前版本只能只读查看,无法导入。");
                return;
              }
              store.replaceData(result.data);
              if (isTauri) await setAutoStart(store.data.settings.autoStart);
            },
          },
          "导入 JSON…",
        ),
      ),
      h(
        "div",
        { class: "setting-row version-row" },
        h("span", { class: "version" }, `应用 v${await appVersion()} · 数据格式 v${DATA_VERSION}`),
      ),
    );
  }

  async function appVersion(): Promise<string> {
    try {
      return await invoke<string>("app_version");
    } catch {
      return "1.0.0";
    }
  }

  function render(): void {
    renderAppearance();
    renderCategories();
    renderGeneral();
    void refreshPath().then(() => void renderData());
  }

  async function refreshPath(): Promise<void> {
    try {
      dataPath = await invoke<string>("get_data_path");
    } catch {
      dataPath = "";
    }
  }

  return { root, render };
}
