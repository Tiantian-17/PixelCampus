import { describe, it, expect } from 'vitest';
import {
  CROPS, cropDef, cropOfSeed, cleanFarm, settleFarm, plotStage, growthText,
  canPlant, plantPlot, waterPlot, canWater, harvestYield, stealLimit, canSteal,
  stealLeftOf, emptyPlot, FARM_SLOTS,
  STEAL_DAILY_MAX, FARM_LOG_MAX, farmDayAt,
  type FarmPlot, type FarmSave,
} from '../src/shared/farming';
import { itemDef } from '../src/shared/items';
import { ICONS } from '../tools/art/items';
import { SEASONS } from '../src/shared/season';

/** 一块种下 day 天、浇过 water 次的番茄地（种了东西的地默认已翻土） */
const plot = (crop: string, p: number, water = 0, extra: Partial<FarmPlot> = {}): FarmPlot => ({
  c: crop, p, w: water, wd: 0, k: 0, t: true, ...extra,
});
const save = (plots: FarmPlot[] = [], extra: Partial<FarmSave> = {}): FarmSave => ({
  plots: [...plots, ...Array.from({ length: Math.max(0, FARM_SLOTS - plots.length) }, emptyPlot)],
  day: 1, sl: 0, log: [], ...extra,
});

describe('作物目录', () => {
  it('8 种作物，id / 种子一一对应，四季都有覆盖', () => {
    expect(CROPS.length).toBe(8);
    for (const c of CROPS) {
      expect(cropDef(c.id), c.id).toBe(c);
      expect(cropOfSeed(c.seed), c.seed).toBe(c);
    }
    for (const s of SEASONS) expect(CROPS.some((c) => c.seasons.includes(s)), s).toBe(true);
  });

  it('每种作物都有背包物品和图标（三者必须一致）', () => {
    for (const c of CROPS) {
      expect(itemDef(c.id), c.id).toBeTruthy();
      expect(itemDef(c.seed), c.seed).toBeTruthy();
      expect(ICONS[c.id], c.id).toBeTruthy();
      expect(ICONS[c.seed], c.seed).toBeTruthy();
    }
  });

  it('单块地一个循环的净收益折算到每小时不超过 200 币（不能比钓鱼更赚）', () => {
    for (const c of CROPS) {
      const net = c.yield * c.price - c.seedPrice;
      const perHour = (net / (c.days * 20)) * 60 * FARM_SLOTS;
      expect(perHour, `${c.name} ${perHour.toFixed(0)}/h`).toBeLessThan(200);
      expect(net, `${c.name} 不能亏本`).toBeGreaterThan(0);
    }
  });
});

describe('成长与状态 plotStage', () => {
  it('没浇水一直不熟，成熟天数够了才算熟', () => {
    const p = plot('crop_tomato', 10, 0);
    expect(plotStage(p, 20)).toBe('growing');
    const w4 = plot('crop_tomato', 10, 4);
    expect(plotStage(w4, 13)).toBe('growing'); // 浇够了但还没过满 4 个游戏日
    expect(plotStage(w4, 14)).toBe('ripe');
  });

  it('空地返回 empty，未知作物也当空地', () => {
    expect(plotStage(emptyPlot(), 5)).toBe('empty');
    expect(plotStage(plot('crop_nope', 1, 3), 9)).toBe('empty');
  });

  it('熟了就一直能收，不会枯萎', () => {
    const p = plot('crop_cabbage', 10, 2);
    const ripeDay = 10 + 2;
    expect(plotStage(p, ripeDay)).toBe('ripe');
    expect(plotStage(p, ripeDay + 3)).toBe('ripe');
    expect(plotStage(p, ripeDay + 999)).toBe('ripe');
  });

  it('没长熟的作物一直按浇水天数长（玩家几天不上线也不会被清空）', () => {
    expect(plotStage(plot('crop_wheat', 10, 2), 999)).toBe('growing');
  });

  it('growthText 给出进度 / 可收', () => {
    expect(growthText(emptyPlot(), 1)).toBe('');
    expect(growthText(plot('crop_tomato', 10, 2), 12)).toBe('番茄 2/4 天');
    expect(growthText(plot('crop_tomato', 10, 4), 14)).toBe('番茄（可以收了）');
    expect(growthText(plot('crop_tomato', 10, 4), 999)).toBe('番茄（可以收了）');
  });
});

describe('播种 canPlant（不再分季节）', () => {
  it('任何季节都能种同一种作物', () => {
    for (const c of CROPS) {
      for (const s of SEASONS) {
        expect(canPlant(c.id).ok, `${c.id}@${s}`).toBe(true);
      }
    }
  });

  it('不存在的作物返回失败', () => {
    expect(canPlant('crop_nope').ok).toBe(false);
  });
});

describe('浇水', () => {
  it('一天只能浇一次；浇满了就不用再浇', () => {
    const p = waterPlot(plantPlot('crop_tomato', 10), 10);
    expect(p.w).toBe(1);
    expect(p.wd).toBe(10);
    expect(canWater(p, 10).ok).toBe(false);
    expect(canWater(p, 11).ok).toBe(true);

    const full = plot('crop_tomato', 10, 4, { wd: 11 });
    expect(canWater(full, 12).ok).toBe(false);
  });

  it('空地 / 熟了的不能浇', () => {
    expect(canWater(emptyPlot(), 1).ok).toBe(false);
    expect(canWater(plot('crop_cabbage', 1, 2), 1 + 2 + 30).ok).toBe(false);
  });

  it('同一块地一天只能浇一次；浇水不花钱、不限次数', () => {
    const p = plot('crop_tomato', 1, 0);
    expect(canWater(p, 1).ok).toBe(true);
    expect(canWater(waterPlot(p, 1), 1).ok).toBe(false); // 今天浇过了
    expect(canWater(waterPlot(p, 1), 2).ok).toBe(true); // 第二天还能浇
    expect(canWater(plot('crop_tomato', 1, 4), 9).ok).toBe(false); // 已经长好
  });

  it('stealLeftOf 不会为负', () => {
    expect(stealLeftOf(save([]))).toBe(STEAL_DAILY_MAX);
    expect(stealLeftOf(save([], { sl: STEAL_DAILY_MAX + 9 }))).toBe(0);
  });
});

describe('收获与偷摘', () => {
  it('收获数量 = 产量 - 已被偷的', () => {
    expect(harvestYield(plot('crop_tomato', 1, 4))).toBe(3);
    expect(harvestYield(plot('crop_tomato', 1, 4, { k: 1 }))).toBe(2);
    expect(harvestYield(emptyPlot())).toBe(0);
  });

  it('产量 1 的作物不可偷，其余最多被偷一半且永远给主人留 1 个', () => {
    expect(stealLimit(plot('crop_watermelon', 1, 4))).toBe(0);
    expect(stealLimit(plot('crop_pumpkin', 1, 4))).toBe(0);
    expect(stealLimit(plot('crop_cabbage', 1, 2))).toBe(1);
    expect(stealLimit(plot('crop_tomato', 1, 4))).toBe(1);
    for (const c of CROPS) {
      const lim = stealLimit(plot(c.id, 1, c.days));
      expect(c.yield - lim, c.id).toBeGreaterThanOrEqual(1);
    }
  });

  it('canSteal：熟 + 有次数 + 没到上限；各自给出原因', () => {
    const ripe = plot('crop_tomato', 1, 4);
    const today = 1 + 4;
    expect(canSteal(ripe, today, 3).ok).toBe(true);
    expect(canSteal(ripe, today, 0).why).toContain('次数');
    expect(canSteal(plot('crop_tomato', 1, 2), today, 3).why).toContain('还没熟');
    expect(canSteal(plot('crop_tomato', 1, 4, { k: 1 }), today, 3).why).toContain('摘过');
    expect(canSteal(plot('crop_watermelon', 1, 4), today, 3).why).toContain('搬不动');
    expect(canSteal(emptyPlot(), today, 3).why).toContain('空的');
  });
});

describe('存档收敛 cleanFarm', () => {
  it('undefined / 乱码 → 全空田', () => {
    for (const raw of [undefined, null, 42, 'x', {}, { plots: 'nope' }]) {
      const f = cleanFarm(raw);
      expect(f.plots.length).toBe(FARM_SLOTS);
      expect(f.plots.every((p) => p.c === '')).toBe(true);
      expect(f.log).toEqual([]);
    }
  });

  it('超长数组截断到 16 块，非法作物变成空地，数值收敛到合法区间', () => {
    const f = cleanFarm({
      plots: [
        { c: 'crop_tomato', p: 3, w: 99, wd: 3, k: 99 },
        { c: 'crop_nope', p: 1, w: 1, wd: 1, k: 1 },
        ...Array.from({ length: 8 }, () => ({ c: 'crop_cabbage', p: 1, w: 1, wd: 1, k: 0 })),
      ],
    });
    expect(f.plots.length).toBe(FARM_SLOTS);
    expect(f.plots[0]).toEqual({ c: 'crop_tomato', p: 3, w: 4, wd: 3, k: 3, t: true });
    expect(f.plots[1].c).toBe('');
    expect(f.plots[2].c).toBe('crop_cabbage');
  });

  it('日志：只留合法条目、截断到 20 条、昵称截断', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ d: i, n: 'n'.repeat(40), c: 'crop_tomato', k: 1 }));
    const f = cleanFarm({ log: [...many, { d: 1, n: '', c: 'crop_tomato', k: 1 }, { d: 1, n: 'a', c: 'crop_nope', k: 1 }] });
    expect(f.log.length).toBe(FARM_LOG_MAX);
    expect(f.log[0].n.length).toBe(16);
  });
});

describe('每日结算 settleFarm', () => {
  it('同一天不动；跨天把偷摘次数归零', () => {
    const s = save([], { day: 5, sl: 2 });
    expect(settleFarm(s, 5)).toBe(s);
    const next = settleFarm(s, 6);
    expect(next.day).toBe(6);
    expect(next.sl).toBe(0);
    expect(next.plots).toBe(s.plots);
  });

  it('不改入参（纯函数）', () => {
    const s = save([], { day: 1, sl: 3 });
    settleFarm(s, 2);
    expect(s.day).toBe(1);
    expect(s.sl).toBe(3);
  });
});

describe('farmDayAt', () => {
  it('就是 gameDayAt：开服时刻是第 1 天', () => {
    expect(farmDayAt(Date.UTC(2026, 9, 31, 16, 0, 0))).toBe(1);
    expect(farmDayAt(Date.UTC(2026, 9, 31, 16, 0, 0) + 20 * 60 * 1000)).toBe(2);
  });
});

