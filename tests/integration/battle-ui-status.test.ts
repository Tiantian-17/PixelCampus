// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
vi.mock('@/audio/sfx', () => ({ sfx: vi.fn() }));

import type { NetClient } from '@/net/client';
import type { ServerMsg } from '@/shared/protocol';
import type { BEvent } from '@/shared/battle';
import type { Mon } from '@/shared/mons';
import { BattleUi } from '@/ui/BattleUi';

type Bt = Extract<ServerMsg, { t: 'mon_bt' }>;

class FakeNet {
  handlers: Record<string, ((...a: any[]) => void) | undefined> = {};
  monGo = vi.fn();
  monAct = vi.fn();
}

const mon = (): Mon => ({
  id: 'm1', sp: 'o01', lv: 20, xp: 0, hp: 30, iv: [0, 0, 0, 0, 0, 0],
  mv: [{ id: '火:p50', pp: 25 }, { id: '火:s50', pp: 25 }], at: 0,
});
const bt = (over: Partial<Bt> = {}): Bt => ({
  t: 'mon_bt', bid: 'b1', turn: 1, phase: 'choose', lead: 0, sq: [mon()],
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

describe('战斗界面 · 状态异常', () => {
  it('P11/N12：卡片显示状态文字标签', async () => {
    await send(bt());
    await send(bt({ turn: 2, ev: [{ t: 'status', side: 'foe', k: 'poison' }] }));
    const foe = document.querySelector('.bt-card.foe')?.textContent ?? '';
    expect(foe).toContain('中毒');
    expect(document.querySelector('.bt-card.foe .bt-status.poison')).toBeTruthy();
  });

  it('P11：日志写「中毒了」和每回合伤害', async () => {
    await send(bt());
    await send(bt({ turn: 2, ev: [{ t: 'status', side: 'foe', k: 'poison' }] }));
    await send(bt({ turn: 3, ev: [{ t: 'statusdmg', side: 'foe', k: 'poison', dmg: 2, hp: 8 }] }));
    const log = document.querySelector('.bt-log')?.textContent ?? '';
    expect(log).toContain('中毒');
    expect(log).toContain('伤害');
  });

  it('P11：状态解除后标签消失', async () => {
    await send(bt());
    await send(bt({ turn: 2, ev: [{ t: 'status', side: 'foe', k: 'sleep', v: 2 }] }));
    expect(document.querySelector('.bt-card.foe .bt-status.sleep')).toBeTruthy();
    await send(bt({ turn: 3, ev: [{ t: 'statusend', side: 'foe', k: 'sleep' }] }));
    expect(document.querySelector('.bt-card.foe .bt-status.sleep')).toBeNull();
  });

  it('P12：玩家被睡住时显示提示，并自动提交一次行动（防死锁）', async () => {
    await send(bt());
    await send(bt({ turn: 2, ev: [{ t: 'status', side: 'me', k: 'sleep', v: 1 }, { t: 'blocked', side: 'me', k: 'sleep' }] }));
    expect(document.querySelector('.bt-blocked')?.textContent).toContain('无法行动');
    // 按钮不再全部禁用（否则服务器等不到行动会卡住）
    const btns = [...document.querySelectorAll('.bt-menu button')] as HTMLButtonElement[];
    expect(btns.length).toBeGreaterThan(0);
    expect(btns.every((b) => b.disabled)).toBe(false);
    await tick();
    expect(net.monAct).toHaveBeenCalled();
  });
});
