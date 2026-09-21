import { describe, expect, it } from "vitest";
import { hexMix, hexToRgb, heatShades, rgbToHex } from "./color.ts";

describe("hexToRgb / rgbToHex", () => {
  it("往返转换", () => {
    expect(hexToRgb("#8FCBA8")).toEqual([143, 203, 168]);
    expect(rgbToHex(143, 203, 168)).toBe("#8fcba8");
    expect(hexToRgb("8FCBA8")).toEqual([143, 203, 168]); // 允许省略 #
  });

  it("拒绝非法输入", () => {
    expect(hexToRgb("#12345")).toBeNull();
    expect(hexToRgb("zzz")).toBeNull();
    expect(hexToRgb("")).toBeNull();
  });

  it("rgbToHex 钳制超界值", () => {
    expect(rgbToHex(300, -20, 127.6)).toBe("#ff0080");
  });
});

describe("hexMix", () => {
  it("端点与中点", () => {
    expect(hexMix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(hexMix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(hexMix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });

  it("钳制与非法输入回退", () => {
    expect(hexMix("#000000", "#ffffff", 5)).toBe("#ffffff");
    expect(hexMix("#000000", "#ffffff", -1)).toBe("#000000");
    expect(hexMix("bad", "#ffffff", 0.5, "#123456")).toBe("#123456");
    expect(hexMix("#000000", "bad", 0.5, "#123456")).toBe("#123456");
    expect(hexMix("#000000", "#ffffff", NaN)).toBe("#888888");
  });
});

describe("heatShades", () => {
  it("输出 5 档且透明度单调递增", () => {
    const shades = heatShades("#8fcba8");
    expect(shades).toHaveLength(5);
    expect(shades[0]).toBe("var(--heat-empty)");
    expect(shades[4]).toBe("rgba(143, 203, 168, 1)");
    const alphas = shades
      .slice(1)
      .map((s) => Number(/rgba\(\d+, \d+, \d+, ([\d.]+)\)/.exec(s)![1]));
    for (let i = 1; i < alphas.length; i++) {
      expect(alphas[i]).toBeGreaterThan(alphas[i - 1]);
    }
  });

  it("非法主题色回退为灰色", () => {
    expect(heatShades("nope")[2]).toBe("#888888");
  });
});
