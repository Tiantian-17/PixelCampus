// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@/audio/sfx', () => ({ sfx: vi.fn() }));

import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import type { Mon } from '@/shared/mons';
import { BattleUi } from '@/ui/BattleUi';
import { moveDesc } from '@/ui/monBattleHelpers';
import { ALL_ND_MOVES } from '@/shared/nondamage-moves';

type Bt = Extract<ServerMsg, { t: 'mon_bt' }>;

class FakeNet {
  handlers: Record<string, ((...a: any[]) => void) | undefined> = {};
  monGo = vi.fn();
  monAct = vi.fn();
}

const mon = (moves: string[]): Mon => ({
  id: 'm1', sp: 'o01', lv: 20, xp: 0, hp: 30, iv: [0, 0, 0, 0, 0, 0],
  mv: moves.map((id) => ({ id, pp: 10 })), at: 0,
});
const bt = (over: Partial<Bt> = {}): Bt => ({
  t: 'mon_bt', bid: 'b1', turn: 1, phase: 'choose', lead: 0, sq: [mon(['nd:regen', 'nd:swords'])],
  foe: { sp: 'o04', lv: 5, hp: 10, max: 20 }, ev: [], ball: 3, zone: '测试', ...over,
});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
const tick = async () => { await vi.runAllTimersAsync(); await flush(); };

let net: FakeNet;
let ui: BattleUi;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  document.body.replaceChildren();
  const hud = document.createElement('div'); hud.id = 'hud'; document.body.append(hud);
  net = new FakeNet();
  ui = new BattleUi(net as unknown as NetClient);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
const send = async (m: Bt) => { net.handlers.monBt?.(m); await tick(); };
const showMoves = () => {
  const b = [...document.querySelectorAll('.bt-menu .btn')].find((x) => x.textContent === '战斗') as HTMLButtonElement;
  b.click();
};

describe('战斗界面 · 非伤害招式', () => {
  it('P10：菜单显示「威力 —」和效果说明', async () => {
    await send(bt());
    showMoves();
    const moves = [...document.querySelectorAll('.bt-move')].map((b) => b.textContent ?? '');
    expect(moves[0]).toContain('威力—');
    expect(moves[0]).toContain('1/2 生命');
    expect(moves[1]).toContain('攻击 +2');
  });

  it('P11：睡 / 冻时显示无法行动的提示，并自动提交一次行动推进回合（按钮不再禁用，否则会卡住）', async () => {
    await send(bt());
    await send(bt({ turn: 2, ev: [{ t: 'status', side: 'me', k: 'sleep', v: 2 }, { t: 'blocked', side: 'me', k: 'sleep' }] }));
    const btns = [...document.querySelectorAll('.bt-menu button')] as HTMLButtonElement[];
    expect(btns.length).toBeGreaterThan(0);
    expect(btns.every((b) => b.disabled)).toBe(false);
    await tick();
    expect(net.monAct).toHaveBeenCalled();
  });

  it('moveDesc 覆盖回复 / 变化 / 保护 / 吸取', () => {
    const byId = new Map(ALL_ND_MOVES.map((m) => [m.id, m]));
    expect(moveDesc(byId.get('nd:sleep')!)).toContain('回满');
    expect(moveDesc(byId.get('nd:regen')!)).toContain('1/2');
    expect(moveDesc(byId.get('nd:swords')!)).toContain('攻击');
    expect(moveDesc(byId.get('nd:guard')!)).toContain('免伤');
    expect(moveDesc(byId.get('nd:drain')!)).toMatch(/50%|一半/);
  });
});
