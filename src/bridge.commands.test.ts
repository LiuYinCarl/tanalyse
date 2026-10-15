/**
 * 守卫测试:前端命令清单与 Rust `invoke_handler!` 必须一一对应。
 * 两边手工维护,这个测试让"只改一边"在 CI 里立刻暴露。
 */

import { describe, expect, it } from "vitest";
import { COMMANDS, ERR_SAVE_CONFLICT } from "./bridge.ts";
import commandsRs from "../src-tauri/src/commands.rs?raw";

/** 从 Rust 的 `generate_handler![...]` 宏里取出注册的命令名。 */
function rustCommands(): string[] {
  const m = /generate_handler!\[([\s\S]*?)\]/.exec(commandsRs);
  if (!m) throw new Error("未在 commands.rs 找到 invoke_handler! 的命令清单");
  return m[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

describe("Tauri 命令清单", () => {
  it("前端 COMMANDS 与 Rust invoke_handler! 完全一致", () => {
    expect(rustCommands().length).toBeGreaterThan(0);
    expect([...COMMANDS].sort()).toEqual(rustCommands().sort());
  });

  it("保存冲突标识与 Rust SAVE_CONFLICT 一致", () => {
    const m = /SAVE_CONFLICT:\s*&str\s*=\s*"([^"]+)"/.exec(commandsRs);
    expect(m?.[1]).toBe(ERR_SAVE_CONFLICT);
  });
});
