import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeContent, makeRng, maxHp, newMon, type Content, type ElementPack, type Species } from '@/shared/mons';
import { applyStatus, startBattle, statusOf, step, type BEvent } from '@/shared/battle';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;
const sp = (id: string): Species => ({ id, no: 1, name: id, types: ['一般'], base: [100, 100, 100, 100, 100, 100], catch: 0.3, learnset: [{ lv: 1, id: '一般:p50' }] });
const CT: Content = makeContent(OPEN, [sp('a')]);
const mon = (id: string) => newMon(CT, 'a', 20, () => 0.5, id, 0);

describe('不能行动时不会死锁', () => {
  const blocked = (k: 'sleep' | 'freeze') => {
    const b = startBattle('b', mon('foe'), [mon('me')]);
    b.wild.hp = 9999; b.squad[0].hp = 9999;
    applyStatus(b, b.squad[0], k, makeRng(1));
    return b;
  };

  it('P1：睡着时提交出招 → 回合照常推进，返回新状态', () => {
    const b = blocked('sleep');
    const r = step(CT, b, { t: 'move', i: 0 }, makeRng(2));
    expect(r.ok).toBe(true);
    expect(b.turn).toBe(2);
    expect(r.ev.some((e) => e.t === 'blocked' && e.side === 'me')).toBe(true);
  });

  it('P2：睡着时提交逃跑 → 不会真的逃走，只推进回合', () => {
    const b = blocked('sleep');
    const r = step(CT, b, { t: 'run' }, makeRng(2));
    expect(r.ok).toBe(true);
    expect(b.result).not.toBe('fled');
    expect(b.phase).not.toBe('over');
    expect(b.turn).toBe(2);
  });

  it('P3：睡着时提交换人 / 扔球 → 也不执行，只推进回合', () => {
    const b = blocked('sleep');
    const r1 = step(CT, b, { t: 'swap', i: 0 }, makeRng(2));
    expect(r1.ok).toBe(true);
    const b2 = blocked('freeze');
    const r2 = step(CT, b2, { t: 'ball', mul: 1 }, makeRng(2));
    expect(r2.ok).toBe(true);
    expect(b2.result).not.toBe('caught');
  });

  it('P4：连续推进直到状态解除，不会卡住', () => {
    const b = blocked('sleep');
    let guard = 0;
    while (statusOf(b, b.squad[0]).length && guard++ < 10) {
      const r = step(CT, b, { t: 'move', i: 0 }, makeRng(guard));
      expect(r.ok).toBe(true);
    }
    expect(statusOf(b, b.squad[0])).toEqual([]);
    expect(b.phase).not.toBe('over');
  });

  it('P5：不能行动时对方照常出招', () => {
    const b = blocked('sleep');
    b.squad[0].hp = maxHp(CT, b.squad[0]);
    const r = step(CT, b, { t: 'move', i: 0 }, makeRng(3));
    expect(r.ev.some((e) => e.t === 'use' && e.side === 'foe')).toBe(true);
  });
});
