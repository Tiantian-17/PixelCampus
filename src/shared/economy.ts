/**
 * 货币与商店（客户端与服务器共用）——设计见 docs/design/ECONOMY.md。
 * 货币叫「校园币」，整数，存在服务器的玩家档案里（跟着身份走）；增减全部由服务器按这里的规则执行。
 * 客户端只显示：价格表和"今日行情"都是这里的纯函数，客户端和服务器算出来一样（以服务器结算为准）。
 */
import { FISH, fishDef, type FishDef, type Rarity } from './fishing';
import { TACKLES } from './gear';
import { itemDef } from './items';
import { DECOR, decorRefund } from './decor';
import { TREASURE_ID, TRASH_ONLY, trashPrice } from './trash';
import { CROPS } from './farming';

/** 日期编号：东八区的"第几天"，换日以北京时间 0 点为界（和服务器 progress.dayNo 一致） */
export const marketDay = (now: number) => Math.floor((now + 8 * 3600e3) / 86400e3);
export const COIN_NAME = '校园币';
export const COIN_CAP = 9_999_999;
export const cleanCoins = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(COIN_CAP, Math.floor(v))) : 0);

// ------------------------------------------------------------ 收入：卖鱼
/** 各稀有度的基础收购价（校园币/条） */
export const FISH_BASE: Record<Rarity, number> = { common: 6, uncommon: 16, rare: 45, epic: 130, legendary: 420, mythic: 1400, junk: 1 };
/** 一条鱼的"标准收购价"：同稀有度里，个头大的物种略贵（0.85 ~ 1.15 倍） */
export function fishPrice(def: FishDef): number {
  if (def.rarity === 'junk' || def.maxKg === undefined) return FISH_BASE.junk;
  const t = Math.max(0, Math.min(1, Math.log2(1 + def.maxKg) / 7));
  return Math.max(1, Math.round(FISH_BASE[def.rarity] * (0.85 + 0.3 * t)));
}
/** 今日行情：每个物种每天一个倍率 0.85 ~ 1.25（按日期编号和物种固定，全服一致），商店里标"行情好/行情差" */
export function marketMul(day: number, id: string): number {
  let h = Math.imul(day | 0, 2654435761) ^ 0x9e3779b9;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return 0.85 + ((h >>> 0) / 4294967296) * 0.4;
}
/** 盲盒里开出来的小东西：珍珠和校园小宝物也能卖（没有行情，固定价） */
export const EXTRA_SELL: Readonly<Record<string, number>> = { pearl: 120, relic_badge: 60, relic_card: 45, relic_meal: 30, relic_history: 90 };
/** 作物收购价：固定价、没有行情（价目写在 farming.ts 的作物表里，避免两处维护） */
export const CROP_SELL: Readonly<Record<string, number>> = Object.fromEntries(CROPS.map((c) => [c.id, c.price]));
/** 今天卖一条这个物品能得多少币；不收的东西返回 0 */
export function sellPrice(id: string, day: number, bonus = 0): number {
  if (EXTRA_SELL[id]) return EXTRA_SELL[id];
  if (CROP_SELL[id]) return CROP_SELL[id]; // 作物：固定价，不吃行情和钓鱼加成
  { const r = decorRefund(id); if (r) return r; } // 宿舍家具：商店按原价的一半收回（没有行情、没有加成）
  const tp = trashPrice(id); // 翻垃圾桶翻出来的东西：垃圾 1 币、U 盘 999 币，没有行情
  if (tp) return tp;
  const d = fishDef(id);
  if (!d) return 0;
  // 钓鱼「渔夫」路线的卖价加成：只算鱼和钓上来的杂物（不含垃圾桶翻出来的东西、珍珠等固定价的）
  return Math.max(1, Math.round(fishPrice(d) * (d.rarity === 'junk' ? 1 : marketMul(day, id)) * (1 + Math.max(0, bonus))));
}
/** 一天里在商店卖东西累计赚到这么多校园币，解锁成就「日进九百九」 */
export const DAILY_SALE_GOAL = 999;
/** 一次最多卖多少件（防一条消息处理过久；和背包堆叠上限一样 999） */
export const SELL_MAX = 999;
/** "一键卖出"只收这些稀有度的鱼（稀有及以上舍不得，要卖请手动点） */
export const BULK_RARITIES: readonly Rarity[] = ['junk', 'common', 'uncommon'];

// ------------------------------------------------------------ 收入：任务、成就
/** 每日任务的币奖励（任务 id → 币）；做完当天全部任务另外再给 ALL_QUESTS_BONUS */
export const QUEST_COINS: Record<string, number> = {
  login: 20, online: 10, pet: 6, feed: 6, ride: 5, sit: 5, emote: 4, chat: 4, photo: 8, fish: 15, run: 15, lake: 5, library: 6,
};
export const ALL_QUESTS_BONUS = 30;
/** 成就的币奖励：默认 30，个别重量级的更多（第一次解锁时发一次） */
export const ACH_COINS_DEFAULT = 30;
export const ACH_COINS: Record<string, number> = { fish_giant: 120, fish_legend: 300, fish_master: 300, fish_10: 30, fish_25: 80, fish_40: 200, fish_all: 1000, myth_hegongjin: 1200, myth_xuangui: 1500, myth_yinglong: 2000, myth_all: 1500, box_first: 20, box_10: 60, gear_rods: 500, gear_baits: 100, fishlv_5: 50, fishlv_10: 150, fishlv_15: 300, fishlv_20: 600, fishlv_25: 900, fishlv_30: 1500, release_5: 40, release_20: 120, release_50: 300, cat_bestie: 150, diligent: 100, angler: 60 };
export const achCoins = (id: string) => ACH_COINS[id] ?? ACH_COINS_DEFAULT;
/** 校园跑：跑完一次 / 刷新纪录 / 比赛拿第一 */
export const RUN_COINS = { finish: 8, record: 15, win: 20 } as const;

// ------------------------------------------------------------ 鱼竿、鱼饵、配件
// 装备表和"合成一组最终参数"都在 gear.ts；这里转出，旧的引用不用改
export { RODS, BAITS, TACKLES, BAIT_IDS, PRO_BAIT, NO_EQUIP, bestRod, cleanEquip, pickBait, pickRod, resolveGear } from './gear';
export type { Equip, RodDef, BaitDef, TackleDef } from './gear';

// ------------------------------------------------------------ 商店：买
export interface ShopItem { id: string; /** 一次买到几个 */ n: number; /** 这一份的价格 */ price: number; note: string }
export const SHOP: readonly ShopItem[] = [
  { id: 'bait', n: 5, price: 10, note: '一份 5 个鱼饵（每天登录也会送）' },
  { id: 'bait_pro', n: 5, price: 30, note: '香饵 5 个：咬钩更快、稀有鱼更多，抛竿时优先用掉' },
  { id: 'bait_glow', n: 5, price: 40, note: '夜光饵 5 个：夜里咬钩更快、夜行鱼更多' },
  { id: 'bait_season', n: 5, price: 40, note: '应季饵 5 个：当季的鱼更多' },
  { id: 'bait_wild', n: 5, price: 60, note: '野饵 5 个：12% 的概率一次钓上两条' },
  { id: 'bait_magnet', n: 5, price: 60, note: '磁铁饵 5 个：更容易钓到盲盒' },
  { id: 'mon_ball', n: 5, price: 15, note: '5 个零食包：战斗里用来收服野生精灵（领了初始精灵后每天登录也会补到 5 包）' },
  { id: 'cat_food', n: 5, price: 12, note: '一份 5 包猫粮（每天第一次登录补到 5 包）' },
  { id: 'cat_treat', n: 2, price: 30, note: '2 根猫条，小猫最爱，好感涨得多' },
  { id: 'cat_bed', n: 1, price: 150, note: '送给一只小猫：它有了自己的窝（只有你看得到），好感 +20' },
  // 染料：一份染一件家具。定价依据——便宜的家具 15~30 币（垃圾桶、凳子、椅子），所以一份约 13 币（3 份 40）：染一次约等于最便宜家具的价钱，大件、贵的家具染一次也一样，鼓励"买一件好家具再慢慢调色"
  { id: 'dye', n: 3, price: 40, note: '3 份染料：装修时把一件家具染成喜欢的颜色（一件一份；染回原色免费；收回背包会褪色）' },
  { id: 'fishing_rod', n: 1, price: 40, note: '备用的竹节鱼竿' },
  { id: 'rod_carbon', n: 1, price: 420, note: '拉鱼更轻松、咬钩更快、稀有鱼更多，带 1 个配件槽' },
  { id: 'rod_glow', n: 1, price: 900, note: '萤火竿：夜里咬钩快、夜行鱼多（白天没有加成）' },
  { id: 'rod_rain', n: 1, price: 900, note: '听雨竿：雨天咬钩快、雨天的鱼多（晴天没有加成）' },
  { id: 'rod_pickup', n: 1, price: 1500, note: '拾遗竿：更容易钓到盲盒' },
  { id: 'rod_golden', n: 1, price: 1800, note: '金龙鱼竿：拉鱼大幅放宽、咬钩最快、稀有鱼显著增多' },
  ...TACKLES.map((t) => ({ id: t.id, n: 1, price: t.price, note: `${t.eff}（配件，不消耗；要有带配件槽的鱼竿才能装）` })),
  ...DECOR.filter((d) => d.price > 0).map((d) => ({ id: d.id, n: 1, price: d.price, note: d.note })), // 宿舍家具（图书馆广场的校园商店卖）
  // 作物种子（校园农场）：一包 1 颗，种下一块地
  ...CROPS.map((c) => ({ id: c.seed, n: 1, price: c.seedPrice, note: `${c.name}种子：四季都能种，${c.days} 个游戏日成熟，一块地收 ${c.yield} 个（${c.price} 币/个）` })),
];
const SHOP_BY_ID = new Map(SHOP.map((s) => [s.id, s]));
export const shopItem = (id: unknown): ShopItem | undefined => (typeof id === 'string' ? SHOP_BY_ID.get(id) : undefined);
/** 猫窝送给一只猫时涨的好感 */
export const CAT_BED_GAIN = 20;

/** 该件东西在背包里能不能卖（收鱼、作物、杂物，和翻垃圾桶翻出来的东西） */
export const sellable = (id: string): boolean => !!fishDef(id) || !!CROP_SELL[id] || trashPrice(id) > 0 || (EXTRA_SELL[id] ?? 0) > 0 || decorRefund(id) > 0;
/** 一键卖出收的东西：作物、杂物、常见、少见的鱼，和翻出来的垃圾（U 盘舍不得，要卖手动点） */
export const bulkSellable = (id: string): boolean => { if (CROP_SELL[id]) return true; const d = fishDef(id); return d ? BULK_RARITIES.includes(d.rarity) : TRASH_ONLY.includes(id); };
export function sellList(inv: Record<string, number>, day: number, bonus = 0): { id: string; name: string; n: number; price: number; rarity: Rarity }[] {
  const out: { id: string; name: string; n: number; price: number; rarity: Rarity }[] = FISH.filter((f) => (inv[f.id] ?? 0) > 0).map((f) => ({ id: f.id, name: f.name, n: inv[f.id], price: sellPrice(f.id, day, bonus), rarity: f.rarity }));
  for (const c of CROPS) if ((inv[c.id] ?? 0) > 0) out.push({ id: c.id, name: c.name, n: inv[c.id], price: c.price, rarity: 'common' }); // 作物：固定价
  for (const id of [...Object.keys(EXTRA_SELL), ...TRASH_ONLY, TREASURE_ID]) if ((inv[id] ?? 0) > 0) out.push({ id, name: itemDef(id)?.name ?? id, n: inv[id], price: sellPrice(id, day), rarity: id === TREASURE_ID || EXTRA_SELL[id] ? 'rare' : 'junk' });
  for (const d of DECOR) if ((inv[d.id] ?? 0) > 0 && decorRefund(d.id) > 0) out.push({ id: d.id, name: d.name, n: inv[d.id], price: decorRefund(d.id), rarity: 'rare' }); // 宿舍家具：退货（原价的一半）
  return out;
}
/** 钓具摊（精工湖边）卖的东西：商店里所有钓鱼相关的商品（鱼竿 / 鱼饵 / 配件）；图书馆广场的商店照旧卖全部 */
export const FISH_GEAR_IDS: ReadonlySet<string> = new Set(SHOP.filter((s) => s.id === 'fishing_rod' || s.id.startsWith('rod_') || s.id.startsWith('bait') || s.id.startsWith('tk_')).map((s) => s.id));
/** 校验用：商店里的商品必须是真实物品 */
export const shopItemsValid = () => SHOP.every((s) => !!itemDef(s.id) && s.n >= 1 && s.price >= 1);
