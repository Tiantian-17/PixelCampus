/**
 * 校园耕作（客户端与服务器共用）：作物目录、成长、偷摘的规则。
 *
 * 归属与位置由服务器管（每人 16 块私田，农场是自己的独立室内空间）；这里只放"给定一份存档和今天的游戏日，这块地现在是什么样"的纯函数。
 * 成长不用定时器：每块地只记「种下的游戏日」和「已经浇过几次水（几个游戏日）」，剩下的全按日历算出来。
 * 一天 = 1 游戏日 = 20 真实分钟（clock.ts）；季节用 seasonAt / seasonOfDay（season.ts）。
 *
 * 新增作物：在 CROPS 里加一项，并在 items.ts 里加同名作物物品与种子、tools/art/items.ts 里画图标（tests 会检查三者一致）。
 */
import type { Season } from './season';
import { gameDayAt } from './calendar';

export interface CropDef {
  /** 作物物品 id（收获物） */
  id: string;
  name: string;
  /** 种子物品 id */
  seed: string;
  /** 这个作物最好在哪些季节种（只用作图鉴说明，反季也能种） */
  seasons: readonly Season[];
  /** 需要几个游戏日成熟（= 需要的浇水次数：一个游戏日最多浇一次） */
  days: number;
  /** 一包种子的商店价 */
  seedPrice: number;
  /** 成熟后一块地能收几个 */
  yield: number;
  /** 单个卖价（固定价，没有鱼的"今日行情"） */
  price: number;
  /** 背包里的一句话说明 */
  blurb: string;
}

/**
 * 作物目录（首版 8 种，四季覆盖）。
 * 定价原则：单块地一个循环的净收益折算到每小时（16 块地满种）≈ 160~190 校园币，**低于正常钓鱼**（100~250 币/小时），
 * 且要先付种子钱，所以种地不会把经济拉崩（见 docs/feature/20261112-farming/spec.md §4.2）。
 */
export const CROPS: readonly CropDef[] = [
  { id: 'crop_cabbage', name: '小白菜', seed: 'seed_cabbage', seasons: ['spring', 'autumn'], days: 2, seedPrice: 12, yield: 2, price: 10, blurb: '长得最快的叶菜，撒下种子两天就能收一茬。' },
  { id: 'crop_tomato', name: '番茄', seed: 'seed_tomato', seasons: ['spring', 'summer'], days: 4, seedPrice: 20, yield: 3, price: 12, blurb: '藤上挂满红灯笼，一天不浇水就蔫给你看。' },
  { id: 'crop_chili', name: '辣椒', seed: 'seed_chili', seasons: ['summer', 'autumn'], days: 3, seedPrice: 18, yield: 3, price: 10, blurb: '越晒越红的小尖椒，食堂师傅抢着要。' },
  { id: 'crop_watermelon', name: '西瓜', seed: 'seed_watermelon', seasons: ['summer'], days: 4, seedPrice: 40, yield: 1, price: 55, blurb: '一只就抱不动的大西瓜，夏天田里最沉的宝贝。' },
  { id: 'crop_pumpkin', name: '南瓜', seed: 'seed_pumpkin', seasons: ['autumn'], days: 4, seedPrice: 35, yield: 1, price: 50, blurb: '秋天躺在地里晒太阳的胖南瓜，一个人搬不走。' },
  { id: 'crop_carrot', name: '胡萝卜', seed: 'seed_carrot', seasons: ['autumn', 'winter'], days: 2, seedPrice: 10, yield: 2, price: 9, blurb: '埋在土里的橙色小棍，拔出来带着泥。' },
  { id: 'crop_wheat', name: '冬小麦', seed: 'seed_wheat', seasons: ['winter'], days: 5, seedPrice: 25, yield: 3, price: 14, blurb: '越冷越精神的冬小麦，割下来是一小把金黄。' },
  { id: 'crop_napa', name: '大白菜', seed: 'seed_napa', seasons: ['winter'], days: 3, seedPrice: 15, yield: 2, price: 13, blurb: '北方冬天囤在阳台上的那一棵，瓷实又清甜。' },
];

const CROP_BY_ID = new Map(CROPS.map((c) => [c.id, c]));
const CROP_BY_SEED = new Map(CROPS.map((c) => [c.seed, c]));
export const cropDef = (id: unknown): CropDef | undefined => (typeof id === 'string' ? CROP_BY_ID.get(id) : undefined);
/** 种子物品 id → 作物（背包里点了种子要播种时用） */
export const cropOfSeed = (seed: unknown): CropDef | undefined => (typeof seed === 'string' ? CROP_BY_SEED.get(seed) : undefined);

// ------------------------------------------------------------ 规则常量
/** 每人几块地（4×4 整齐的格子） */
export const FARM_SLOTS = 16;
/** 每个游戏日最多偷摘几次 */
export const STEAL_DAILY_MAX = 3;
/** 农场日志保留几条 */
export const FARM_LOG_MAX = 20;
/** 农田所在的 POI（传送落点；服务器用它校验"你是不是在农场这边"） */
export const FARM_POI = 'north-hill';
/**
 * 农场范围（格）：传送落点就是 POI 中心，standNear 最多再挪 320 像素（20 格），
 * 取 24 格既不会把传过来的人判在外面，也不会让人在校门口隔着半个学校种地。
 * 农活（farm-handler）和农场管理员商店（shop-handler）用同一个范围。
 */
export const FARM_REACH = 24;
/** 农场室内 id：传送过去后进的是这块独立空间（和宿舍一样），不是站在北山林地里 */
export const FARM_INTERIOR = 'farm';

/**
 * 16 块耕地的格坐标（4 列 × 4 行的整齐格子；每块 2×2 格，格子间留半格走路）。
 * 位置覆盖底图手绘的耕地区域（原 6 块地那一片），运行时用状态 tile 整块盖出来。
 */
export const FARM_PLOTS: readonly { x: number; y: number; w: number; h: number }[] = [
  { x: 11.5, y: 5.5, w: 2, h: 2 }, { x: 14, y: 5.5, w: 2, h: 2 }, { x: 16.5, y: 5.5, w: 2, h: 2 }, { x: 19, y: 5.5, w: 2, h: 2 },
  { x: 11.5, y: 8, w: 2, h: 2 }, { x: 14, y: 8, w: 2, h: 2 }, { x: 16.5, y: 8, w: 2, h: 2 }, { x: 19, y: 8, w: 2, h: 2 },
  { x: 11.5, y: 10.5, w: 2, h: 2 }, { x: 14, y: 10.5, w: 2, h: 2 }, { x: 16.5, y: 10.5, w: 2, h: 2 }, { x: 19, y: 10.5, w: 2, h: 2 },
  { x: 11.5, y: 13, w: 2, h: 2 }, { x: 14, y: 13, w: 2, h: 2 }, { x: 16.5, y: 13, w: 2, h: 2 }, { x: 19, y: 13, w: 2, h: 2 },
];

/** 农田里的操作（协议里 farm_op 的 op） */
export type FarmOp = 'till' | 'plant' | 'water' | 'harvest' | 'steal' | 'help_water';

// ------------------------------------------------------------ 存档形态
/**
 * 一块地：c=作物 id（'' = 空地）；p=种下的游戏日；w=已经浇过几个游戏日的水（0..days）；
 * wd=最后一次浇水的游戏日（一天只能浇一次）；k=已经被偷走几个；t=已经翻过土（锄过地）。
 * 空地分两种：t=false 是荒草地（要先翻土才能种），t=true 是翻好的深色土（直接就能播）。
 */
export interface FarmPlot { c: string; p: number; w: number; wd: number; k: number; t: boolean }
export interface FarmLogEntry { d: number; n: string; c: string; k: number }
export interface FarmSave {
  plots: FarmPlot[];
  /** 日计数所属的游戏日（和 today 不同就归零） */
  day: number;
  /** 当天已偷摘次数 */
  sl: number;
  log: FarmLogEntry[];
}

export const emptyPlot = (): FarmPlot => ({ c: '', p: 0, w: 0, wd: 0, k: 0, t: false });

const int = (v: unknown, lo: number, hi: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : lo);

function cleanPlot(raw: unknown): FarmPlot {
  if (!raw || typeof raw !== 'object') return emptyPlot();
  const o = raw as Record<string, unknown>;
  const def = cropDef(o.c);
  if (!def) return { ...emptyPlot(), t: o.t === true }; // 空地：保留翻土状态（翻好的地能直接播）
  return {
    c: def.id,
    p: int(o.p, 0, 1e7),
    // 浇水次数不会超过这种作物的成熟天数（防篡改）
    w: Math.min(def.days, int(o.w, 0, def.days)),
    wd: int(o.wd, 0, 1e7),
    k: int(o.k, 0, def.yield),
    t: true, // 种了作物的地必然是翻过的（播种前必须翻土）
  };
}

/** 从磁盘 / 网络来的农场存档：字段缺失按"全空田"处理，超长/非法值一律收敛（服务器读档案时用） */
export function cleanFarm(raw: unknown): FarmSave {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const list = Array.isArray(o.plots) ? o.plots : [];
  const plots: FarmPlot[] = [];
  for (let i = 0; i < FARM_SLOTS; i++) plots.push(cleanPlot(list[i]));
  const log: FarmLogEntry[] = [];
  if (Array.isArray(o.log)) {
    for (const e of o.log) {
      if (!e || typeof e !== 'object') continue;
      const r = e as Record<string, unknown>;
      const d = cropDef(r.c);
      if (!d || typeof r.n !== 'string' || !r.n) continue;
      log.push({ d: int(r.d, 0, 1e7), n: r.n.slice(0, 16), c: d.id, k: Math.max(1, int(r.k, 1, d.yield)) });
      if (log.length >= FARM_LOG_MAX) break;
    }
  }
  return { plots, day: int(o.day, 0, 1e7), sl: int(o.sl, 0, STEAL_DAILY_MAX + 999), log };
}

// ------------------------------------------------------------ 成长与状态
/**
 * 结算整份存档到 today：跨过游戏日就把每日计数归零（成长本身不用补算，全是按日历算出来的）。
 * 纯函数（不改入参）；服务器每次读档案、回消息前调用。
 */
export function settleFarm(save: FarmSave, today: number): FarmSave {
  return save.day === today ? save : { ...save, day: today, sl: 0 };
}

export type PlotStage = 'empty' | 'growing' | 'ripe';

const isRipe = (plot: FarmPlot, def: CropDef, today: number) => plot.w >= def.days && today >= plot.p + def.days;

/** 这块地现在是什么样（界面画图标、服务端判断能不能收/偷都用它）；熟了就一直是熟的，不会枯 */
export function plotStage(plot: FarmPlot, today: number): PlotStage {
  const def = cropDef(plot.c);
  if (!def) return 'empty';
  return isRipe(plot, def, today) ? 'ripe' : 'growing';
}

/** 界面上的成长进度：`番茄 2/4 天`（空地返回空串） */
export function growthText(plot: FarmPlot, today: number): string {
  const def = cropDef(plot.c);
  if (!def) return '';
  const stage = plotStage(plot, today);
  if (stage === 'ripe') return `${def.name}（可以收了）`;
  return `${def.name} ${Math.min(plot.w, def.days)}/${def.days} 天`;
}

// ------------------------------------------------------------ 播种 / 收获
/** 现在能不能种这种作物（只要有这种作物就能种，不分季节） */
export function canPlant(cropId: string): { ok: boolean; why: string } {
  if (!cropDef(cropId)) return { ok: false, why: '没有这种作物' };
  return { ok: true, why: '' }; // 任何季节都能种（2026-11-13 去掉了反季限制，seasons 只留作图鉴说明）
}

/** 一包种子种下去：p 是今天，还没浇过水；地保持翻过（收获后能直接再种） */
export const plantPlot = (cropId: string, today: number): FarmPlot => {
  const def = cropDef(cropId);
  return def ? { c: def.id, p: today, w: 0, wd: 0, k: 0, t: true } : emptyPlot();
};

/** 这块地今天还能收几个（已经被偷走的要减掉） */
export const harvestYield = (plot: FarmPlot): number => {
  const def = cropDef(plot.c);
  return def ? Math.max(0, def.yield - plot.k) : 0;
};
/** 这块地最多能被偷走几个：一半，且至少给主人留 1 个（产量 1 的作物不可偷） */
export const stealLimit = (plot: FarmPlot): number => {
  const def = cropDef(plot.c);
  if (!def) return 0;
  return Math.max(0, Math.min(Math.floor(def.yield / 2), def.yield - 1));
};

/** 能不能偷这块地：成熟 + 今天还有次数 + 这块地还没被偷到上限 */
export function canSteal(plot: FarmPlot, today: number, stealLeft: number): { ok: boolean; why: string } {
  const def = cropDef(plot.c);
  if (!def) return { ok: false, why: '这块地是空的' };
  const stage = plotStage(plot, today);
  if (stage !== 'ripe') return { ok: false, why: `${def.name}还没熟` };
  if (stealLimit(plot) <= 0) return { ok: false, why: '这一个太大了，搬不动' };
  if (plot.k >= stealLimit(plot)) return { ok: false, why: '这块地已经被人摘过了' };
  if (stealLeft <= 0) return { ok: false, why: '今天偷摘的次数用完了' };
  return { ok: true, why: '' };
}

// ------------------------------------------------------------ 浇水
/** 这一块地今天还能不能浇（一天只能浇一次；浇水不花钱、不限次数） */
export function canWater(plot: FarmPlot, today: number): { ok: boolean; why: string } {
  const def = cropDef(plot.c);
  if (!def) return { ok: false, why: '这块地还没种东西' };
  if (plot.wd === today) return { ok: false, why: '今天已经浇过水了' };
  if (plot.w >= def.days) return { ok: false, why: `${def.name}已经长好了，等它熟就行` };
  return { ok: true, why: '' };
}

/** 浇水：成长 +1 天，并记下今天已经浇过 */
export const waterPlot = (plot: FarmPlot, today: number): FarmPlot => ({ ...plot, w: plot.w + 1, wd: today });

/** 今天还能偷几次（界面显示用） */
export const stealLeftOf = (save: FarmSave): number => Math.max(0, STEAL_DAILY_MAX - save.sl);

/** 服务器时间戳 → 游戏日（给 handler 用的便捷入口，和客户端算的一样） */
export const farmDayAt = (ms: number): number => gameDayAt(ms);
