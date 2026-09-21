import { defineConfig } from "vitest/config";

// 覆盖率口径:统计全部业务逻辑(logic/ 与状态层 state.ts)。
// src/ui/**(DOM 渲染)与 src/bridge.ts(Tauri IPC 薄封装)不在口径内,
// 由双端真实运行与 cargo test/llvm-cov 覆盖;门槛 90% 由 thresholds 强制。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/logic/**", "src/state.ts"],
      exclude: ["src/**/*.test.ts"],
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 90,
        statements: 90,
      },
    },
  },
});
