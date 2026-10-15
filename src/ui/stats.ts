/**
 * 统计 Tab:
 * - 趋势卡(左):区间分段控件 + 大数字概览 + 逐日时长柱状图
 * - 占比卡(右):各分类时间环形图
 * - 折线卡(通栏):各分类随时间变化
 * 柱状图/折线图按容器实际宽度绘制(文本不随 viewBox 缩放),
 * 窗口尺寸变化时经 ResizeObserver 重绘。
 */

import { h, svg, clear } from "./dom.ts";
import { AppStore } from "../state.ts";
import { rangeStats } from "../logic/model.ts";
import {
  bucketDayTotals,
  computeDayBars,
  computeLineSeries,
  computePieSlices,
  topRoundedBar,
} from "../logic/stats.ts";
import { dayRange, dayKeyToDate, lastNDays, todayKey } from "../logic/time.ts";
import { formatMinutes, t, weekdayShort } from "../logic/i18n.ts";
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

/** 柱顶数值用的紧凑时长:45分 / 2时 / 2.5时(完整时长用 formatMinutes)。 */
function compactMinutes(min: number): string {
  const v = Number.isFinite(min) ? Math.max(0, min) : 0;
  if (v < 60) return t("stats.minShort", { n: Math.round(v) });
  const hours = Math.round((v / 60) * 10) / 10;
  return t("stats.hourShort", { n: Number.isInteger(hours) ? hours : hours.toFixed(1) });
}

export function createStatsView(store: AppStore): StatsView {
  let range: RangeKey = "7d";
  const root = h("section", { class: "tab-panel stats-panel" });

  // ---- 趋势卡(左):分段控件 + 大数字 + 每日柱状图 ----
  const pills = h("div", { class: "segmented trend-pills" });
  const bigValue = h("div", { class: "big-value" });
  const bigSub = h("div", { class: "big-sub" });
  const barBox = h("div", { class: "bar-box" });
  const trendCard = h(
    "div",
    { class: "card glass trend-card" },
    h("div", { class: "trend-head" }, pills),
    bigValue,
    bigSub,
    barBox,
  );

  // ---- 占比卡(右)与折线卡(通栏),内容由 render 重建 ----
  const pieCard = h("div", { class: "card glass stat-pie-card" });
  const statsGrid = h("div", { class: "stats-grid" }, trendCard, pieCard);
  const lineBox = h("div", { class: "line-box" });
  const lineCard = h("div", { class: "card glass stat-line-card" });

  root.append(statsGrid, lineCard);

  /** 已绘制时的容器尺寸:没变就不重绘,避免 ResizeObserver 自激。 */
  let drawnBarW = -1;
  let drawnBarH = -1;
  let drawnLineW = -1;

  function renderRangeBar(): void {
    clear(pills);
    for (const def of RANGE_DEFS) {
      pills.append(
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

  function renderBig(total: number, activeDays: number, days: number): void {
    const avg = days > 0 ? Math.round(total / days) : 0;
    bigValue.textContent = formatMinutes(total);
    bigSub.textContent = `${t("stats.daily")} ${formatMinutes(avg)} · ${t("stats.activeDays")} ${activeDays} / ${days}`;
  }

  function renderBars(days: string[], totals: Record<string, number>): void {
    clear(barBox);
    const W = Math.max(Math.round(barBox.clientWidth) || 0, 260);
    const H = Math.min(320, Math.max(190, Math.round(barBox.clientHeight) || 0));
    const padTop = 26;
    const padBottom = 24;
    const padX = 2;
    const buckets = bucketDayTotals(days.map((day) => ({ day, total: totals[day] ?? 0 })));
    const geo = computeDayBars(buckets, padX, padTop, W - padX * 2, H - padTop - padBottom);
    const svgEl = svg("svg", {
      width: W,
      height: H,
      viewBox: `0 0 ${W} ${H}`,
      class: "bar-svg",
      role: "img",
      "aria-label": t("stats.barsAria"),
    });
    const n = geo.bars.length;
    const baseline = H - padBottom;
    const step = n > 0 ? (W - padX * 2) / n : 0;
    const showValues = n <= 16; // 更密时柱顶放不下数值,只留悬停提示
    const daily = n > 0 && buckets[0].from === buckets[0].to;

    // 命中区铺满整列:细柱与零值天也有可靠的悬停目标
    const tipOf = (b: (typeof geo.bars)[number]): string =>
      `${b.from === b.to ? b.from : `${b.from} ~ ${b.to}`} · ${formatMinutes(b.total)}`;
    geo.bars.forEach((b, i) => {
      const hit = svg("rect", {
        x: padX + step * i,
        y: padTop - 8,
        width: step,
        height: baseline - padTop + 8,
        class: "bar-hit",
      });
      hit.setAttribute("title", tipOf(b));
      svgEl.append(hit);
    });

    geo.bars.forEach((b, i) => {
      // 区间终点恒为今天:最后一根高亮为"当前"
      const isNow = i === n - 1;
      if (b.h > 0) {
        svgEl.append(
          svg("path", {
            d: topRoundedBar(b.x, b.y, b.w, b.h),
            class: `bar-rect${isNow ? " bar-rect-now" : ""}`,
            title: tipOf(b),
          }),
        );
      } else {
        // 零值:基线上一条小横条,让"没记录"也有位置感
        svgEl.append(
          svg("rect", {
            x: b.x,
            y: baseline - 2.5,
            width: b.w,
            height: 2.5,
            rx: 1.25,
            class: `bar-zero${isNow ? " bar-zero-now" : ""}`,
            title: tipOf(b),
          }),
        );
      }
      if (showValues) {
        svgEl.append(
          svg(
            "text",
            {
              x: b.x + b.w / 2,
              y: b.h > 0 ? b.y - 5 : baseline - 7,
              "text-anchor": "middle",
              class: `bar-value${isNow ? " bar-value-now" : ""}`,
            },
            compactMinutes(b.total),
          ),
        );
      }
    });

    for (const tick of geo.ticks) {
      const b = geo.bars[tick.index];
      const isNow = tick.index === n - 1;
      let text: string;
      if (daily) {
        text =
          n <= 7
            ? weekdayShort(dayKeyToDate(b.from)?.getUTCDay() ?? 0)
            : b.from.slice(5);
      } else {
        // 周桶取起始日(MM-DD);月桶保留 YYYY-MM
        text = b.from.length === 7 ? b.from : b.from.slice(5);
      }
      // 密集图首尾标签贴边收拢,避免溢出 SVG 被裁掉;稀疏时保持居中
      const dense = step < 34;
      const edge = dense ? (tick.index === 0 ? "start" : isNow ? "end" : "middle") : "middle";
      const x = edge === "start" ? Math.max(b.x - b.w / 2, 2) : edge === "end" ? W - 2 : tick.x;
      svgEl.append(
        svg(
          "text",
          {
            x,
            y: H - 6,
            "text-anchor": edge,
            class: `bar-xlabel${isNow ? " bar-xlabel-now" : ""}`,
          },
          text,
        ),
      );
    }

    barBox.append(svgEl);
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
      "aria-label": t("stats.pieAria"),
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
    lineCard.append(h("div", { class: "card-title" }, t("stats.lineTitle")), lineBox);
    clear(lineBox);
    if (stats.perDay.length === 0) {
      lineBox.append(h("div", { class: "empty" }, t("stats.empty")));
      return;
    }
    const catIds = store.data.categories.map((c) => c.id);
    const W = Math.max(Math.round(lineBox.clientWidth) || 0, 320);
    const H = 220;
    const padL = 40;
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
      width: W,
      height: H,
      viewBox: `0 0 ${W} ${H}`,
      class: "line-svg",
      role: "img",
      "aria-label": t("stats.lineAria"),
    });
    // y 网格与刻度(不画坐标轴线,靠网格与标签定位)
    const y0 = H - padB;
    for (const tick of yTicks) {
      const y = y0 - ((H - padT - padB) * tick) / yMax;
      chart.append(svg("line", { x1: padL, y1: y, x2: W - 12, y2: y, class: "grid-line" }));
      chart.append(svg("text", { x: padL - 6, y: y + 4, class: "hm-text", "text-anchor": "end" }, String(tick)));
    }
    chart.append(svg("text", { x: padL - 6, y: y0 + 4, class: "hm-text", "text-anchor": "end" }, "0"));
    for (const tick of xTicks) {
      chart.append(
        svg("text", { x: tick.x, y: y0 + 16, class: "hm-text", "text-anchor": "middle" }, tick.day.slice(5)),
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
    lineBox.append(chart, legend);
  }

  function render(): void {
    renderRangeBar();
    const days = daysForRange();
    const stats = rangeStats(store.data, days[0] ?? todayKey(), days[days.length - 1] ?? todayKey(), days);
    const totals: Record<string, number> = {};
    for (const d of stats.perDay) totals[d.day] = d.total;
    renderBig(stats.total, stats.activeDays, days.length);
    renderBars(days, totals);
    renderPie(stats);
    renderLine(stats);
    drawnBarW = Math.round(barBox.clientWidth);
    drawnBarH = Math.round(barBox.clientHeight);
    drawnLineW = Math.round(lineBox.clientWidth);
  }

  // 容器尺寸变化时按新尺寸重绘(宽度与高度任一变化都要重算)
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => {
      // 面板隐藏时尺寸为 0,没有重绘意义
      if (!root.isConnected || root.offsetParent === null) return;
      const barW = Math.round(barBox.clientWidth);
      const barH = Math.round(barBox.clientHeight);
      const lineW = Math.round(lineBox.clientWidth);
      if (barW !== drawnBarW || barH !== drawnBarH || lineW !== drawnLineW) render();
    });
    ro.observe(trendCard);
    ro.observe(lineCard);
  }

  return { root, render };
}
