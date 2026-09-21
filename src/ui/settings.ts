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
import { loadData, serializeData } from "../logic/migrate.ts";
import { t } from "../logic/i18n.ts";
import type { Locale, MsgKey } from "../logic/i18n.ts";

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
  const appearance = card(t("settings.appearance"));
  const themeRow = h("div", { class: "setting-row" });
  const accentRow = h("div", { class: "setting-row" });
  const langRow = h("div", { class: "setting-row" });
  appearance.body.append(themeRow, accentRow, langRow);

  function renderAppearance(): void {
    clear(themeRow);
    themeRow.append(h("label", { class: "setting-label" }, t("settings.theme")));
    const seg = h("div", { class: "segmented" });
    const modes: { key: AppSettings["theme"]; labelKey: MsgKey }[] = [
      { key: "system", labelKey: "settings.themeSystem" },
      { key: "light", labelKey: "settings.themeLight" },
      { key: "dark", labelKey: "settings.themeDark" },
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
          t(m.labelKey),
        ),
      );
    }
    themeRow.append(seg);

    clear(accentRow);
    accentRow.append(h("label", { class: "setting-label" }, t("settings.accent")));
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

    clear(langRow);
    langRow.append(h("label", { class: "setting-label" }, t("settings.language")));
    const langSeg = h("div", { class: "segmented" });
    for (const loc of ["zh", "en"] as Locale[]) {
      langSeg.append(
        h(
          "button",
          {
            class: `seg-btn ${store.data.settings.locale === loc ? "seg-active" : ""}`,
            onclick: () => {
              // 触发 data 事件:main 同步 i18n 并全量重渲染
              store.updateSettings({ locale: loc });
            },
          },
          loc === "zh" ? "中文" : "English",
        ),
      );
    }
    langRow.append(langSeg);
  }

  // ---- 分类管理 ----
  const categoriesCard = card(t("settings.categories"));
  const catList = h("div", { class: "category-list" });
  categoriesCard.body.append(
    h("p", { class: "card-desc" }, t("settings.categoriesDesc")),
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
        title: t("settings.accent"),
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
              title: t("settings.delete"),
              onclick: () => {
                store.removeCategory(cat.id);
              },
            },
            t("settings.delete"),
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
      title: t("settings.accent"),
      onclick: () => addRow.classList.toggle("cat-row-open"),
    });
    addRow.append(
      addSwatch,
      h("input", {
        class: "input cat-name",
        type: "text",
        maxlength: "24",
        placeholder: t("settings.newCategoryPlaceholder"),
        oninput: (e: Event) => {
          newName = (e.target as HTMLInputElement).value.trim();
        },
        onkeydown: (e: Event) => {
          if ((e as KeyboardEvent).key === "Enter") addNew();
        },
      }),
      h("button", { class: "btn btn-ghost", onclick: () => addNew() }, t("settings.add")),
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
  const general = card(t("settings.general"));
  const autoRow = h("div", { class: "setting-row" });
  const weekRow = h("div", { class: "setting-row" });
  general.body.append(autoRow, weekRow);

  function renderGeneral(): void {
    clear(autoRow);
    autoRow.append(h("label", { class: "setting-label" }, t("settings.autoStart")));
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
    weekRow.append(h("label", { class: "setting-label" }, t("settings.weekStart")));
    const seg = h("div", { class: "segmented" });
    for (const opt of [
      { v: 1 as const, label: t("settings.monday") },
      { v: 0 as const, label: t("settings.sunday") },
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
  const dataCard = card(t("settings.data"));
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
        h("label", { class: "setting-label" }, t("settings.dataFile")),
        h("span", { class: "path-text", title: dataPath }, dataPath || t("settings.loading")),
        h(
          "button",
          {
            class: "btn btn-ghost",
            onclick: async () => {
              if (dataPath) await revealPath(dataPath);
            },
          },
          t("settings.openLocation"),
        ),
      ),
      h(
        "div",
        { class: "setting-row" },
        h("label", { class: "setting-label" }, t("settings.share")),
        h(
          "button",
          {
            class: "btn btn-ghost",
            onclick: async () => {
              const path = await pickSavePath(`tanalyse-${new Date().toISOString().slice(0, 10)}.json`);
              if (!path) return;
              // 与自动保存同一序列化路径:版本盖章、裁剪空日期
              const json = serializeData(store.data);
              await invoke("export_data_to", { path, json });
            },
          },
          t("settings.exportJson"),
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
          t("settings.importJson"),
        ),
      ),
      h(
        "div",
        { class: "setting-row version-row" },
        h(
          "span",
          { class: "version" },
          t("settings.versionLine", { app: await appVersion(), schema: DATA_VERSION }),
        ),
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
