/**
 * 模糊测试(fast-check 属性测试):随机操作序列下的模型不变量。
 * 运行:`npm test`(默认每个属性 100 组随机输入)。
 */

import fc from "fast-check";
import { beforeAll } from "vitest";
import { describe, expect, it } from "vitest";
import {
  clearDay,
  dayMinutes,
  getDay,
  getSlotStates,
  rangeStats,
  setSlot,
  setSubSlot,
  toggleSlot,
} from "./model.ts";
import {
  POSITIONS_PER_DAY,
  SLOTS_PER_DAY,
  createDefaultData,
  emptyDay,
} from "./schema.ts";
import { serializeData, loadData } from "./migrate.ts";
import { compareSemver, isNewerThan } from "./version.ts";
import { dayRange } from "./time.ts";

const dayArb = fc.integer({ min: 0, max: 400 }).map((n) =>
  new Date(Date.UTC(2025, 0, 1 + n)).toISOString().slice(0, 10),
);
const slotArb = fc.integer({ min: 0, max: SLOTS_PER_DAY - 1 });
const subArb = fc.integer({ min: 0, max: 2 });
const catArb = fc.constantFrom("work", "rest");
const catOrNullArb = fc.option(catArb, { nil: null });

import { setLocale } from "./i18n.ts";
beforeAll(() => setLocale("zh"));

describe("模糊测试:格子模型不变量", () => {
  it("任意设置序列后,每天数组长度恰为 144", () => {
    const opsArb = fc.array(
      fc.oneof(
        fc.tuple(dayArb, slotArb, catArb).map(([d, s, c]) => ({ kind: "slot" as const, d, s, c })),
        fc.tuple(dayArb, slotArb, subArb, catOrNullArb).map(([d, s, sub, c]) => ({
          kind: "sub" as const,
          d,
          s,
          sub,
          c,
        })),
        dayArb.map((d) => ({ kind: "clear" as const, d })),
      ),
      { maxLength: 300 },
    );
    fc.assert(
      fc.property(opsArb, (ops) => {
        const data = createDefaultData();
        for (const op of ops) {
          if (op.kind === "slot") setSlot(data, op.d, op.s, op.c);
          else if (op.kind === "sub") setSubSlot(data, op.d, op.s, op.sub, op.c);
          else clearDay(data, op.d);
        }
        for (const day of Object.values(data.entries)) {
          expect(day.length).toBe(POSITIONS_PER_DAY);
        }
      }),
      { numRuns: 60 },
    );
  });

  it("toggle 两次回到原状态(幂等)", () => {
    fc.assert(
      fc.property(dayArb, slotArb, catArb, (day, slot, cat) => {
        const data = createDefaultData();
        const before = getSlotStates(data, day, slot);
        toggleSlot(data, day, slot, cat);
        toggleSlot(data, day, slot, cat);
        expect(getSlotStates(data, day, slot)).toEqual(before);
      }),
      { numRuns: 300 },
    );
  });

  it("单天分钟数 = 非空位置数 × 10,且不超过 24 小时", () => {
    fc.assert(
      fc.property(
        dayArb,
        fc.array(fc.tuple(slotArb, subArb, catArb), { maxLength: 150 }),
        (day, ops) => {
          const data = createDefaultData();
          for (const [s, sub, c] of ops) setSubSlot(data, day, s, sub, c);
          const t = dayMinutes(data, day);
          expect(t.total).toBeLessThanOrEqual(24 * 60);
          const filled = getDay(data, day).filter((v) => v !== null).length;
          expect(t.total).toBe(filled * 10);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("rangeStats 总分钟 = 各天之和 = 去重格子数 × 30", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(dayArb, slotArb, catArb), { maxLength: 100 }), (ops) => {
        const data = createDefaultData();
        for (const [d, s, c] of ops) setSlot(data, d, s, c);
        const stats = rangeStats(data, "2025-01-01", "2026-02-05", dayRange("2025-01-01", "2026-02-05"));
        const sumByDay = stats.perDay.reduce((sum, d) => sum + d.total, 0);
        expect(stats.total).toBe(sumByDay);
        const distinct = new Set(ops.map(([d, s]) => `${d}#${s}`)).size;
        expect(stats.total).toBe(distinct * 30);
        const catSum = Object.values(stats.byCategory).reduce((a, b) => a + b, 0);
        expect(catSum).toBe(stats.total);
      }),
      { numRuns: 60 },
    );
  });

  it("JSON 序列化 → 加载往返无损", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(dayArb, slotArb, catArb), { maxLength: 80 }), (ops) => {
        const data = createDefaultData();
        for (const [d, s, c] of ops) setSlot(data, d, s, c);
        const round = loadData(serializeData(data));
        expect(round.repairs).toEqual([]);
        expect(round.data.entries).toEqual(data.entries);
        expect(round.data.settings).toEqual(data.settings);
      }),
      { numRuns: 100 },
    );
  });

  it("未记录日期读取等价于空白模板", () => {
    const data = createDefaultData();
    expect(getDay(data, "1999-12-31")).toEqual(emptyDay());
  });
});

describe("模糊测试:语义版本号全序", () => {
  const semverArb = fc.record({
    major: fc.nat({ max: 50 }),
    minor: fc.nat({ max: 50 }),
    patch: fc.nat({ max: 50 }),
  });
  const toStr = (v: { major: number; minor: number; patch: number }) =>
    `${v.major}.${v.minor}.${v.patch}`;

  it("反对称且传递", () => {
    fc.assert(
      fc.property(semverArb, semverArb, semverArb, (a, b, c) => {
        const sa = toStr(a);
        const sb = toStr(b);
        const sc = toStr(c);
        const ab = compareSemver(sa, sb)!;
        const ba = compareSemver(sb, sa)!;
        expect(Math.sign(ab)).toBe(-Math.sign(ba));
        const bc = compareSemver(sb, sc)!;
        const ac = compareSemver(sa, sc)!;
        if (ab <= 0 && bc <= 0) expect(ac).toBeLessThanOrEqual(0);
      }),
      { numRuns: 200 },
    );
  });

  it("同版本比较为 0 且不新于自身", () => {
    fc.assert(
      fc.property(semverArb, (v) => {
        const s = toStr(v);
        expect(compareSemver(s, s)).toBe(0);
        expect(isNewerThan(s, s)).toBe(false);
      }),
      { numRuns: 100 },
    );
  });
});

describe("模糊测试:数据加载对任意输入不崩溃", () => {
  it("任意 JSON 字符串输入返回可用的默认数据结构", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 4000 }), (s) => {
        const r = loadData(s);
        expect(r.data.version).toBeTruthy();
        expect(r.data.categories.length).toBeGreaterThan(0);
        expect(r.data.settings.theme).toMatch(/^(system|light|dark)$/);
      }),
      { numRuns: 400 },
    );
  });

  it("任意结构的对象输入被清洗为合法 schema", () => {
    const junkArb = fc.record({
      version: fc.option(fc.string({ maxLength: 12 }), { nil: null }),
      categories: fc.option(fc.array(fc.anything(), { maxLength: 6 }), { nil: null }),
      entries: fc.option(fc.dictionary(fc.string({ maxLength: 12 }), fc.anything(), { maxKeys: 6 }), { nil: null }),
      settings: fc.option(fc.anything(), { nil: null }),
    });
    fc.assert(
      fc.property(junkArb, (junk) => {
        const r = loadData(JSON.stringify(junk));
        for (const day of Object.values(r.data.entries)) {
          expect(day).toHaveLength(POSITIONS_PER_DAY);
          for (const v of day) expect(v === null || typeof v === "string").toBe(true);
        }
        expect(r.data.settings.theme).toMatch(/^(system|light|dark)$/);
      }),
      { numRuns: 200 },
    );
  });
});
