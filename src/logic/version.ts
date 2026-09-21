/** 语义版本号(SemVer 2.0.0)解析与比较,用于数据文件中的 `version` 字段。 */

export interface SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
}

/**
 * 解析语义版本号。非法输入返回 null。
 * 支持 `1.2.3`、`1.2.3-beta.1` 等形式。
 */
export function parseSemver(input: string): SemVer | null {
  if (typeof input !== "string") return null;
  const m = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+(?:\.[0-9A-Za-z.-]+)*))?$/.exec(
    input.trim(),
  );
  if (!m) return null;
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3]);
  if (!Number.isFinite(major) || !Number.isFinite(minor) || !Number.isFinite(patch)) {
    return null;
  }
  if (major > 0xffffffff || minor > 0xffffffff || patch > 0xffffffff) return null;
  const prerelease = m[4] ? m[4].split(".") : [];
  return { major, minor, patch, prerelease };
}

function compareNumber(a: number, b: number): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function comparePrerelease(a: string[], b: string[]): number {
  // 无 prerelease 的版本高于有 prerelease 的版本
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0) return 1;
  if (b.length === 0) return -1;
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const pa = a[i];
    const pb = b[i];
    if (pa === undefined) return -1;
    if (pb === undefined) return 1;
    const na = /^\d+$/.test(pa);
    const nb = /^\d+$/.test(pb);
    if (na && nb) {
      const c = compareNumber(Number(pa), Number(pb));
      if (c !== 0) return c;
    } else if (na !== nb) {
      return na ? -1 : 1; // 数字标识符低于字母标识符
    } else if (pa !== pb) {
      return pa < pb ? -1 : 1;
    }
  }
  return 0;
}

/** 比较两个语义版本:a<b 返回 -1,a>b 返回 1,相等返回 0。非法版本返回 null。 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 | null {
  const va = parseSemver(a);
  const vb = parseSemver(b);
  if (!va || !vb) return null;
  let c = compareNumber(va.major, vb.major);
  if (c !== 0) return c as -1 | 1;
  c = compareNumber(va.minor, vb.minor);
  if (c !== 0) return c as -1 | 1;
  c = compareNumber(va.patch, vb.patch);
  if (c !== 0) return c as -1 | 1;
  return comparePrerelease(va.prerelease, vb.prerelease) as -1 | 0 | 1;
}

/** 判断 `version` 是否比 `base` 更新(用于检测“数据来自更新版本的程序”)。 */
export function isNewerThan(version: string, base: string): boolean {
  const c = compareSemver(version, base);
  return c !== null && c > 0;
}

/** 判断 `version` 是否兼容当前程序版本(主版本号一致且不高于当前版本)。 */
export function isCompatible(version: string, current: string): boolean {
  const v = parseSemver(version);
  const cur = parseSemver(current);
  if (!v || !cur) return false;
  return v.major === cur.major && !isNewerThan(version, current);
}
