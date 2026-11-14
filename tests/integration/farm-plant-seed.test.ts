// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';

import { FarmPanel } from '@/ui/FarmPanel';
import type { ServerMsg } from '@/shared/protocol';

type Farm = Extract<ServerMsg, { t: 'farm' }>;

class FakeNet {
  handlers: Record<string, ((...a: any[]) => void) | undefined> = {};
  status = 'online';
  getFarm = vi.fn();
  farmOp = vi.fn();
}

const farmMsg = (): Farm => ({
  t: 'farm', uid: 1, name: '我', mine: true, today: 100,
  plots: [{ c: '', p: 0, w: 0, wd: 0, k: 0, t: true }],
  stealLeft: 2, log: [],
});

const click = (text: string) => {
  const b = [...document.querySelectorAll('button')].find((e) => e.textContent === text);
  if (!b) throw new Error(`找不到按钮：${text}；现有：${[...document.querySelectorAll('button')].map((e) => e.textContent).join('|')}`);
  (b as HTMLButtonElement).click();
};

describe('农场面板：播种传给服务端的种子 id', () => {
  it('播种发的是种子物品 id（seed_cabbage），不是作物 id', () => {
    const net = new FakeNet();
    const panel = new FarmPanel(net as any, {} as any, {
      friends: () => [], season: () => 'spring', inv: () => ({ seed_cabbage: 1 }),
    });
    panel.open();
    net.handlers.farm?.(farmMsg());

    click('种子袋');
    click('选它');
    click('播种');

    expect(net.farmOp).toHaveBeenCalledWith('plant', 0, { seed: 'seed_cabbage', uid: undefined });
  });
});
