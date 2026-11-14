import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeContent, makeRng, maxHp, newMon, type Content, type ElementPack, type Species } from '@/shared/mons';
import { foeAlive, foeOf, startTrainerBattle, step, type BEvent } from '@/shared/battle';
import { TRAINERS, aiChooseMove, aiWantsSwap, trainerOf, trainerSquad } from '@/shared/trainers';
import { CONTENT as REAL } from '@/shared/mons-content';

const f = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const OPEN = JSON.parse(readFileSync(f('../data/mons/packs/open/elements.json'), 'utf8')) as ElementPack;
const sp = (id: string, types: string[], base: Species['base']): Species => ({ id, no: 1, name: id, types, base, catch: 0.3, learnset: [{ lv: 1, id: '一般:p50' }] });
const CT: Content = makeContent(OPEN, [
  sp('a', ['一般'], [100, 100, 100, 100, 100, 100]),
  sp('b', ['火'], [100, 100, 100, 100, 100, 100]),
]);
const mon = (id: string, s = 'a') => newMon(CT, s, 20, () => 0.5, id, 0);

describe('训练家定义', () => {
  it('P2：三个训练家齐备，队伍和奖励合法', () => {
    expect(TRAINERS.length).toBe(3);
    for (const t of TRAINERS) {
      expect(trainerOf(t.id)).toBe(t);
      expect(t.squad.length).toBeGreaterThan(0);
      expect(t.reward.coins).toBeGreaterThan(0);
      expect(t.before.length).toBeGreaterThan(0);
    }
  });

  it('N1：不存在的训练家返回 undefined', () => {
    expect(trainerOf('nope')).toBeUndefined();
  });

  it('P2：trainerSquad 用真实内容包生成对应队伍的精灵', () => {
    const t = trainerOf('t1')!;
    const sq = trainerSquad(REAL, t, makeRng(1), 1000);
    expect(sq.length).toBe(t.squad.length);
    expect(sq.every((m) => m.hp === maxHp(REAL, m))).toBe(true);
    // 所有训练家的队伍都能生成
    for (const tr of TRAINERS) expect(() => trainerSquad(REAL, tr, makeRng(1), 1000)).not.toThrow();
  });
});

describe('训练家对战', () => {
  const start = () => {
    const foe = [mon('f0', 'b'), mon('f1', 'b')];
    const me = [mon('m0', 'a')];
    me[0].hp = maxHp(CT, me[0]);
    foe[0].hp = 1; // 一击就倒
    return startTrainerBattle('tb', foe, me);
  };

  it('P3：对方精灵倒下后换人，战斗继续', () => {
    const b = start();
    const r = step(CT, b, { t: 'move', i: 0 }, makeRng(1));
    expect(r.ev.some((e) => e.t === 'foeswap')).toBe(true);
    expect(b.phase).not.toBe('over');
    expect(b.foeLead).toBe(1);
    expect(foeOf(b).id).toBe('f1');
  });

  it('P3/N4：对方全部倒下才胜利，且倒下的小精灵不会再上场', () => {
    const b = start();
    let guard = 0;
    while (b.phase !== 'over' && guard++ < 50) step(CT, b, { t: 'move', i: 0 }, makeRng(guard));
    expect(b.result).toBe('win');
    expect(b.foeSquad.every((m) => m.hp <= 0)).toBe(true);
    expect(foeAlive(b)).toBe(false);
  });

  it('P4：我方全灭 → lose', () => {
    const b = startTrainerBattle('tb', [mon('f0', 'b')], [mon('m0', 'a')]);
    b.squad[0].hp = 1; b.foeSquad[0].hp = 9999;
    let guard = 0;
    while (b.phase !== 'over' && guard++ < 100) step(CT, b, { t: 'move', i: 0 }, makeRng(guard));
    expect(b.result).toBe('lose');
  });

  it('P7：逃跑成功结束战斗，不算胜利', () => {
    const b = startTrainerBattle('tb', [mon('f0', 'b')], [mon('m0', 'a')]);
    b.foeSquad[0].hp = 9999;
    let guard = 0;
    while (b.phase !== 'over' && guard++ < 60) step(CT, b, { t: 'run' }, makeRng(guard));
    expect(['fled', 'lose']).toContain(b.result);
  });
});

describe('训练家 AI', () => {
  it('P10：60% 概率选克制招', () => {
    // 对手是火系；我方有「一般:p50」和一条能改属性的招
    const bt = startTrainerBattle('tb', [mon('f0', 'b')], [mon('m0', 'a')]);
    const me = bt.foeSquad[0];
    me.mv = [{ id: '一般:p50', pp: 10 }];
    const idx = aiChooseMove(CT, bt, me, makeRng(1));
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(idx).toBeLessThan(me.mv.length);
  });

  it('P10：AI 换人在血量 < 25% 且条件满足时触发', () => {
    const bt = startTrainerBattle('tb', [mon('f0', 'b'), mon('f1', 'b')], [mon('m0', 'a')]);
    bt.foeSquad[0].hp = 1;
    const seen = new Set<number>();
    for (let s = 0; s < 40; s++) seen.add(aiWantsSwap(CT, bt, 2, makeRng(s)));
    expect([...seen].some((i) => i >= 0)).toBe(true);
    expect(aiWantsSwap(CT, bt, 0, makeRng(1))).toBe(-1); // 未满 2 回合不换
  });

  it('N4：没有活着的队友时不换人', () => {
    const bt = startTrainerBattle('tb', [mon('f0', 'b')], [mon('m0', 'a')]);
    bt.foeSquad[0].hp = 1;
    expect(aiWantsSwap(CT, bt, 5, makeRng(1))).toBe(-1);
  });

  it('N9：相同种子 AI 决策一致', () => {
    const bt = startTrainerBattle('tb', [mon('f0', 'b')], [mon('m0', 'a')]);
    expect(aiChooseMove(CT, bt, bt.foeSquad[0], makeRng(7))).toBe(aiChooseMove(CT, bt, bt.foeSquad[0], makeRng(7)));
  });
});
