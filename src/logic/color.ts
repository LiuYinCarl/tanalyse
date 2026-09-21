/** 颜色工具:十六进制混合,用于从主题色派生色阶(热力图、磨砂层)。 */

export function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** 线性插值混合两个颜色;t=0 返回 a,t=1 返回 b。非法输入返回 fallback。 */
export function hexMix(a: string, b: string, t: number, fallback = "#888888"): string {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb || !Number.isFinite(t)) return fallback;
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(ra[0] + (rb[0] - ra[0]) * k, ra[1] + (rb[1] - ra[1]) * k, ra[2] + (rb[2] - ra[2]) * k);
}

/** 由主题色生成 5 档热力图色阶:第 0 档为底色占位,其余为主题色的透明度渐变。 */
export function heatShades(accent: string): string[] {
  const rgb = hexToRgb(accent);
  const rgba = (a: number): string =>
    rgb ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})` : "#888888";
  return ["var(--heat-empty)", rgba(0.25), rgba(0.45), rgba(0.7), rgba(1)];
}
