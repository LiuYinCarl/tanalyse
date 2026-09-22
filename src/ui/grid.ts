/** 格子 Tab:GitHub 提交图热力图 + 单日 48 个 30 分钟格子。 */

import { h, clear } from "./dom.ts";
import { openSlotModal } from "./modal.ts";
import { AppStore } from "../state.ts";
import { SLOTS_PER_DAY } from "../logic/schema.ts";
import { getDay, setSlot, toggleSlot, slotTooltip } from "../logic/model.ts";
import type { Day } from "../logic/model.ts";
import { addDays, todayKey } from "../logic/time.ts";
import { formatDayLabel, t } from "../logic/i18n.ts";
import { EV } from "./events.ts";

export interface GridView {
  root: HTMLElement;
  render: () => void;
}

/** 单击与双击并存:单击延迟触发,双击取消单击。 */
const CLICK_DELAY_MS = 230;

export function createGridView(store: AppStore, heatmapSlot: HTMLElement): GridView {
  const root = h("section", { class: "tab-panel grid-panel" });

  // ---- 分类选择栏(单选项) ----
  const catBar = h("div", { class: "category-bar glass" });

  // ---- 日期导航 ----
  const dateLabel = h("div", { class: "date-label" });
  const prevBtn = h("button", { class: "icon-btn", title: t("grid.prevDay"), onclick: () => shiftDay(-1) }, "‹");
  const nextBtn = h("button", { class: "icon-btn", title: t("grid.nextDay"), onclick: () => shiftDay(1) }, "›");
  const todayBtn = h(
    "button",
    {
      class: "btn btn-ghost",
      title: t("grid.today"),
      onclick: () => { store.setViewDay(todayKey()); },
    },
    t("grid.today"),
  );
  const dateNav = h("div", { class: "date-nav glass" }, prevBtn, dateLabel, nextBtn, todayBtn);

  // ---- 热力图容器(热力图视图由 main 创建后注入) ----
  const heatmapBox = h("div", { class: "heatmap-box glass" });
  heatmapBox.append(heatmapSlot);

  // ---- 日格子:两行(0-11 点 / 12-23 点),各自带小时标签 ----
  const gridEl = h("div", { class: "day-grid" });
  // 与热力图同样的玻璃卡片,让"日格子"成为一块完整的记录面板
  const dayBoard = h("div", { class: "day-board glass" }, gridEl);

  root.append(
    catBar,
    h(
      "div",
      { class: "row-between" },
      dateNav,
      h("div", { class: "hint" }, t("grid.hint")),
    ),
    heatmapBox,
    dayBoard,
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
          title: t("grid.manageCategories"),
          onclick: () => window.dispatchEvent(new CustomEvent(EV.gotoSettingsCategories)),
        },
        t("grid.addCategory"),
      ),
    );
  }

  function renderDateNav(): void {
    dateLabel.replaceChildren(formatDayLabel(store.viewDay));
  }

  /** 小格取色:未填返回 null(交给空档底色),分类缺失时回退主题色。 */
  function colorOf(id: string | null): string | null {
    if (!id) return null;
    return store.data.categories.find((c) => c.id === id)?.color ?? "var(--accent)";
  }

  /**
   * 构造一个 30 分钟格子:内部按时间顺序横向切成 3 段 10 分钟小格(上下叠放),
   * 每段独立取色 —— "填了哪一段、填的是什么"一眼可辨,
   * 也不会像渐变那样把不同分类混成一条糊掉的色带。
   * 整格空着时不生成小格,只留底色。day/nowSlot 由 renderGrid 算好共享。
   */
  function makeCell(slot: number, day: Day, nowSlot: number): HTMLElement {
    const base = slot * 3;
    const states = [day[base], day[base + 1], day[base + 2]];
    const hasContent = states.some((id) => id !== null);
    const cell = h(
      "div",
      {
        class: `cell${slot === nowSlot && store.viewDay === todayKey() ? " cell-now" : ""}`,
        "data-slot": String(slot),
        role: "button",
      },
    );
    if (hasContent) {
      const parts = h("div", { class: "cell-parts" });
      for (const id of states) {
        const color = colorOf(id);
        parts.append(
          h("span", {
            class: `cell-part${color ? " cell-part-on" : ""}`,
            style: color ? `--part-color: ${color}` : undefined,
          }),
        );
      }
      cell.append(parts);
    }
    cell.addEventListener("mouseenter", () => {
      cell.title = slotTooltip(store.data, store.viewDay, slot);
    });
    cell.tabIndex = 0; // role=button 需要配套键盘操作
    cell.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cell.click();
      }
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
