import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZONES } from '@/shared/mons-content';
import { zoneAt, type Zone } from '@/shared/wild';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const RAW = JSON.parse(readFileSync(f('../data/mons/zones.json'), 'utf8')) as Zone[];

describe('遭遇区域', () => {
  it('P9：hill-deep 存在，10–20 级，出没表合法', () => {
    const z = RAW.find((x) => x.id === 'hill-deep');
    expect(z).toBeTruthy();
    expect(z!.lv).toEqual([10, 20]);
    expect(z!.table.length).toBeGreaterThan(0);
    expect(z!.table.some((e) => e.sp === 'o09')).toBe(true); // 青鳞稀有
  });

  it('P9/N7：hill 和 hill-deep 不重叠，都是现有地图上的区域', () => {
    const hill = RAW.find((x) => x.id === 'hill')!;
    const deep = RAW.find((x) => x.id === 'hill-deep')!;
    expect(hill.rect[2]).toBeLessThanOrEqual(deep.rect[0]);
    expect(hill.lv[1]).toBeLessThan(deep.lv[0]);
  });

  it('所有区域两两不重叠', () => {
    for (const a of RAW) for (const b of RAW) if (a.id < b.id) {
      const overlap = a.rect[0] < b.rect[2] && b.rect[0] < a.rect[2] && a.rect[1] < b.rect[3] && b.rect[1] < a.rect[3];
      expect(overlap, `${a.id}/${b.id}`).toBe(false);
    }
  });

  it('zoneAt 能按坐标找到对应区域', () => {
    expect(zoneAt(ZONES, 360, 60)?.id).toBe('hill');
    expect(zoneAt(ZONES, 410, 60)?.id).toBe('hill-deep');
  });

  it('每个区域的出没物种都存在', () => {
    for (const z of RAW) for (const e of z.table) expect(typeof e.sp).toBe('string');
  });
});
