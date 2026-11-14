import type Phaser from 'phaser';
import { COIN_NAME, BULK_RARITIES, marketMul, sellList, EXTRA_SELL, shopItem, type ShopItem } from '@/shared/economy';
import { fishData } from './fishData';
import { JUNK_GROUP, RARE_GROUP, RECIPES, SMALL_GROUP, craftWhy, isNamedFish, type Recipe } from '@/shared/craft';
import { RARITY_COLORS, RARITY_NAMES, fishDef } from '@/shared/fishing';
import { TREASURE_ID, isTrashItem } from '@/shared/trash';
import { itemDef, type Inv } from '@/shared/items';
import type { NetClient } from '@/net/client';
import { itemImg } from './sprites';
import { decorDef } from '@/shared/decor';
import { QTY_STEPS, SELL_CHIPS, SHOP_TAB_NAMES, buyMax, clampQty, farmSeeds, farmSellList, sellGroup, shopChipsFor, shopItemsFor, type ShopTab } from './shopModel';
import { commClaimable } from './commissionsView';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

type Tab = ShopTab | 'sell' | 'craft';
interface Sel { kind: 'buy' | 'sell'; id: string }
export interface ShopHooks {
  /** 钓具摊的「📋 钓鱼委托」按钮：关掉摊位，打开任务面板的钓鱼页 */
  openQuests?: (tab: 'fishing') => void;
}

const STALL_SAY = '「钓鱼的人，装备和耐心一样要紧。」';

/**
 * 商店：广场西侧的校园商店 / 精工湖的钓具摊 / 农场里的农场管理员（走近按 E 打开）。
 * 校园商店五页：补给 / 钓具 / 家具 / 出售 / 合成；钓具摊三页：买钓具 / 出售 / 合成（委托在「任务」里，摊位顶部有入口按钮）；
 * 农场管理员两页：买种子 / 卖菜（只碰作物）。
 * 每页用小号筛选标签分类；列表行紧凑（图标 + 名称 + 价格 + 一个小按钮 = 买 / 卖 1 个），点一行选中后，底部出现全页共用的一条数量条（步进 + ×1 ×5 ×10 最大 + 总价 + 确认）。
 * 货币、价格、行情、限额全在 shared/economy.ts；买卖由服务器结算（它也会检查你是不是真的站在店门口 / 农场里）。这里只显示。
 */
export class ShopPanel {
  private root = el('div', 'screen hidden');
  private panel = el('div', 'box shop');
  private body = el('div', 'shop-body');
  private coinEl = el('span', 'shop-coins', '0');
  private msg = el('div', 'shop-msg');
  private tabRow = el('div', 'cx-tabs shop-tabs');
  private chipRow = el('div', 'shop-chips');
  private titleEl = el('div', 'board-title', '校园商店');
  private subEl = el('div', 'shop-sub');
  private bossEl = el('div', 'shop-boss hidden');
  private bossBtn = el('button', 'btn primary shop-boss-btn', '📋 钓鱼委托');
  private bar = el('div', 'shop-bar hidden');
  /** shop = 图书馆广场的校园商店；stall = 精工湖的钓具摊（只卖钓鱼用品；收鱼 / 收杂物和主商店一样）；farm = 农场管理员（只卖种子、只收菜） */
  private mode: 'shop' | 'stall' | 'farm' = 'shop';
  private tab: Tab = 'sell';
  private chips = new Map<string, string>();
  private sel: Sel | null = null;
  private qty = 1;
  private craftParam = '';
  /** 上一次画的是哪一页（模式:标签:筛选）：同一页重画时保留滚动位置 */
  private shownKey = '';
  private coins = 0; private inv: Inv = {};

  /** day() 返回今天的日期编号（东八区，和服务器一致），用来算今日行情 */
  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private day: () => number, private hooks: ShopHooks = {}) {
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭商店');
    close.addEventListener('click', () => this.close());
    const wallet = el('div', 'shop-wallet'); wallet.append(el('span', 'coin-ico'), this.coinEl, el('span', 'shop-unit', COIN_NAME));
    head.append(this.titleEl, wallet, close);
    this.bossBtn.type = 'button';
    this.bossBtn.addEventListener('click', () => { this.close(); this.hooks.openQuests?.('fishing'); });
    this.panel.append(head, this.subEl, this.bossEl, this.tabRow, this.chipRow, this.msg, this.body, this.bar);
    this.root.append(this.panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    net.handlers.shopResult = (ok, text) => this.say(text, ok);
    net.handlers.craftResult = (ok, text) => this.say(text, ok);
    fishData.listeners.add(() => { if (this.isOpen) this.render(); });
  }

  /** 页签：校园商店 = 补给 / 钓具 / 家具 / 出售 / 合成；钓具摊 = 买钓具 / 出售 / 合成；农场管理员 = 买种子 / 卖菜 */
  private tabDefs(): [Tab, string][] {
    return this.mode === 'stall' ? [['gear', '买钓具'], ['sell', '出售'], ['craft', '合成']]
      : this.mode === 'farm' ? [['supply', '买种子'], ['sell', '卖菜']]
        : [['supply', SHOP_TAB_NAMES.supply], ['gear', SHOP_TAB_NAMES.gear], ['furn', SHOP_TAB_NAMES.furn], ['sell', '出售'], ['craft', '合成']];
  }
  private buildTabs() {
    const defs = this.tabDefs();
    if (!defs.some(([k]) => k === this.tab)) this.tab = defs[0][0];
    this.tabRow.replaceChildren(...defs.map(([k, name]) => {
      const b = el('button', 'cx-tab' + (k === this.tab ? ' on' : ''), name); b.type = 'button';
      b.addEventListener('click', () => { this.tab = k; this.sel = null; this.buildTabs(); this.render(); });
      return b;
    }));
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }
  open(mode: 'shop' | 'stall' | 'farm' = 'shop') {
    this.mode = mode; this.shownKey = ''; this.sel = null; this.root.classList.remove('hidden'); this.msg.textContent = '';
    const stall = mode === 'stall', farm = mode === 'farm';
    this.panel.classList.toggle('shop-stall', stall);
    this.panel.classList.toggle('shop-farm', farm);
    this.titleEl.textContent = stall ? '钓具摊 · 钓具老板' : farm ? '农场管理员' : '校园商店';
    this.subEl.classList.remove('hidden');
    this.subEl.classList.toggle('hidden', stall); this.bossEl.classList.toggle('hidden', !stall);
    this.subEl.textContent = farm
      ? '种子不分季节，买回去随时能种；收下来的菜也按固定价卖给他。'
      : '钓上来的鱼、翻垃圾桶翻出来的东西都可以出售；赚到的校园币能买鱼饵、猫粮和宿舍家具。';
    if (stall) this.buildBoss();
    this.buildTabs(); this.net.getInv(); this.net.getCoins(); this.net.getFx(); if (stall) this.net.getWq(); this.render();
  }
  close() { this.root.classList.add('hidden'); }
  setCoins(n: number) { this.coins = n; this.coinEl.textContent = String(n); if (this.isOpen) this.render(); }
  setInv(inv: Inv) { this.inv = inv; if (this.isOpen) this.render(); }
  private say(t: string, ok: boolean) { this.msg.textContent = t; this.msg.classList.toggle('bad', !ok); }

  /** 钓具摊顶部：老板的一句话 + 醒目的「📋 钓鱼委托」入口（有奖励可领时带红点） */
  private buildBoss() {
    this.bossEl.replaceChildren(el('div', 'shop-boss-say', STALL_SAY), this.bossBtn);
    this.bossBtn.textContent = commClaimable(fishData.wq) ? '📋 钓鱼委托 ●' : '📋 钓鱼委托';
  }

  private icon(id: string) { return itemImg(this.textures, id, 2, 'shop-ico'); }
  private chipOf() { return this.chips.get(`${this.mode}:${this.tab}`) ?? ''; }

  /**
   * 重画整页内容。买/卖/合成之后服务器会连着推背包和校园币，每次都要重画，
   * 所以要把滚动位置记下来再还原——否则买一样东西列表就跳回最上面。切换标签页、重新打开商店才回到顶部。
   */
  private render() {
    const key = `${this.mode}:${this.tab}:${this.chipOf()}`, list = this.body.querySelector<HTMLElement>('.shop-list');
    const top = list && key === this.shownKey ? list.scrollTop : 0, outer = this.root.scrollTop;
    this.body.replaceChildren(); this.chipRow.replaceChildren();
    if (this.mode === 'stall') this.buildBoss();
    const online = this.net.status === 'online';
    if (!online) { this.body.append(el('div', 'board-empty', '没连上服务器，现在不能买卖。')); this.bar.classList.add('hidden'); this.chipRow.classList.add('hidden'); }
    else if (this.tab === 'craft') { this.chipRow.classList.add('hidden'); this.renderCraft(); }
    else if (this.tab === 'sell') this.renderSell();
    else this.renderBuy(this.tab);
    if (!online || this.tab === 'craft') { this.bar.classList.add('hidden'); } else this.renderBar();
    const now = this.body.querySelector<HTMLElement>('.shop-list');
    if (now && top) now.scrollTop = top;
    if (key === this.shownKey) this.root.scrollTop = outer;
    this.shownKey = key;
  }

  /** 筛选标签一行：「全部」+ 这页里真有东西的分类；只有一个分类时不显示 */
  private buildChips(names: string[]) {
    if (names.length < 2) { this.chipRow.classList.add('hidden'); return; }
    this.chipRow.classList.remove('hidden');
    const cur = this.chipOf();
    for (const n of ['', ...names]) {
      const b = el('button', 'shop-chip' + (n === cur ? ' on' : ''), n || '全部'); b.type = 'button';
      b.addEventListener('click', () => { this.chips.set(`${this.mode}:${this.tab}`, n); this.sel = null; this.render(); });
      this.chipRow.append(b);
    }
  }

  // ---------------------------------------------------------------- 买
  private renderBuy(tab: ShopTab) {
    const stall = this.mode === 'stall', farm = this.mode === 'farm';
    const names = farm ? [] : shopChipsFor(tab, stall); // 农场只有几包种子，不分小标签
    if (this.chipOf() && !names.includes(this.chipOf())) this.chips.set(`${this.mode}:${this.tab}`, '');
    this.buildChips(names);
    const list = el('div', 'shop-list');
    for (const s of farm ? farmSeeds() : shopItemsFor(tab, this.chipOf(), stall)) list.append(this.buyRow(s));
    const tips: Record<ShopTab, string> = {
      supply: '猫粮每天登录会补到 5 包；猫窝送给校园里的小猫（好感 +20），宿舍里摆的「宿舍猫窝」在「家具」页。',
      gear: '万能饵、指名饵、神话饵、龙骨竿、寒江竿、并蒂竿不在商店卖：要靠合成或钓鱼时的盲盒。配件不消耗，要装在带配件槽的鱼竿上。',
      furn: '宿舍家具买回来，在自己的宿舍里点「装修」摆放；不想要了可以在「出售」页按原价的一半退货。染料装修时给家具上色。',
    };
    list.append(el('div', 'shop-tip', farm ? '一包种子种一块地；种下后每个游戏日浇一次水，成熟了就能收。' : tips[tab]));
    this.body.append(list);
  }
  private buyRow(s: ShopItem) {
    const d = itemDef(s.id)!, have = this.inv[s.id] ?? 0, row = el('div', 'shop-row' + (this.sel?.kind === 'buy' && this.sel.id === s.id ? ' sel' : ''));
    const owned = d.stack === 1 && have >= 1, max = buyMax(s, this.coins, have, d.stack), can = max >= 1;
    const info = el('div', 'shop-info');
    const nm = el('div', 'shop-name', `${d.name}${s.n > 1 ? ` ×${s.n}` : ''}`);
    if (have > 0) nm.append(el('span', 'shop-have', `　有 ${have}`));
    info.append(nm, el('div', 'shop-note', s.note));
    const price = el('div', 'shop-price'); price.append(el('span', 'coin-ico'), document.createTextNode(String(s.price)));
    const b = el('button', 'btn sm' + (can ? ' primary' : ''), owned ? '已有' : '买'); b.type = 'button'; b.disabled = !can;
    b.title = can || owned ? '' : `还差 ${s.price - this.coins} 校园币`;
    b.addEventListener('click', (e) => { e.stopPropagation(); b.disabled = true; this.net.shopBuy(s.id, 1); });
    row.addEventListener('click', () => this.select({ kind: 'buy', id: s.id }));
    row.append(this.icon(s.id), info, price, b);
    return row;
  }

  // ---------------------------------------------------------------- 卖
  private renderSell() {
    const farm = this.mode === 'farm';
    const day = this.day(), bonus = fishData.sellBonus;
    const all = farm ? farmSellList(this.inv, day, bonus) : sellList(this.inv, day, bonus);
    const present = farm ? [] : SELL_CHIPS.filter((c) => all.some((r) => sellGroup(r.id) === c));
    if (this.chipOf() && !present.includes(this.chipOf() as never)) this.chips.set(`${this.mode}:${this.tab}`, '');
    this.buildChips(present);
    const cur = farm ? '' : this.chipOf(), rows = all.filter((r) => !cur || sellGroup(r.id) === cur);
    const list = el('div', 'shop-list');
    if (!all.length) list.append(el('div', 'board-empty', farm ? '背包里没有可以卖的菜。去地里种点东西，熟了再拿来。' : '背包里没有东西可以出售。去精工湖边钓几条鱼，或者翻翻校园里的垃圾桶吧！'));
    for (const r of rows) {
      const row = el('div', 'shop-row' + (this.sel?.kind === 'sell' && this.sel.id === r.id ? ' sel' : '')), info = el('div', 'shop-info');
      const mul = r.rarity === 'junk' || !fishDef(r.id) ? 1 : marketMul(day, r.id), trend = mul >= 1.1 ? '行情好 ↑' : mul <= 0.93 ? '行情差 ↓' : '';
      const name = el('div', 'shop-name', `${r.name} ×${r.n}`); name.style.color = r.rarity === 'common' || r.rarity === 'junk' ? '' : RARITY_COLORS[r.rarity];
      const sub = el('div', 'shop-note', farm ? '作物 · 固定价收购' : decorDef(r.id) ? '宿舍家具 · 退货按原价的一半' : isTrashItem(r.id) ? (r.id === TREASURE_ID ? '垃圾桶里翻出来的好东西' : '垃圾桶里翻出来的') : (EXTRA_SELL[r.id] ? '盲盒、河蚌里得到的小东西' : `${RARITY_NAMES[r.rarity]}${trend ? ` · ${trend}` : ''}`));
      info.append(name, sub);
      const price = el('div', 'shop-price'); price.append(el('span', 'coin-ico'), document.createTextNode(`${r.price}`));
      const b = el('button', 'btn sm primary', '出售'); b.type = 'button';
      b.addEventListener('click', (e) => { e.stopPropagation(); b.disabled = true; this.net.shopSell(r.id, 1); });
      row.addEventListener('click', () => this.select({ kind: 'sell', id: r.id }));
      row.append(this.icon(r.id), info, price, b);
      list.append(row);
    }
    if (farm) {
      list.append(el('div', 'shop-tip', '作物按固定价收，没有行情；鱼和杂物去图书馆广场的校园商店卖。'));
      this.body.append(list);
      return;
    }
    const bulk = el('button', 'btn sm shop-bulk', '一键出售：杂物 + 常见 / 少见的鱼'); bulk.type = 'button';
    bulk.disabled = !all.some((r) => (BULK_RARITIES as readonly string[]).includes(r.rarity));
    bulk.addEventListener('click', () => this.net.shopSellBulk());
    list.append(el('div', 'shop-tip', '稀有及以上的鱼和 U 盘不会被一键出售，想出售请手动点；鱼也可以拿去喂小猫涨好感。今日行情每天变一次。'));
    this.body.append(bulk, list);
  }

  // ---------------------------------------------------------------- 共用数量条
  private select(s: Sel) {
    if (this.sel?.kind === s.kind && this.sel.id === s.id) { this.sel = null; } else { this.sel = s; this.qty = 1; }
    this.render();
  }
  /** 当前选中项在这一页还能不能买 / 卖、最多几份、单价 */
  private selInfo(): { name: string; unit: number; per: number; max: number; why: string } | null {
    const s = this.sel; if (!s) return null;
    if (s.kind === 'buy') {
      const it = shopItem(s.id), d = itemDef(s.id); if (!it || !d) return null;
      const have = this.inv[s.id] ?? 0, max = buyMax(it, this.coins, have, d.stack);
      return { name: `${d.name}${it.n > 1 ? ` ×${it.n}` : ''}`, unit: it.price, per: it.n, max, why: d.stack === 1 && have >= 1 ? '已经有了' : this.coins < it.price ? `还差 ${it.price - this.coins} 校园币` : max < 1 ? '背包放不下了' : '' };
    }
    const r = sellList(this.inv, this.day(), fishData.sellBonus).find((x) => x.id === s.id);
    if (!r) return null;
    return { name: r.name, unit: r.price, per: 1, max: r.n, why: '' };
  }
  private renderBar() {
    const info = this.selInfo();
    if (!info) { this.sel = null; this.bar.classList.add('hidden'); this.bar.replaceChildren(); return; }
    this.bar.classList.remove('hidden');
    const buy = this.sel!.kind === 'buy';
    this.qty = clampQty(this.qty, info.max) || 1;
    const title = el('div', 'shop-bar-title'); title.append(el('b', undefined, info.name), el('span', 'shop-bar-unit', ` 单价 ${info.unit} ${COIN_NAME}${buy ? '' : ' / 个'}`));
    const total = el('div', 'shop-bar-total');
    const confirm = el('button', 'btn primary shop-bar-go', buy ? '确认购买' : '确认出售'); confirm.type = 'button';
    const num = el('input', 'shop-bar-num') as HTMLInputElement; num.type = 'number'; num.min = '1'; num.max = String(Math.max(1, info.max)); num.setAttribute('aria-label', '数量');
    const paint = () => {
      num.value = String(this.qty);
      total.textContent = `共 ${this.qty * info.unit} ${COIN_NAME}${buy && info.per > 1 ? `（${this.qty * info.per} 个）` : ''}`;
      confirm.disabled = info.max < 1;
    };
    const setQty = (n: number) => { this.qty = clampQty(n, info.max) || 1; paint(); };
    const step = (d: number) => { const b = el('button', 'btn sm shop-bar-step', d < 0 ? '−' : '+'); b.type = 'button'; b.disabled = info.max < 1; b.addEventListener('click', () => setQty(this.qty + d)); return b; };
    num.addEventListener('input', () => { const v = Number(num.value); if (Number.isFinite(v) && v >= 1) { this.qty = clampQty(v, info.max) || 1; total.textContent = `共 ${this.qty * info.unit} ${COIN_NAME}`; } });
    num.addEventListener('change', () => setQty(Number(num.value)));
    const quick = el('div', 'shop-bar-quick');
    for (const n of QTY_STEPS) if (n > 1 && n <= info.max) { const b = el('button', 'btn sm', `×${n}`); b.type = 'button'; b.addEventListener('click', () => setQty(n)); quick.append(b); }
    const maxBtn = el('button', 'btn sm', buy ? '最大' : '全部'); maxBtn.type = 'button'; maxBtn.disabled = info.max < 1; maxBtn.addEventListener('click', () => setQty(info.max)); quick.append(maxBtn);
    confirm.addEventListener('click', () => {
      if (info.max < 1) return;
      confirm.disabled = true;
      if (buy) this.net.shopBuy(this.sel!.id, this.qty); else this.net.shopSell(this.sel!.id, this.qty);
    });
    const line1 = el('div', 'shop-bar-l1'); line1.append(title, total);
    const line2 = el('div', 'shop-bar-l2'); line2.append(step(-1), num, step(1), quick, confirm);
    this.bar.replaceChildren(line1, line2);
    if (info.why) this.bar.append(el('div', 'shop-bar-why', info.why));
    paint();
  }

  // ---------------------------------------------------------------- 合成
  /** 合成：杂物换鱼饵、小鱼做饵、指名饵、神话饵、龙骨竿（规则在 shared/craft.ts，服务器扣材料和币） */
  private renderCraft() {
    const list = el('div', 'shop-list'), inv = this.inv;
    const count = (ids: readonly string[]) => ids.reduce((a, id) => a + (inv[id] ?? 0), 0);
    const need = (r: Recipe) => r.needs.map((n) => {
      if ('id' in n) return `${itemDef(n.id)?.name} ${Math.min(inv[n.id] ?? 0, n.n)}/${n.n}`;
      if (n.group === 'junk') return `杂物 ${Math.min(count(JUNK_GROUP), n.n)}/${n.n}`;
      if (n.group === 'small') return `小鱼 ${Math.min(count(SMALL_GROUP), n.n)}/${n.n}`;
      if (n.group === 'rare') return `稀有鱼 ${Math.min(count(RARE_GROUP), n.n)}/${n.n}`;
      return `同种鱼 ${this.craftParam ? Math.min(inv[this.craftParam] ?? 0, n.n) : 0}/${n.n}`;
    }).concat(r.coins ? [`${r.coins} 校园币`] : []).join('　');
    for (const r of RECIPES) {
      const row = el('div', 'shop-row shop-craft'), info = el('div', 'shop-info'), out = itemDef(r.out.id)!;
      info.append(el('div', 'shop-name', `${out.name}${r.out.n > 1 ? ` ×${r.out.n}` : ''}${r.minLevel > 1 ? `　（钓鱼 ${r.minLevel} 级）` : ''}`), el('div', 'shop-note shop-wrap', r.desc), el('div', 'shop-have shop-wrap', `材料：${need(r)}${fishData.level < r.minLevel ? `　·　还差 ${r.minLevel - fishData.level} 级` : ''}`));
      if (r.needs.some((n) => 'group' in n && n.group === 'same')) {
        const sel = el('select'); sel.setAttribute('aria-label', '选一种鱼'); sel.append(new Option('选一种鱼（背包里有 3 条以上的）', ''));
        for (const [id, n] of Object.entries(inv)) if (isNamedFish(id) && n >= 3) sel.append(new Option(`${fishDef(id)?.name} ×${n}`, id));
        sel.value = this.craftParam && (inv[this.craftParam] ?? 0) >= 3 ? this.craftParam : '';
        sel.addEventListener('change', () => { this.craftParam = sel.value; this.render(); });
        info.append(sel);
      }
      const why = craftWhy(inv, this.coins, r, this.craftParam || undefined, fishData.level);
      const b = el('button', 'btn sm' + (why ? '' : ' primary'), '合成'); b.type = 'button'; b.disabled = !!why; b.title = why ?? '';
      b.addEventListener('click', () => { b.disabled = true; this.net.craft(r.id, this.craftParam || undefined); });
      row.append(this.icon(r.out.id), info, b);
      list.append(row);
    }
    list.append(el('div', 'shop-tip', '龙鳞来自神话鱼和沉船箱，珍珠来自河蚌。垃圾不会白捡：杂物也能换鱼饵。'));
    this.body.append(list);
  }
}
