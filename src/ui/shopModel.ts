/**
 * 商店界面用的纯函数（分类、筛选、购买数量）：和界面分开，方便测试。
 * 规则（价格、行情、限额）全在 shared/economy.ts，服务器结算；这里只管"怎么分页、怎么筛选、一次能买几份"。
 */
import { CROP_SELL, EXTRA_SELL, SHOP, sellList, type ShopItem } from '@/shared/economy';
import { decorDef } from '@/shared/decor';
import { fishDef } from '@/shared/fishing';
import { decorRefund } from '@/shared/decor';
import { TREASURE_ID, isTrashItem } from '@/shared/trash';

/** 买东西的三个一级页签：补给（猫咪、精灵用品）/ 钓具（竿、饵、配件）/ 家具（宿舍家具和染料） */
export type ShopTab = 'supply' | 'gear' | 'furn';
export interface ShopGroup { tab: ShopTab; chip: string }

export const SHOP_TAB_NAMES: Record<ShopTab, string> = { supply: '补给', gear: '钓具', furn: '家具' };
/** 每个页签下的筛选小标签（"全部"由界面加在最前面）；顺序即显示顺序 */
export const SHOP_CHIPS: Record<ShopTab, readonly string[]> = {
  supply: ['猫咪', '精灵'],
  gear: ['鱼竿', '鱼饵', '配件'],
  furn: ['桌椅', '柜架', '电器', '软装', '地毯墙饰', '小件', '染料'],
};

/** 一件商品属于哪个页签、哪个筛选标签（不会有"其他"：认不出的归到补给·猫咪） */
export function shopGroup(id: string): ShopGroup {
  if (id === 'fishing_rod' || id.startsWith('rod_')) return { tab: 'gear', chip: '鱼竿' };
  if (id.startsWith('bait')) return { tab: 'gear', chip: '鱼饵' };
  if (id.startsWith('tk_')) return { tab: 'gear', chip: '配件' };
  if (id === 'dye') return { tab: 'furn', chip: '染料' };
  const d = decorDef(id);
  if (d) return { tab: 'furn', chip: d.cat === '地毯' || d.cat === '墙饰' ? '地毯墙饰' : d.cat };
  if (id === 'mon_ball') return { tab: 'supply', chip: '精灵' };
  return { tab: 'supply', chip: '猫咪' };
}

/** 某个页签里要显示的商品（钓具摊只卖钓具；按目录顺序，家具再按筛选标签顺序排） */
export function shopItemsFor(tab: ShopTab, chip: string, stall: boolean): ShopItem[] {
  if (stall && tab !== 'gear') return [];
  const order = SHOP_CHIPS[tab];
  return SHOP.filter((s) => { const g = shopGroup(s.id); return g.tab === tab && (!chip || g.chip === chip); })
    .map((s, i) => ({ s, i }))
    .sort((a, b) => order.indexOf(shopGroup(a.s.id).chip) - order.indexOf(shopGroup(b.s.id).chip) || a.i - b.i)
    .map((x) => x.s);
}
/** 这个页签里实际有商品的筛选标签（空的标签不显示） */
export const shopChipsFor = (tab: ShopTab, stall: boolean): string[] => SHOP_CHIPS[tab].filter((c) => shopItemsFor(tab, c, stall).length > 0);

// ---------------------------------------------------------------- 农场管理员（农场里的 NPC）
/** 管理员卖的：只有作物种子（一包种一块地），按商店目录顺序 */
export const farmSeeds = (): ShopItem[] => SHOP.filter((s) => s.id.startsWith('seed_'));
/** 管理员收的：只有作物（固定价，没有行情 / 钓鱼加成），顺序和商店的出售页一致 */
export const farmSellList = (inv: Record<string, number>, day: number, bonus = 0) =>
  sellList(inv, day, bonus).filter((r) => !!CROP_SELL[r.id]);

/** 一次最多能买几份：受校园币、背包堆叠上限（stack）、每份个数 n 限制；单件物品（stack=1）有了就不能再买 */
export function buyMax(s: ShopItem, coins: number, have: number, stack: number): number {
  if (stack <= 1) return have >= 1 ? 0 : coins >= s.price ? 1 : 0;
  return Math.max(0, Math.min(Math.floor(coins / s.price), Math.floor((stack - have) / s.n), 999));
}
/** 数量夹到 1..max（max < 1 时返回 0，表示买不了 / 卖不了） */
export const clampQty = (n: number, max: number): number => (max < 1 ? 0 : Math.max(1, Math.min(max, Math.floor(Number.isFinite(n) ? n : 1))));
/** 购买条上的快捷数量 */
export const QTY_STEPS: readonly number[] = [1, 5, 10];

/** 出售页的筛选标签：鱼 / 杂物 / 宝物 / 家具（家具 = 退货，按原价的一半） */
export type SellChip = '鱼' | '杂物' | '宝物' | '家具';
export const SELL_CHIPS: readonly SellChip[] = ['鱼', '杂物', '宝物', '家具'];
export function sellGroup(id: string): SellChip {
  if (decorRefund(id) > 0) return '家具';
  if (id === TREASURE_ID || EXTRA_SELL[id]) return '宝物';
  const f = fishDef(id);
  if (f) return f.rarity === 'junk' ? '杂物' : '鱼';
  if (isTrashItem(id)) return '杂物';
  return '杂物';
}
