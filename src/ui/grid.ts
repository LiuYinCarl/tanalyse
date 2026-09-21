/** 格子 Tab:GitHub 提交图热力图 + 单日 48 个 30 分钟格子。 */

import { h, clear } from "./dom.ts";
import { openSlotModal } from "./modal.ts";
import { AppStore } from "../state.ts";
import { SLOTS_PER_DAY } from "../logic/schema.ts";
import { getDay, setSlot, toggleSlot, slotTooltip } from "../logic/model.ts";
import type { Day } from "../logic/model.ts";
import { addDays, formatDayLabel, todayKey } from "../logic/time.ts";
import { EV } from "./events.ts";

export interface GridView {
  root: HTMLElement;
  render: () => void;
}

/** 单击与双击并存:单击延迟触发,双击取消单击。 */
const CLICK_DELAY_MS = 230;

export function createGridView(store: AppStore): GridView {
  const root = h("section", { class: "tab-panel grid-panel" });

  // ---- 分类选择栏(单选项) ----
  const catBar = h("div", { class: "category-bar glass" });

  // ---- 日期导航 ----
  const dateLabel = h("div", { class: "date-label" });
  const prevBtn = h("button", { class: "icon-btn", title: "前一天", onclick: () => shiftDay(-1) }, "‹");
  const nextBtn = h("button", { class: "icon-btn", title: "后一天", onclick: () => shiftDay(1) }, "›");
  const todayBtn = h(
    "button",
    { class: "btn btn-ghost", onclick: () => { store.setViewDay(todayKey()); } },
    "今天",
  );
  const dateNav = h("div", { class: "date-nav glass" }, prevBtn, dateLabel, nextBtn, todayBtn);

  // ---- 热力图容器 ----
  const heatmapBox = h("div", { class: "heatmap-box glass" });

  // ---- 日格子:两行(0-11 点 / 12-23 点),各自带小时标签 ----
  const gridEl = h("div", { class: "day-grid" });

  root.append(
    catBar,
    h(
      "div",
      { class: "row-between" },
      dateNav,
      h("div", { class: "hint" }, "单击填入所选分类 · 双击切分 10 分钟 · 右键清除"),
    ),
    heatmapBox,
    gridEl,
  );

  function shiftDay(delta: number): void {
    const next = addDays(store.viewDay, delta);
    if (next) store.setViewDay(next);
  }

  function renderCategoryBar(): void {
    clear(catBar);
    for (const cat of store.data.categories) {
      const active = store.selectedCategoryId === cat.id;
      catBar.append(
        h(
          "button",
          {
            class: `cat-chip ${active ? "cat-active" : ""}`,
            style: `--cat-color: ${cat.color}`,
            title: cat.name,
            onclick: () => store.selectCategory(cat.id),
          },
          h("span", { class: "dot", style: `background: ${cat.color}` }),
          cat.name,
        ),
      );
    }
    catBar.append(
      h(
        "button",
        {
          class: "cat-chip cat-add",
          title: "管理分类",
          onclick: () => window.dispatchEvent(new CustomEvent(EV.gotoSettingsCategories)),
        },
        "+ 分类",
      ),
    );
  }

  function renderDateNav(): void {
    dateLabel.replaceChildren(formatDayLabel(store.viewDay));
  }

  /** 构造一个 30 分钟格子。day/nowSlot 由 renderGrid 一次算好共享,避免逐格重建。 */
  function makeCell(slot: number, day: Day, nowSlot: number): HTMLElement {
    const base = slot * 3;
    const states = [day[base], day[base + 1], day[base + 2]];
    const colorOf = (id: string | null): string =>
      store.data.categories.find((c) => c.id === id)?.color ?? "var(--accent)";

    const subs = states.map((id) =>
      h("span", {
        class: "sub",
        style: id ? `background: ${colorOf(id)}` : "",
      }),
    );
    const cell = h(
      "div",
      {
        class: `cell${slot === nowSlot && store.viewDay === todayKey() ? " cell-now" : ""}`,
        "data-slot": String(slot),
        role: "button",
      },
      ...subs,
    );
    cell.addEventListener("mouseenter", () => {
      cell.title = slotTooltip(store.data, store.viewDay, slot);
    });

    let clickTimer: ReturnType<typeof setTimeout> | null = null;
    cell.addEventListener("click", () => {
      if (clickTimer !== null) return;
      clickTimer = setTimeout(() => {
        clickTimer = null;
        if (store.readonlyMode || !store.selectedCategoryId) return;
        if (toggleSlot(store.data, store.viewDay, slot, store.selectedCategoryId)) {
          store.notifyDataChanged();
        }
      }, CLICK_DELAY_MS);
    });
    cell.addEventListener("dblclick", () => {
      if (clickTimer !== null) {
        clearTimeout(clickTimer);
        clickTimer = null;
      }
      openSlotModal(store, store.viewDay, slot);
    });
    cell.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      if (store.readonlyMode) return;
      if (setSlot(store.data, store.viewDay, slot, null)) {
        store.notifyDataChanged();
      }
    });
    return cell;
  }

  function renderGrid(): void {
    clear(gridEl);
    // getDay 返回清洗后的副本:每次渲染分配一次,48 个格子共享
    const day: Day = getDay(store.data, store.viewDay);
    const now = new Date();
    const nowSlot = now.getHours() * 2 + (now.getMinutes() >= 30 ? 1 : 0);
    for (let row = 0; row < 2; row++) {
      const hours = h("div", { class: "grid-hours" });
      for (let hh = 0; hh < 12; hh++) {
        hours.append(h("span", { class: "hour-label" }, String(row * 12 + hh)));
      }
      const rowEl = h("div", { class: "day-row" });
      for (let i = 0; i < SLOTS_PER_DAY / 2; i++) {
        rowEl.append(makeCell(row * (SLOTS_PER_DAY / 2) + i, day, nowSlot));
      }
      gridEl.append(h("div", { class: "day-block" }, hours, rowEl));
    }
  }

  function render(): void {
    renderCategoryBar();
    renderDateNav();
    renderGrid();
    window.dispatchEvent(new CustomEvent(EV.renderHeatmap));
  }

  return { root, render };
}
