/** GitHub 提交图风格的热力图:最近 52 周(整年),按天着色。 */

import { h, svg, clear } from "./dom.ts";
import { AppStore } from "../state.ts";
import { heatmapData } from "../logic/model.ts";
import { addDays, startOfWeek, todayKey } from "../logic/time.ts";
import { heatShades } from "../logic/color.ts";
import { formatMinutes, monthLabel, t, weekdayShort } from "../logic/i18n.ts";
import { EV } from "./events.ts";

const WEEKS = 52;
const GAP = 3;
const LABEL_W = 22;
const RIGHT_PAD = 4;
const TOP = 16;
/** 格子边长上下限:太小看不清,太大就不像"格子"了。 */
const MIN_CELL = 4;
const MAX_CELL = 34;

export interface HeatmapView {
  root: HTMLElement;
  render: () => void;
}

/**
 * 按可用宽高算格子边长:列数固定 52,边长吃满宽度(与下方日格子同宽),
 * 再用高度夹一次,避免窗口压扁时把卡片撑破。
 *
 * 注意高度要用"卡片"而不是 SVG 自己的容器来算:
 * SVG 撑起容器高度,再拿它反算边长会一路缩到最小,形成自激。
 */
function layoutFor(width: number, height: number): { cell: number; gap: number } {
  const gridW = Math.max(width - LABEL_W - RIGHT_PAD, WEEKS * MIN_CELL);
  const byWidth = (gridW - (WEEKS - 1) * GAP) / WEEKS;
  const byHeight =
    height > 0 ? (height - TOP - RIGHT_PAD - 6 * GAP) / 7 : byWidth;
  // 取半像素步进,格子边界更干净
  let cell = Math.floor(Math.min(byWidth, byHeight) * 2) / 2;
  cell = Math.max(MIN_CELL, Math.min(MAX_CELL, cell || MIN_CELL));
  // 余量摊进间隙:总宽严格等于可用宽度,右侧不留空
  const gap = WEEKS > 1 ? Math.max(1.5, Math.min(6, (gridW - WEEKS * cell) / (WEEKS - 1))) : GAP;
  return { cell, gap };
}

export function createHeatmap(store: AppStore): HeatmapView {
  const root = h("div", { class: "heatmap" });
  const legend = h("div", { class: "heatmap-legend" });
  const head = h(
    "div",
    { class: "heatmap-head" },
    h("span", { class: "heatmap-title" }, t("heatmap.weeks", { n: WEEKS })),
    legend,
  );
  const box = h("div", { class: "heatmap-scroll" });
  root.append(head, box);

  /** 已绘制的格子边长:尺寸没变就不重绘,避免 ResizeObserver 反复触发。 */
  let drawnCell = -1;

  /** 卡片能给热力图用的宽高(SVG 撑起的 box 自身尺寸不能用来反算)。 */
  function layoutInputs(): { width: number; height: number } {
    const card = root.parentElement;
    if (!card) return { width: box.clientWidth, height: 0 };
    const cs = getComputedStyle(card);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const borderX = parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const headBox = head.getBoundingClientRect();
    const gapBelowHead = parseFloat(getComputedStyle(head).marginBottom) || 0;
    return {
      width: Math.max(card.clientWidth - padX - borderX, 0),
      height: Math.max(card.clientHeight - padY - headBox.height - gapBelowHead, 0),
    };
  }

  function render(): void {
    clear(box);
    const inputs = layoutInputs();
    const { cell, gap } = layoutFor(inputs.width, inputs.height);
    drawnCell = cell;
    const weekStartPref = store.data.settings.weekStartsOn;
    const today = todayKey();
    const lastWeekStart = startOfWeek(today, weekStartPref as 0 | 1) ?? today;
    const firstStart = addDays(lastWeekStart, -(WEEKS - 1) * 7) ?? lastWeekStart;

    const days: string[] = [];
    for (let i = 0; i < WEEKS * 7; i++) {
      const day = addDays(firstStart, i);
      if (!day) break;
      days.push(day);
    }
    const cells = heatmapData(store.data, days);
    const shades = heatShades(store.data.settings.accentColor);
    const gridW = WEEKS * cell + (WEEKS - 1) * gap;
    const gridH = 7 * cell + 6 * gap;
    const svgEl = svg("svg", {
      width: LABEL_W + gridW + RIGHT_PAD,
      height: TOP + gridH + RIGHT_PAD,
      viewBox: `0 0 ${LABEL_W + gridW + RIGHT_PAD} ${TOP + gridH + RIGHT_PAD}`,
      class: "heatmap-svg",
      role: "img",
      "aria-label": t("heatmap.aria", { n: WEEKS }),
    });

    // 星期标签(一 / 三 / 五)
    for (let d = 0; d < 7; d++) {
      const dow = (weekStartPref + d) % 7;
      if (dow !== 1 && dow !== 3 && dow !== 5) continue;
      svgEl.append(
        svg(
          "text",
          { x: 0, y: TOP + d * (cell + gap) + cell - 2, class: "hm-text" },
          weekdayShort(dow),
        ),
      );
    }

    // 月份标签:每月第一次出现的列
    let lastMonth = -1;
    for (let w = 0; w < WEEKS; w++) {
      const dayCell = cells[w * 7];
      if (!dayCell) continue;
      const month = Number(dayCell.day.slice(5, 7)) - 1;
      if (month !== lastMonth) {
        lastMonth = month;
        svgEl.append(
          svg(
            "text",
            { x: LABEL_W + w * (cell + gap), y: 11, class: "hm-text" },
            monthLabel(month),
          ),
        );
      }
    }

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const w = Math.floor(i / 7);
      const d = i % 7;
      const x = LABEL_W + w * (cell + gap);
      const y = TOP + d * (cell + gap);
      const future = c.day > today;
      svgEl.append(
        svg("rect", {
          x,
          y,
          width: cell,
          height: cell,
          rx: Math.min(3.5, cell / 4),
          class: `hm-cell${future ? " hm-future" : ""}${c.day === today ? " hm-today" : ""}`,
          fill: future ? "transparent" : shades[c.level],
          "data-day": c.day,
          title: `${c.day} · ${c.minutes > 0 ? formatMinutes(c.minutes) : t("heatmap.noRecord")}`,
        }),
      );
    }

    svgEl.addEventListener("click", (e) => {
      const target = (e.target as SVGElement).closest("[data-day]") as SVGElement | null;
      const day = target?.getAttribute("data-day");
      if (day) {
        store.setViewDay(day);
        window.dispatchEvent(new CustomEvent(EV.gotoGridTab));
      }
    });

    box.append(svgEl);
    renderLegend();
  }

  // 窗口缩放时按新宽度重排(尺寸未变则不重绘)
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      const inputs = layoutInputs();
      const { cell } = layoutFor(inputs.width, inputs.height);
      if (cell !== drawnCell) render();
    });
    // 观察卡片(尺寸由布局决定),而不是被 SVG 撑开的 box
    ro.observe(root.parentElement ?? root);
  }

  function renderLegend(): void {
    clear(legend);
    const shades = heatShades(store.data.settings.accentColor);
    legend.append(t("heatmap.less"));
    shades.forEach((c, i) => {
      legend.append(
        h("span", {
          class: "hm-legend-cell",
          style: `background: ${i === 0 ? "var(--heat-empty)" : c}`,
        }),
      );
    });
    legend.append(t("heatmap.more"));
  }

  return { root, render };
}
