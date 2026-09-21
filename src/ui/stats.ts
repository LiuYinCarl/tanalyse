/** 统计 Tab:各分类时间占比(饼图)+ 随时间花费(折线图)。 */

import { h, svg, clear } from "./dom.ts";
import { AppStore } from "../state.ts";
import { rangeStats } from "../logic/model.ts";
import { computeLineSeries, computePieSlices } from "../logic/stats.ts";
import { dayRange, lastNDays, todayKey } from "../logic/time.ts";
import { formatMinutes, t } from "../logic/i18n.ts";
import type { MsgKey } from "../logic/i18n.ts";

type RangeKey = "7d" | "30d" | "90d" | "all";

const RANGE_DEFS: { key: RangeKey; labelKey: MsgKey; days: number | null }[] = [
  { key: "7d", labelKey: "stats.range7d", days: 7 },
  { key: "30d", labelKey: "stats.range30d", days: 30 },
  { key: "90d", labelKey: "stats.range90d", days: 90 },
  { key: "all", labelKey: "stats.rangeAll", days: null },
];

export interface StatsView {
  root: HTMLElement;
  render: () => void;
}

export function createStatsView(store: AppStore): StatsView {
  let range: RangeKey = "30d";
  const root = h("section", { class: "tab-panel stats-panel" });

  const rangeBar = h("div", { class: "range-bar glass" });
  const summary = h("div", { class: "stat-summary" });
  const pieCard = h("div", { class: "card glass stat-pie-card" });
  const lineCard = h("div", { class: "card glass stat-line-card" });

  root.append(rangeBar, summary, pieCard, lineCard);

  function renderRangeBar(): void {
    clear(rangeBar);
    for (const def of RANGE_DEFS) {
      rangeBar.append(
        h(
          "button",
          {
            class: `seg-btn ${range === def.key ? "seg-active" : ""}`,
            onclick: () => {
              range = def.key;
              render();
            },
          },
          t(def.labelKey),
        ),
      );
    }
  }

  function daysForRange(): string[] {
    if (range === "all") {
      const keys = Object.keys(store.data.entries)
        .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k))
        .sort();
      // 全部区间:从最早记录到今天
      return keys.length === 0 ? [todayKey()] : dayRange(keys[0], todayKey());
    }
    const def = RANGE_DEFS.find((d) => d.key === range)!;
    return lastNDays(def.days as number);
  }

  function colorOf(id: string): string {
    return store.data.categories.find((c) => c.id === id)?.color ?? "var(--accent)";
  }

  function nameOf(id: string): string {
    return store.data.categories.find((c) => c.id === id)?.name ?? t("stats.unknown");
  }

  function renderSummary(total: number, activeDays: number, days: number): void {
    clear(summary);
    const items = [
      { label: t("stats.total"), value: formatMinutes(total) },
      { label: t("stats.activeDays"), value: `${activeDays} / ${days}` },
      {
        label: t("stats.daily"),
        value: formatMinutes(activeDays > 0 ? Math.round(total / activeDays) : 0),
      },
    ];
    for (const item of items) {
      summary.append(
        h(
          "div",
          { class: "summary-item glass" },
          h("div", { class: "summary-value" }, item.value),
          h("div", { class: "summary-label" }, item.label),
        ),
      );
    }
  }

  function renderPie(stats: ReturnType<typeof rangeStats>): void {
    clear(pieCard);
    pieCard.append(h("div", { class: "card-title" }, t("stats.pieTitle")));
    const size = 210;
    const cx = size / 2;
    const r = size / 2 - 8;
    const r0 = r * 0.58;
    const slices = computePieSlices(stats.byCategory, cx, cx, r, r0);
    if (slices.length === 0) {
      pieCard.append(h("div", { class: "empty" }, t("stats.empty")));
      return;
    }
    const chart = svg("svg", {
      viewBox: `0 0 ${size} ${size}`,
      width: size,
      height: size,
      class: "pie-svg",
      role: "img",
      "aria-label": "分类时间占比饼图",
    });
    for (const s of slices) {
      chart.append(
        svg("path", {
          d: s.path,
          fill: colorOf(s.categoryId),
          class: "pie-slice",
          title: `${nameOf(s.categoryId)} · ${formatMinutes(s.minutes)}(${Math.round(s.fraction * 100)}%)`,
        }),
      );
    }
    const legend = h("div", { class: "pie-legend" });
    const sorted = [...slices].sort((a, b) => b.minutes - a.minutes);
    for (const s of sorted) {
      legend.append(
        h(
          "div",
          { class: "legend-row" },
          h("span", { class: "dot", style: `background: ${colorOf(s.categoryId)}` }),
          h("span", { class: "legend-name" }, nameOf(s.categoryId)),
          h("span", { class: "legend-min" }, formatMinutes(s.minutes)),
          h("span", { class: "legend-pct" }, `${Math.round(s.fraction * 100)}%`),
        ),
      );
    }
    pieCard.append(h("div", { class: "pie-wrap" }, chart, legend));
  }

  function renderLine(stats: ReturnType<typeof rangeStats>): void {
    clear(lineCard);
    lineCard.append(h("div", { class: "card-title" }, t("stats.lineTitle")));
    if (stats.perDay.length === 0) {
      lineCard.append(h("div", { class: "empty" }, t("stats.empty")));
      return;
    }
    const catIds = store.data.categories.map((c) => c.id);
    const W = 640;
    const H = 240;
    const padL = 44;
    const padB = 26;
    const padT = 12;
    const input = stats.perDay.map((d) => ({ day: d.day, byCategory: d.byCategory }));
    const { series, yMax, yTicks, xTicks } = computeLineSeries(
      input,
      catIds,
      padL,
      padT,
      W - padL - 12,
      H - padT - padB,
    );

    const chart = svg("svg", {
      viewBox: `0 0 ${W} ${H}`,
      class: "line-svg",
      role: "img",
      "aria-label": "各分类每日分钟数折线图",
    });
    // y 网格与刻度
    const y0 = H - padB;
    for (const tick of yTicks) {
      const y = y0 - ((H - padT - padB) * tick) / yMax;
      chart.append(svg("line", { x1: padL, y1: y, x2: W - 12, y2: y, class: "grid-line" }));
      chart.append(svg("text", { x: padL - 6, y: y + 4, class: "hm-text", "text-anchor": "end" }, String(tick)));
    }
    chart.append(svg("text", { x: padL - 6, y: y0 + 4, class: "hm-text", "text-anchor": "end" }, "0"));
    // x 轴
    chart.append(svg("line", { x1: padL, y1: y0, x2: W - 12, y2: y0, class: "axis-line" }));
    for (const t of xTicks) {
      chart.append(svg("line", { x1: t.x, y1: y0, x2: t.x, y2: y0 + 4, class: "axis-line" }));
      chart.append(
        svg("text", { x: t.x, y: y0 + 16, class: "hm-text", "text-anchor": "middle" }, t.day.slice(5)),
      );
    }
    // 折线(仅画有数据的分类)
    for (const s of series) {
      if (!s.points.some((p) => p.minutes > 0)) continue;
      chart.append(
        svg("polyline", {
          points: s.polyline,
          fill: "none",
          stroke: colorOf(s.categoryId),
          class: "line-series",
          "stroke-width": 2,
          "stroke-linejoin": "round",
          "stroke-linecap": "round",
        }),
      );
      for (const p of s.points) {
        if (p.minutes > 0) {
          chart.append(svg("circle", { cx: p.x, cy: p.y, r: 2.6, fill: colorOf(s.categoryId) }));
        }
      }
    }
    // 图例
    const legend = h("div", { class: "line-legend" });
    for (const id of catIds) {
      if (!stats.byCategory[id]) continue;
      legend.append(
        h(
          "span",
          { class: "legend-chip" },
          h("span", { class: "dot", style: `background: ${colorOf(id)}` }),
          nameOf(id),
        ),
      );
    }
    lineCard.append(chart, legend);
  }

  function render(): void {
    renderRangeBar();
    const days = daysForRange();
    const stats = rangeStats(store.data, days[0] ?? todayKey(), days[days.length - 1] ?? todayKey(), days);
    renderSummary(stats.total, stats.activeDays, days.length);
    renderPie(stats);
    renderLine(stats);
  }

  return { root, render };
}
