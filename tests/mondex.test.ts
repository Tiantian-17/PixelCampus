import { describe, it, expect } from 'vitest';
import { CONTENT, ZONES } from '@/shared/mons-content';
import type { DexEntry } from '@/shared/monbox';
import { chainOf, habitatOf, monDexGroups, monDexProgress, monDexRows, monDexZoneOptions } from '@/ui/mondexModel';

type Dex = Record<string, DexEntry>;
const d = (entries: Record<string, [number, number]>): Dex =>
  Object.fromEntries(Object.entries(entries).map(([id, [s, c]]) => [id, { s, c }]));
const rowOf = (rows: ReturnType<typeof monDexRows>, id: string) => rows.find((r) => r.sp.id === id)!;

describe('精灵图鉴 · 分组 / 进度 / 排序', () => {
  it('P1/P2：开放包 / 猫系 / 登录赠送三组，组内按 No. 排序，总数 83', () => {
    const groups = monDexGroups(CONTENT, {}, ZONES);
    expect(groups.map((g) => g.id)).toEqual(['open', 'cat', 'dm']);
    expect(groups[0].rows.map((r) => r.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(groups[1].rows).toHaveLength(72);
    expect(groups[2].rows[0].sp.id).toBe('dm');
    expect(monDexProgress(monDexRows(CONTENT, {}, ZONES))).toEqual({ seen: 0, caught: 0, total: 83 });
  });

  it('P2：每组进度正确（见过 / 收服 / 总数）', () => {
    const dex = d({ o01: [1, 1], o02: [1, 0], c00a: [1, 0] });
    const groups = monDexGroups(CONTENT, dex, ZONES);
    expect(groups[0]).toMatchObject({ seen: 2, caught: 1, total: 10 });
    expect(groups[1]).toMatchObject({ seen: 1, caught: 0, total: 72 });
    expect(groups[2]).toMatchObject({ seen: 0, caught: 0, total: 1 });
  });
});

describe('精灵图鉴 · 见过 / 未见过', () => {
  it('P3/P4：见过显示名字 / 属性 / 次数；收服次数与 dex.c 一致', () => {
    const rows = monDexRows(CONTENT, d({ o01: [3, 1], o02: [2, 0] }), ZONES);
    const a = rowOf(rows, 'o01'), b = rowOf(rows, 'o02');
    expect(a).toMatchObject({ seen: true, caught: 1, name: '焰尾', types: ['火'] });
    expect(a.art).toBe('assets/generated/mons/o01-front.png');
    expect(b).toMatchObject({ seen: true, caught: 0, name: '湖鲸' });
  });

  it('P5/N1：未见过只保留 No. 和「？？？」，不泄露名字 / 描述 / 属性 / 图 / 栖息地 / 进化链', () => {
    const r = rowOf(monDexRows(CONTENT, {}, ZONES), 'o01');
    expect(r.seen).toBe(false);
    expect(r.name).toBe('？？？');
    expect(r.desc).toBe('');
    expect(r.types).toEqual([]);
    expect(r.art).toBeNull();
    expect(r.habitat).toBe('');
    expect(r.chain).toEqual([]);
    expect(r.no).toBe(1);
  });

  it('P9：见过详情有 No. / 属性 / 描述 / 栖息地 / 记录；无六维 / 技能字段', () => {
    const r = rowOf(monDexRows(CONTENT, d({ o01: [1, 0] }), ZONES), 'o01');
    expect(r.no).toBe(1);
    expect(r.types).toEqual(['火']);
    expect(r.desc).toContain('尾巴');
    expect(r.habitat).toBe('图书馆西侧林地、北山坡');
    expect(r.chain).toEqual([]);
    expect('stats' in r).toBe(false);
    expect('moves' in r).toBe(false);
  });

  it('P8/N11：猫系进化链带等级；未见过阶段「？？？」；无 chain 物种返回空', () => {
    const chain = chainOf(CONTENT.species.get('c00a')!, CONTENT, d({ c00a: [1, 0] }));
    expect(chain.map((x) => x.name)).toEqual(['橘崽', '？？？', '？？？']);
    expect(chain.map((x) => x.lv)).toEqual([undefined, 16, 32]);
    expect(chainOf(CONTENT.species.get('o01')!, CONTENT, {})).toEqual([]);
  });

  it('N10：猫系 / 耄耋的栖息地 fallback，不出现 undefined', () => {
    expect(habitatOf('c00a', ZONES)).toBe('校园猫');
    expect(habitatOf('dm', ZONES)).toBe('登录赠送');
    expect(habitatOf('o01', ZONES)).toBe('图书馆西侧林地、北山坡');
    expect(habitatOf('nope', ZONES)).toBe('—');
  });
});

describe('精灵图鉴 · 筛选', () => {
  it('P6/N2：属性筛选只作用于见过的精灵', () => {
    const dex = d({ o01: [1, 0], o02: [1, 0] });
    const rows = monDexRows(CONTENT, dex, ZONES, { type: '火' });
    expect(rows.map((r) => r.sp.id)).toEqual(['o01']);
    expect(rows.some((r) => !r.seen)).toBe(false);
  });

  it('P7：只看收服只留 c > 0', () => {
    const rows = monDexRows(CONTENT, d({ o01: [1, 1], o02: [1, 0] }), ZONES, { caughtOnly: true });
    expect(rows.map((r) => r.sp.id)).toEqual(['o01']);
  });

  it('P8：区域筛选；校园猫 / 登录赠送分别筛选', () => {
    const dex = d({ o01: [1, 0], o02: [1, 0], c00a: [1, 0], dm: [1, 0] });
    expect(monDexRows(CONTENT, dex, ZONES, { zone: 'grove' }).map((r) => r.sp.id)).toEqual(['o01']);
    expect(monDexRows(CONTENT, dex, ZONES, { zone: 'cat' }).map((r) => r.sp.id)).toEqual(['c00a']);
    expect(monDexRows(CONTENT, dex, ZONES, { zone: 'dm' }).map((r) => r.sp.id)).toEqual(['dm']);
  });

  it('N8/N9：多条件取交集，清空恢复全部', () => {
    const dex = d({ o01: [1, 1], o02: [1, 0] });
    expect(monDexRows(CONTENT, dex, ZONES, { type: '火', zone: 'grove', caughtOnly: true }).map((r) => r.sp.id)).toEqual(['o01']);
    expect(monDexRows(CONTENT, dex, ZONES, { type: '水', zone: 'grove' })).toEqual([]);
    expect(monDexRows(CONTENT, dex, ZONES, {})).toHaveLength(83);
  });

  it('P8：区域选项 = 野外区域 + 校园猫 + 登录赠送', () => {
    expect(monDexZoneOptions(ZONES).map((z) => z.id)).toEqual(['lake', 'grove', 'hill', 'hill-deep', 'cat', 'dm']);
  });
});

describe('精灵图鉴 · 容错', () => {
  it('N3：不认识的物种 id 被跳过，不抛错', () => {
    const rows = monDexRows(CONTENT, d({ 'nope': [1, 1] }), ZONES);
    expect(rows).toHaveLength(83);
    expect(rows.some((r) => r.sp.id === 'nope')).toBe(false);
  });

  it('N4/N12：dex 缺条目 / 空 dex 按未见过处理，0 / 总数', () => {
    expect(monDexProgress(monDexRows(CONTENT, {}, ZONES))).toEqual({ seen: 0, caught: 0, total: 83 });
    expect(rowOf(monDexRows(CONTENT, {}, ZONES), 'o01').seen).toBe(false);
  });
});
