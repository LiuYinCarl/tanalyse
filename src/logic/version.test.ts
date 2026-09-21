import { describe, expect, it } from "vitest";
import { compareSemver, isCompatible, isNewerThan, parseSemver } from "./version.ts";

describe("parseSemver", () => {
  it("解析标准版本号", () => {
    expect(parseSemver("1.2.3")).toEqual({ major: 1, minor: 2, patch: 3, prerelease: [] });
    expect(parseSemver("0.0.0")).toEqual({ major: 0, minor: 0, patch: 0, prerelease: [] });
    expect(parseSemver(" 10.20.30 ")).toEqual({ major: 10, minor: 20, patch: 30, prerelease: [] });
  });

  it("解析 prerelease", () => {
    expect(parseSemver("1.0.0-beta.1")?.prerelease).toEqual(["beta", "1"]);
    expect(parseSemver("1.0.0-rc.2.3")?.prerelease).toEqual(["rc", "2", "3"]);
  });

  it("拒绝非法输入", () => {
    expect(parseSemver("1.2")).toBeNull();
    expect(parseSemver("1.2.3.4")).toBeNull();
    expect(parseSemver("v1.2.3")).toBeNull();
    expect(parseSemver("abc")).toBeNull();
    expect(parseSemver("")).toBeNull();
    expect(parseSemver("1.2.3-")).toBeNull();
    expect(parseSemver("99999999999.0.0")).toBeNull();
  });
});

describe("compareSemver", () => {
  it("比较主/次/修订号", () => {
    expect(compareSemver("1.0.0", "2.0.0")).toBe(-1);
    expect(compareSemver("2.1.0", "2.0.9")).toBe(1);
    expect(compareSemver("2.0.1", "2.0.0")).toBe(1);
    expect(compareSemver("3.4.5", "3.4.5")).toBe(0);
  });

  it("prerelease 低于正式版", () => {
    expect(compareSemver("1.0.0-alpha", "1.0.0")).toBe(-1);
    expect(compareSemver("1.0.0", "1.0.0-beta")).toBe(1);
  });

  it("prerelease 内部比较遵循 semver 规则", () => {
    expect(compareSemver("1.0.0-alpha", "1.0.0-beta")).toBe(-1);
    expect(compareSemver("1.0.0-alpha.1", "1.0.0-alpha.2")).toBe(-1);
    expect(compareSemver("1.0.0-alpha.2", "1.0.0-alpha.10")).toBe(-1);
    expect(compareSemver("1.0.0-alpha", "1.0.0-alpha.1")).toBe(-1);
    expect(compareSemver("1.0.0-alpha.1", "1.0.0-alpha.beta")).toBe(-1); // 数字 < 字母
  });

  it("非法输入返回 null", () => {
    expect(compareSemver("x", "1.0.0")).toBeNull();
    expect(compareSemver("1.0.0", "y")).toBeNull();
  });
});

describe("isNewerThan / isCompatible", () => {
  it("检测更新版本", () => {
    expect(isNewerThan("2.0.0", "1.9.9")).toBe(true);
    expect(isNewerThan("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerThan("garbage", "1.0.0")).toBe(false);
  });

  it("兼容性要求主版本一致且不高于当前", () => {
    expect(isCompatible("1.0.0", "1.2.0")).toBe(true);
    expect(isCompatible("1.2.0", "1.2.0")).toBe(true);
    expect(isCompatible("1.3.0", "1.2.0")).toBe(false);
    expect(isCompatible("2.0.0", "1.2.0")).toBe(false);
    expect(isCompatible("bad", "1.2.0")).toBe(false);
  });
});
