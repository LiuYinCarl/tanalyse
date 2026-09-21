/** 30 分钟 × 3 细分弹窗:双击格子后出现。 */

import { h } from "./dom.ts";
import { AppStore } from "../state.ts";
import { SUB_SLOTS } from "../logic/schema.ts";
import { getSlotStates, setSubSlot, setSlot } from "../logic/model.ts";
import { minutesToLabel } from "../logic/time.ts";

export interface ModalHandle {
  close: () => void;
}

/**
 * 打开细分弹窗:把一个 30 分钟格子切成 3 个 10 分钟小格。
 * 点击小格 = 以当前选中分类标记/清除;弹窗内可临时切换目标分类。
 * 直接改动 store 数据并 notifyDataChanged,格子视图经事件自动刷新。
 */
export function openSlotModal(
  store: AppStore,
  dayKey: string,
  slot: number,
  onClose?: () => void,
): ModalHandle {
  const backdrop = h("div", { class: "modal-backdrop" });
  const dialog = h("div", { class: "modal glass", role: "dialog", "aria-modal": "true" });
  let activeCategory = store.selectedCategoryId;

  const titleStart = slot * 30;
  const titleEnd = titleStart + 30;
  const title = h(
    "div",
    { class: "modal-title" },
    h("span", {}, `${minutesToLabel(titleStart)} – ${minutesToLabel(titleEnd)}`),
    h("span", { class: "modal-sub" }, "每个小格 10 分钟"),
  );

  const chips = h("div", { class: "chip-row" });
  const segRow = h("div", { class: "segment-row" });

  const renderChips = (): void => {
    chips.replaceChildren();
    for (const cat of store.data.categories) {
      const selected = activeCategory === cat.id;
      chips.append(
        h(
          "button",
          {
            class: `chip ${selected ? "chip-active" : ""}`,
            style: selected ? `--chip-color: ${cat.color}` : "",
            onclick: () => {
              activeCategory = cat.id;
              store.selectCategory(cat.id);
              renderChips();
              renderSegments();
            },
          },
          h("span", { class: "dot", style: `background: ${cat.color}` }),
          cat.name,
        ),
      );
    }
  };

  const renderSegments = (): void => {
    segRow.replaceChildren();
    const states = getSlotStates(store.data, dayKey, slot);
    for (let sub = 0; sub < SUB_SLOTS; sub++) {
      const catId = states[sub];
      const cat = store.data.categories.find((c) => c.id === catId);
      const start = titleStart + sub * 10;
      segRow.append(
        h(
          "button",
          {
            class: `segment ${catId ? "segment-filled" : ""}`,
            style: catId ? `--seg-color: ${cat?.color ?? "var(--accent)"}` : "",
            title: cat ? cat.name : "未记录",
            onclick: () => {
              if (store.readonlyMode || !activeCategory) return;
              const next = catId === activeCategory ? null : activeCategory;
              setSubSlot(store.data, dayKey, slot, sub, next);
              store.notifyDataChanged();
              renderSegments();
            },
          },
          h("div", { class: "segment-time" }, minutesToLabel(start)),
          h("div", { class: "segment-state" }, cat ? cat.name : "空"),
        ),
      );
    }
  };

  const clearAll = h(
    "button",
    {
      class: "btn btn-ghost",
      onclick: () => {
        if (store.readonlyMode) return;
        setSlot(store.data, dayKey, slot, null);
        store.notifyDataChanged();
        renderSegments();
      },
    },
    "清空",
  );
  const closeBtn = h("button", { class: "btn btn-primary", onclick: () => api.close() }, "完成");

  dialog.append(title, chips, segRow, h("div", { class: "modal-actions" }, clearAll, closeBtn));
  backdrop.append(dialog);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) api.close();
  });
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") api.close();
  };
  window.addEventListener("keydown", onKey);
  document.body.append(backdrop);

  const api: ModalHandle = {
    close: () => {
      backdrop.remove();
      window.removeEventListener("keydown", onKey);
      onClose?.();
    },
  };
  renderChips();
  renderSegments();
  return api;
}
