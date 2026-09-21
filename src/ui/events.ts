/**
 * 应用内部自定义事件名。
 * 生产者与消费者分处不同模块(grid/heatmap/settings ↔ main),
 * 集中登记避免拼写漂移;window 仅作为无框架环境下的事件总线。
 */
export const EV = {
  /** 热力图点击某天 → 切到格子 Tab */
  gotoGridTab: "goto-grid-tab",
  /** 格子页“+ 分类” → 切到设置 Tab */
  gotoSettingsCategories: "goto-settings-categories",
  /** 格子数据变化 → 重绘热力图 */
  renderHeatmap: "render-heatmap",
} as const;
