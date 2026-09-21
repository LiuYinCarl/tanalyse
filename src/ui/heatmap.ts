/** GitHub 提交图风格的热力图:最近 26 周,按天着色。 */

import { h, svg, clear } from "./dom.ts";
import { AppStore } from "../state.ts";
import { heatmapData } from "../logic/model.ts";
import { addDays, startOfWeek, todayKey } from "../logic/time.ts";
import { heatShades } from "../logic/color.ts";
import { EV } from "./events.ts";

const WEEKS = 26;
const CELL = 13;
const GAP = 3;
const LABEL_W = 22;
const TOP = 16;

const WEEK_LABELS: Record<number, string> = { 0: "日", 1: "一", 2: "二", 3: "三", 4: "四", 5: "五", 6: "六" };
const MONTHS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

export interface HeatmapView {
  root: HTMLElement;
  render: () => void;
}

export function createHeatmap(store: AppStore): HeatmapView {
  const root = h("div", { class: "heatmap" });
  const legend = h("div", { class: "heatmap-legend" });
  const head = h(
    "div",
    { class: "heatmap-head" },
    h("span", { class: "heatmap-title" }, `近 ${WEEKS} 周`),
    legend,
  );
  const box = h("div", { class: "heatmap-scroll" });
  root.append(head, box);

  function render(): void {
    clear(box);
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
    const gridW = WEEKS * (CELL + GAP);
    const gridH = 7 * (CELL + GAP);
    const svgEl = svg("svg", {
      width: LABEL_W + gridW + 4,
      height: TOP + gridH + 4,
      viewBox: `0 0 ${LABEL_W + gridW + 4} ${TOP + gridH + 4}`,
      class: "heatmap-svg",
      role: "img",
      "aria-label": "近 26 周时间记录热力图",
    });

    // 星期标签(一 / 三 / 五)
    for (let d = 0; d < 7; d++) {
      const dow = (weekStartPref + d) % 7;
      if (dow !== 1 && dow !== 3 && dow !== 5) continue;
      svgEl.append(
        svg(
          "text",
          { x: 0, y: TOP + d * (CELL + GAP) + CELL - 2, class: "hm-text" },
          WEEK_LABELS[dow],
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
            { x: LABEL_W + w * (CELL + GAP), y: 11, class: "hm-text" },
            MONTHS[month],
          ),
        );
      }
    }

    for (let i = 0; i < cells.length; i++) {
      const c = cells[i];
      const w = Math.floor(i / 7);
      const d = i % 7;
      const x = LABEL_W + w * (CELL + GAP);
      const y = TOP + d * (CELL + GAP);
      const future = c.day > today;
      svgEl.append(
        svg("rect", {
          x,
          y,
          width: CELL,
          height: CELL,
          rx: 3,
          class: `hm-cell${future ? " hm-future" : ""}${c.day === today ? " hm-today" : ""}`,
          fill: future ? "transparent" : shades[c.level],
          "data-day": c.day,
          title: `${c.day} · ${c.minutes > 0 ? `${c.minutes} 分钟` : "无记录"}`,
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

  function renderLegend(): void {
    clear(legend);
    const shades = heatShades(store.data.settings.accentColor);
    legend.append("少");
    shades.forEach((c, i) => {
      legend.append(
        h("span", {
          class: "hm-legend-cell",
          style: `background: ${i === 0 ? "var(--heat-empty)" : c}`,
        }),
      );
    });
    legend.append("多");
  }

  return { root, render };
}
