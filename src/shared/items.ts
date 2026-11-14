/**
 * 背包与物品（客户端与服务器共用）。
 * 背包存在服务器上（跟着身份走：换设备/用备份码恢复后物品还在），客户端只显示；所有增减都由服务器根据规则执行——
 * 将来的物品交互、彩蛋触发（"背包里有 X 才能触发"）也都由服务器判断，不信任客户端。
 * 背包的数据形态很简单：物品 id → 数量。格子的排列由 ITEMS 的顺序决定，不存位置。
 */
import { FISH } from './fishing';
import { BAITS, RODS, TACKLES } from './gear';
import { DECOR } from './decor';
import { CROPS } from './farming';

/** 可堆叠物品在背包里一格最多放多少（2026-11-06 起 999；鱼竿、配件等 stack 1 的不变） */
export const STACK_MAX = 999;

export type ItemKind = 'food' | 'collect' | 'key' | 'tool' | 'fish' | 'tackle' | 'box' | 'decor';
export interface ItemDef { id: string; name: string; desc: string; kind: ItemKind; stack: number }

/** 物品目录。新增物品：在这里加一项，并在 tools/art/items.ts 里画同名图标 */
const BASE_ITEMS: readonly ItemDef[] = [
  { id: 'cat_food', name: '猫粮', desc: '一小袋猫咪爱吃的猫粮。走近校园里的小猫，按 E 就能投喂。每天第一次进入校园会补到 5 包。', kind: 'food', stack: STACK_MAX },
  { id: 'cat_treat', name: '猫条', desc: '小猫最爱的零食，投喂时好感度涨得更多。和小猫熟悉起来之后，它们会回赠给你。', kind: 'food', stack: STACK_MAX },
  { id: 'ginkgo_leaf', name: '银杏叶', desc: '一片金黄的银杏叶，是小猫叼来送你的。也许哪天能派上用场。', kind: 'collect', stack: STACK_MAX },
  { id: 'cat_badge', name: '爱猫徽章', desc: '和一只小猫成为"亲密"好友的证明。', kind: 'key', stack: 1 },
  { id: 'fishing_rod', name: '鱼竿', desc: '一根结实的竹节鱼竿。走到精工湖边，面朝水面按 E 抛竿。', kind: 'tool', stack: 1 },
  { id: 'bait', name: '鱼饵', desc: '一小盒蚯蚓。每抛一次竿用掉一份。每天登录、做每日任务都会送。', kind: 'tool', stack: STACK_MAX },
  { id: 'bait_pro', name: '香饵', desc: '加了特制香料的鱼饵：咬钩更快，稀有鱼更爱上钩。抛竿时优先用掉。商店有售。', kind: 'tool', stack: STACK_MAX },
  { id: 'mon_ball', name: '零食包', desc: '战斗里用来收服野生精灵：把它扔出去，血量越低的精灵越容易上钩（成不成功都会用掉）。每天登录会补到 5 包，商店有售。', kind: 'tool', stack: STACK_MAX },
  { id: 'rod_carbon', name: '碳素鱼竿', desc: '又轻又韧的碳素鱼竿：拉鱼更轻松、咬钩更快、稀有鱼更多。有多根竿时自动用最好的。', kind: 'tool', stack: 1 },
  { id: 'rod_golden', name: '金龙鱼竿', desc: '传说中的金色鱼竿：拉鱼大幅放宽、咬钩最快、稀有鱼显著增多。', kind: 'tool', stack: 1 },
  { id: 'cat_bed', name: '猫窝', desc: '软软的猫窝。在小猫面板里送给一只小猫：它有了自己的窝（只有你看得到），好感度 +20。', kind: 'food', stack: STACK_MAX },
  { id: 'dye', name: '染料', desc: '一瓶染料。进「装修」点一件已经摆好的家具，选一种颜色，就能把它染成喜欢的样子：一件用一份；染回原色不花染料；把家具收回背包，颜色会褪掉。桌椅、柜子、沙发、地毯、玩偶都能染（电器、画、窗、鱼缸、床不能）。商店 3 份 40 校园币。', kind: 'tool', stack: STACK_MAX },
  { id: 'fish_crucian', name: '鲫鱼', desc: '精工湖里最常见的鱼，个头不大，劲儿不小。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_carp', name: '鲤鱼', desc: '红尾巴的大鲤鱼，湖边的老住户。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_grass', name: '草鱼', desc: '爱吃水草的草鱼，长得又长又结实。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_gudgeon', name: '麦穗鱼', desc: '小小的、闪着银光的野生小鱼，总在岸边打转，反应快得很。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_loach', name: '泥鳅', desc: '滑溜溜的泥鳅，下雨天会从泥里钻出来。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_shrimp', name: '河虾', desc: '透明的小河虾，夏天最多，冬天几乎看不到。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_bream', name: '鳊鱼', desc: '扁扁的、银亮亮的一条。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_snakehead', name: '黑鱼', desc: '凶巴巴的黑鱼，夜里更活跃。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_catfish', name: '鲶鱼', desc: '长着长胡须的鲶鱼，喜欢在夜里出来。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_silver', name: '鲢鱼', desc: '身子银白、游得悠闲的大鱼，劲儿很稳。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_bighead', name: '鳙鱼', desc: '大脑袋的胖头鱼，一条就沉甸甸的。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_crayfish', name: '小龙虾', desc: '举着大钳子的小龙虾，夏天最爱横着走。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_goldfish', name: '金鱼', desc: '不知道是谁放生在湖里的金鱼，金灿灿的。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_koi', name: '锦鲤', desc: '传说钓到锦鲤会有好运。白天更容易遇见。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_culter', name: '翘嘴鲌', desc: '嘴巴向上翘的凶猛掠食者，窜得飞快。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_mandarin', name: '鳜鱼', desc: '背上带着花纹的鳜鱼，春天肉最肥。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_turtle', name: '中华鳖', desc: '慢吞吞的老鳖，夜里会爬到岸边来，冬天躲起来睡觉。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_eel', name: '黄鳝', desc: '细长滑腻的黄鳝，夜里和雨天出来觅食，像一条小蛇。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_blackcarp', name: '青鱼', desc: '青灰色的大家伙，力气大得惊人，传说它们能长得比人还长。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_salamander', name: '娃娃鱼', desc: '叫声像婴儿的大鲵，只在夜里和雨天出没，十分罕见。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_arowana', name: '银龙鱼', desc: '银鳞闪闪、须须飘飘的龙鱼，夏天更容易遇到。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_sturgeon', name: '鲟鱼', desc: '古老的大鱼，身披骨板，冬天的深水里最容易遇见。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_goldkoi', name: '黄金锦鲤', desc: '传说中通体金色的锦鲤王，只在白天、阳光好的时候才会露面。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_icefish', name: '冰湖银鱼王', desc: '只在冬天冰冷的湖水里出现的银白色小王者，窜动起来几乎看不清。', kind: 'fish', stack: STACK_MAX },
  { id: 'fish_lakedragon', name: '精工湖神龙', desc: '湖里的传说：下雨的夜里，水面下有一条巨大的影子游过……', kind: 'fish', stack: STACK_MAX },
  { id: 'junk_boot', name: '旧球鞋', desc: '不知道谁掉进湖里的球鞋。也许是个教训。', kind: 'collect', stack: STACK_MAX },
  { id: 'junk_weed', name: '水草', desc: '缠在鱼钩上的一团水草。', kind: 'collect', stack: STACK_MAX },
  { id: 'junk_can', name: '空易拉罐', desc: '锈迹斑斑的易拉罐。请把垃圾带去垃圾桶。', kind: 'collect', stack: STACK_MAX },
  { id: 'junk_bottle', name: '空饮料瓶', desc: '漂在湖里的空瓶子，被你捞上来了。', kind: 'collect', stack: STACK_MAX },
  { id: 'trash_paper', name: '废纸团', desc: '从垃圾桶里翻出来的一团揉皱的草稿纸，上面写满了算不出来的高数题。', kind: 'collect', stack: STACK_MAX },
  { id: 'trash_cup', name: '空奶茶杯', desc: '喝得只剩几颗珍珠的奶茶杯。', kind: 'collect', stack: STACK_MAX },
  { id: 'trash_wrapper', name: '零食包装袋', desc: '被捏成一团的零食包装袋，还有一点辣条的味道。', kind: 'collect', stack: STACK_MAX },
  { id: 'trash_chopsticks', name: '一次性筷子', desc: '用过的一次性筷子，没什么用处。', kind: 'collect', stack: STACK_MAX },
  { id: 'trash_peel', name: '香蕉皮', desc: '一张香蕉皮。小心，别踩上去。', kind: 'collect', stack: STACK_MAX },
  { id: 'bin_usb', name: 'U盘', desc: '垃圾桶底下摸出来的 U 盘，贴着"毕业论文·终稿·真的终稿"的标签。居然是好东西，拿去校园商店能卖 999 校园币。', kind: 'collect', stack: STACK_MAX },
];

/** 钓鱼 2.0 新增：特殊鱼竿 / 新饵 / 配件的说明取自 gear.ts，新鱼的说明取自 fishing.ts 的 blurb（只写一份） */
const NEW_RODS = RODS.filter((r) => !['fishing_rod', 'rod_carbon', 'rod_golden'].includes(r.id));
const NEW_BAITS = BAITS.filter((b) => b.id !== 'bait' && b.id !== 'bait_pro');
const FISH2_ITEMS: ItemDef[] = [
  ...NEW_RODS.map((r): ItemDef => ({ id: r.id, name: r.name, desc: `${r.eff}。${r.slots ? `${r.slots} 个配件槽。` : ''}获得：${r.how}。`, kind: 'tool', stack: 1 })),
  ...NEW_BAITS.map((b): ItemDef => ({ id: b.id, name: b.name, desc: `${b.eff}。获得：${b.how}。`, kind: 'tool', stack: STACK_MAX })),
  ...TACKLES.map((t): ItemDef => ({ id: t.id, name: t.name, desc: `${t.eff}。配件不会消耗，要装在带配件槽的鱼竿上（在背包的钓鱼装备栏里选）。获得：${t.how}。`, kind: 'tackle', stack: 1 })),
  { id: 'box_bottle', name: '漂流瓶', desc: '从湖里漂来的玻璃瓶，里面好像有东西。在背包里点「打开」才知道是什么。', kind: 'box', stack: STACK_MAX },
  { id: 'box_crate', name: '旧木箱', desc: '泡得发胀的旧木箱，锁已经锈了。里面可能有好饵、配件，甚至是别处冲来的观赏鱼。', kind: 'box', stack: STACK_MAX },
  { id: 'box_wreck', name: '沉船箱', desc: '不知道哪年沉在湖底的箱子，沉甸甸的。里面可能有特殊鱼竿、龙鳞和神话饵。', kind: 'box', stack: STACK_MAX },
  { id: 'dragon_scale', name: '龙鳞', desc: '一片带着金光的鳞，摸上去温热。合成龙骨竿和神话饵都要用它。', kind: 'collect', stack: STACK_MAX },
  { id: 'pearl', name: '珍珠', desc: '河蚌里开出来的一颗珍珠，圆润发亮。可以卖钱，也是合成神话饵的材料。', kind: 'collect', stack: STACK_MAX },
  { id: 'relic_badge', name: '旧校徽', desc: '一枚生了点锈的旧校徽，不知道是哪一届的同学掉进湖里的。', kind: 'collect', stack: STACK_MAX },
  { id: 'relic_card', name: '泛黄的借书卡', desc: '图书馆早年用的借书卡，上面盖满了日期章，最后一行是一个再也没还的书名。', kind: 'collect', stack: STACK_MAX },
  { id: 'relic_meal', name: '生锈的饭卡', desc: '磁条都锈了的饭卡，余额大概是 0.5 元。', kind: 'collect', stack: STACK_MAX },
  { id: 'relic_history', name: '校史残页', desc: '一页被水泡过的校史，字迹模糊，只能看清"一九……"几个字。', kind: 'collect', stack: STACK_MAX },
  ...FISH.filter((f) => f.blurb).map((f): ItemDef => ({ id: f.id, name: f.name, desc: f.blurb!, kind: 'fish', stack: STACK_MAX })),
];
/** 宿舍家具：每件家具是一种背包物品（摆上去从背包扣一个，收回来还一个；目录在 decor.ts） */
const DECOR_ITEMS: ItemDef[] = DECOR.map((d): ItemDef => ({ id: d.id, name: d.name, desc: d.starter ? `${d.note}（固有家具：每人一份，不能交易、不能卖；在宿舍里点「装修」可以收回、再摆）` : `${d.note}（${d.cat}${d.kind === 'wall' ? '，挂在北墙上' : d.kind === 'top' ? '，摆在桌面上' : d.kind === 'rug' ? '，铺在地上' : d.kind === 'mat' ? '，铺在地上、可以叠在地毯上' : ''}）在宿舍里点「装修」摆放，校园商店有售。`, kind: 'decor', stack: d.starter ? 1 : STACK_MAX }));
/** 耕作：作物与种子的说明取自 farming.ts 的作物表（只写一份） */
const FARM_ITEMS: ItemDef[] = CROPS.flatMap((c): ItemDef[] => {
  return [
    { id: c.id, name: c.name, desc: `${c.blurb}在校园农场（传送面板）种，${c.days} 个游戏日成熟，一块地收 ${c.yield} 个；一个卖 ${c.price} 校园币。`, kind: 'food', stack: STACK_MAX },
    { id: c.seed, name: `${c.name}种子`, desc: `${c.name}的种子：${c.days} 个游戏日成熟（每天要浇一次水，四季都能种）。在校园农场的空地上播种，${c.seedPrice} 校园币一包。`, kind: 'tool', stack: STACK_MAX },
  ];
});
export const ITEMS: readonly ItemDef[] = [...BASE_ITEMS, ...FISH2_ITEMS, ...DECOR_ITEMS, ...FARM_ITEMS];

export type ItemId = string;
export type Inv = Record<string, number>;
export interface Gain { id: string; n: number }

/** 背包界面的格子数（物品种类不会超过它） */
export const INV_SLOTS = 256;

const BY_ID = new Map<string, ItemDef>(ITEMS.map((i) => [i.id, i]));
export const itemDef = (id: string): ItemDef | undefined => BY_ID.get(id);
export const isItemId = (id: unknown): id is ItemId => typeof id === 'string' && BY_ID.has(id);

/** 从磁盘/网络来的背包数据：只保留认识的物品，数量收敛到 1..堆叠上限 */
export function cleanInv(raw: unknown): Inv {
  const out: Inv = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, n] of Object.entries(raw as Record<string, unknown>)) {
    const d = BY_ID.get(id);
    if (!d || typeof n !== 'number' || !Number.isFinite(n)) continue;
    const v = Math.min(d.stack, Math.floor(n));
    if (v >= 1) out[id] = v;
  }
  return out;
}

/** 放进背包（原地修改），返回实际放进去的数量（超出堆叠上限的部分放不下） */
export function invAdd(inv: Inv, id: string, n: number): number {
  const d = BY_ID.get(id);
  if (!d || !Number.isInteger(n) || n <= 0) return 0;
  const have = inv[id] ?? 0, add = Math.max(0, Math.min(n, d.stack - have));
  if (add > 0) inv[id] = have + add;
  return add;
}

/** 从背包拿走（原地修改）。不够就一个也不拿，返回 false */
export function invTake(inv: Inv, id: string, n: number): boolean {
  if (!Number.isInteger(n) || n <= 0 || (inv[id] ?? 0) < n) return false;
  inv[id] -= n;
  if (inv[id] <= 0) delete inv[id];
  return true;
}

export const invCount = (inv: Inv, id: string) => inv[id] ?? 0;

/** 界面用：按目录顺序列出背包里有的物品 */
export function invList(inv: Inv): { def: ItemDef; n: number }[] {
  return ITEMS.filter((d) => (inv[d.id] ?? 0) > 0).map((def) => ({ def, n: inv[def.id] }));
}
