import type Phaser from 'phaser';
import {
  CROPS, canPlant, canSteal, canWater, cropOfSeed, growthText, harvestYield, plotStage, stealLimit,
  type FarmOp, type FarmPlot,
} from '@/shared/farming';
import { SEASON_NAME, type Season } from '@/shared/season';
import type { Inv } from '@/shared/items';
import type { ServerMsg } from '@/shared/protocol';
import type { NetClient } from '@/net/client';
import { itemImg } from './sprites';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

type FarmData = Extract<ServerMsg, { t: 'farm' }>;
type Tab = 'mine' | 'seed' | 'visit';

export interface FarmHooks {
  /** 好友列表（访客页）：uid + 昵称 */
  friends: () => { uid: number; name: string }[];
  /** 现在的季节（反季判断） */
  season: () => Season;
  /** 背包（种子页显示还有几包） */
  inv: () => Inv;
  /** 收获成功了一次（第一次收会弹一段旁白，给「特殊种子」埋钩子；是不是第一次由外面判断） */
  harvested?: () => void;
}

/**
 * 我的农场：面板负责翻土 / 播种 / 浇水 / 收获 / 清除与访客页。
 * 传送面板选「我的农场」→ 进私人农场室内 → 走到耕地边按 E 打开这里（面板本身不绑定位置，服务器按位置校验操作）。
 * 面板只发"我想做什么"（farm_op），翻土/播种/浇水/收获/偷摘的结算与每日上限全在服务器；收到 farm 消息就重画。
 */
export class FarmPanel {
  private root = el('div', 'screen hidden');
  private panel = el('div', 'box farm');
  private titleEl = el('div', 'board-title', '我的农场');
  private subEl = el('div', 'farm-sub', '');
  private msg = el('div', 'shop-msg', '');
  private tabRow = el('div', 'cx-tabs farm-tabs');
  private body = el('div', 'farm-body');

  private data: FarmData | null = null;
  private tab: Tab = 'mine';
  /** 选中的种子（我的田里点「播种」用它） */
  private seed = '';
  /** 正在看谁的田：0 = 自己 */
  private viewing = 0;
  /** 从地里按 E 打开时站在第几块地（-1 = 不是从地里打开的）；打开后高亮并滚到这张卡片 */
  private focus = -1;
  private focusScroll = false;

  constructor(private net: NetClient, private textures: Phaser.Textures.TextureManager, private hooks: FarmHooks) {
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕');
    close.type = 'button'; close.setAttribute('aria-label', '关闭农场');
    close.addEventListener('click', () => this.close());
    head.append(this.titleEl, close);
    this.panel.append(head, this.subEl, this.tabRow, this.msg, this.body);
    this.root.append(this.panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);

    net.handlers.farm = (m) => { this.data = m; this.viewing = m.mine ? 0 : m.uid; this.render(); };
    net.handlers.farmResult = (m) => {
      this.say(m.msg, m.ok);
      if (m.ok && m.op === 'harvest') this.hooks.harvested?.(); // 服务器在回执里标了农活类型，不用解析文案
    };
  }

  get isOpen() { return !this.root.classList.contains('hidden'); }

  /** slot = 站在第几块地边按的 E（0 起）：打开后高亮这块地并滚到它；从菜单 / 面板打开时省略 */
  open(slot: number = -1) { this.tab = 'mine'; this.seed = ''; this.data = null; this.viewing = 0; this.focus = slot; this.focusScroll = slot >= 0; this.root.classList.remove('hidden'); this.msg.textContent = ''; this.net.getFarm(); this.render(); }
  close() { this.root.classList.add('hidden'); }

  private say(t: string, ok: boolean) { this.msg.textContent = t; this.msg.classList.toggle('bad', !ok); }
  private get online() { return this.net.status === 'online'; }

  private render() {
    this.buildTabs();
    this.body.replaceChildren();
    if (!this.online) {
      this.subEl.textContent = '';
      this.body.append(el('div', 'farm-empty', '连上服务器才能种地（单机调试模式下农场不可用）。'));
      return;
    }
    const d = this.data;
    if (!d) { this.subEl.textContent = '读取中…'; this.body.append(el('div', 'farm-empty', '正在打开田门…')); return; }
    const season = this.hooks.season();
    this.titleEl.textContent = d.mine ? '我的农场' : `${d.name} 的田`;
    this.subEl.textContent = `${SEASON_NAME[season]}天${d.mine ? ` · 还能偷摘 ${d.stealLeft} 次` : ''}`;
    if (this.tab === 'seed') this.renderSeeds();
    else if (this.tab === 'visit') this.renderVisit();
    else this.renderPlots(d);
  }

  private buildTabs() {
    const defs: [Tab, string][] = [['mine', '我的田'], ['seed', '种子袋'], ['visit', '访客']];
    this.tabRow.replaceChildren(...defs.map(([k, name]) => {
      const b = el('button', 'cx-tab' + (k === this.tab ? ' on' : ''), name);
      b.type = 'button';
      b.addEventListener('click', () => { this.tab = k; this.render(); });
      return b;
    }));
  }

  private icon(id: string) { return itemImg(this.textures, id, 2, 'farm-ico'); }

  /** 我的田：6 张地块卡片 + 底部的被偷记录 */
  private renderPlots(d: FarmData) {
    const grid = el('div', 'farm-grid');
    d.plots.forEach((p, i) => grid.append(this.plotCard(p, i, d)));
    this.body.append(grid);
    if (this.focusScroll) { // 刚在地边按 E 打开：滚到这块地（数据到了才画得出卡片，所以在这里滚）
      this.focusScroll = false;
      const card = grid.children[this.focus] as HTMLElement | undefined;
      if (card) requestAnimationFrame(() => card.scrollIntoView({ block: 'nearest' }));
    }
    if (d.mine) {
      const seed = cropOfSeed(this.seed);
      this.body.append(el('div', 'farm-tip', seed
        ? `已选：${seed.name}种子 — 点一块「翻好的地」的「播种」（不分季节，随时能种）。`
        : '先点一块「荒地」翻土，再去「种子袋」选一包种子就能播种。'));
      const log = el('div', 'farm-log');
      log.append(el('div', 'farm-log-title', '最近被偷'));
      if (!d.log.length) log.append(el('div', 'farm-empty', '还没有人来偷过。'));
      for (const e of d.log.slice(0, 8)) log.append(el('div', 'farm-log-row', `第 ${e.d} 天 · ${e.n} 摘走了你 ${e.k} 个${this.cropName(e.c)}`));
      this.body.append(log);
    } else {
      this.body.append(el('div', 'farm-tip', '帮好友浇水不花钱；偷摘每天最多 3 次，一块地只能摘一次，而且一定给他留一个。'));
    }
  }

  private cropName(id: string) { return CROPS.find((c) => c.id === id)?.name ?? id; }

  private plotCard(p: FarmPlot, i: number, d: FarmData) {
    const stage = plotStage(p, d.today);
    const card = el('div', `farm-plot ${stage}${i === this.focus ? ' focus' : ''}`);
    card.append(el('div', 'farm-idx', `${i + 1}`));
    card.append(p.c ? this.icon(p.c) : el('div', 'farm-ico farm-ico-empty'));
    card.append(el('div', 'farm-state', p.c ? growthText(p, d.today) : (p.t ? '翻好的地 · 可播种' : '荒地 · 先翻土')));
    if (p.k > 0) card.append(el('div', 'farm-stolen', `被偷 ${p.k} 个`));
    const row = el('div', 'farm-btns');
    const btn = (label: string, op: FarmOp, opts: { seed?: string; uid?: number; disabled?: string } = {}) => {
      const b = el('button', 'btn farm-btn', label);
      b.type = 'button';
      if (opts.disabled) { b.disabled = true; b.title = opts.disabled; }
      else b.addEventListener('click', () => { this.say('', true); this.net.farmOp(op, i, { seed: opts.seed, uid: opts.uid }); });
      row.append(b);
      return b;
    };
    if (d.mine) {
      if (stage === 'empty') {
        if (!p.t) { // 荒地：先翻土
          btn('翻土', 'till');
        } else { // 翻好的地：选了种子就能播
          const seed = cropOfSeed(this.seed);
          if (seed) {
            const why = canPlant(seed.id);
            btn('播种', 'plant', { seed: seed.id, disabled: why.ok ? undefined : why.why });
          }
        }
      } else if (stage === 'ripe') {
        btn(`收获 ${harvestYield(p)}`, 'harvest');
      } else {
        const why = canWater(p, d.today);
        btn('浇水', 'water', { disabled: why.ok ? undefined : why.why });
      }
    } else {
      if (stage === 'ripe') {
        const why = canSteal(p, d.today, d.stealLeft); // 已经摘过 / 次数用完 / 太大搬不动：按钮直接灰掉，别等服务器报错
        btn('偷摘 1', 'steal', { uid: this.viewing, disabled: why.ok ? undefined : why.why });
        if (stealLimit(p) <= 0) card.append(el('div', 'farm-stolen', '太重，搬不动'));
      }
      if (stage === 'growing') {
        const why = canWater(p, d.today); // 他今天已经浇过：灰掉（原来点了才被服务器拒绝）
        btn('帮浇水', 'help_water', { uid: this.viewing, disabled: why.ok ? undefined : why.why });
      }
    }
    card.append(row);
    return card;
  }

  /** 种子袋：所有作物的种子（商店买），显示还有几包、成熟天数和收益（不分季节，随时能种） */
  private renderSeeds() {
    const inv = this.hooks.inv();
    const list = el('div', 'farm-seeds');
    for (const c of CROPS) {
      const n = inv[c.seed] ?? 0;
      const row = el('div', 'farm-seed' + (this.seed === c.seed ? ' on' : ''));
      row.append(this.icon(c.seed));
      const info = el('div', 'farm-seed-info');
      info.append(el('div', 'farm-seed-name', `${c.name}种子`));
      info.append(el('div', 'farm-seed-note', `${c.days} 天成熟 · 收 ${c.yield} 个（${c.price} 币/个）· 种子 ${c.seedPrice} 币`));
      row.append(info);
      row.append(el('span', 'farm-seed-n', `×${n}`));
      const b = el('button', 'btn farm-btn', n > 0 ? '选它' : '没货');
      b.type = 'button';
      if (n === 0) b.disabled = true;
      else b.addEventListener('click', () => { this.seed = c.seed; this.tab = 'mine'; this.render(); });
      row.append(b);
      list.append(row);
    }
    this.body.append(list);
    this.body.append(el('div', 'farm-tip', '种子找农场管理员买（走到他旁边按 E）；收下来的菜也卖给他。'));
    // 伏笔（先不点破是什么）：给以后「特殊种子 → 植物精灵」留个悬念，东西到底能不能种活，先不回答
    this.body.append(el('div', 'farm-tip', '（种子袋最底层有点动静。拨开一看，一颗没见过的种子缩在角落里，摸上去是温的——刚才它是不是挪了半寸？）'));
  }

  /** 访客：好友列表 → 看他的田 */
  private renderVisit() {
    const friends = this.hooks.friends();
    if (!friends.length) { this.body.append(el('div', 'farm-empty', '还没有好友。加了好友才能去别人的田里浇水、偷摘。')); return; }
    const list = el('div', 'farm-seeds');
    for (const f of friends) {
      const row = el('div', 'farm-seed' + (this.viewing === f.uid ? ' on' : ''));
      row.append(el('span', 'farm-seed-name', f.name));
      const b = el('button', 'btn farm-btn', '看看');
      b.type = 'button';
      b.addEventListener('click', () => { this.viewing = f.uid; this.net.getFarm(f.uid); });
      row.append(b);
      list.append(row);
    }
    this.body.append(list);
    if (this.viewing) {
      const back = el('button', 'btn', '↩ 回来看自己的田');
      back.type = 'button';
      back.addEventListener('click', () => { this.viewing = 0; this.tab = 'mine'; this.net.getFarm(); });
      this.body.append(back);
      if (this.data && !this.data.mine) {
        const grid = el('div', 'farm-grid');
        this.data.plots.forEach((p, i) => grid.append(this.plotCard(p, i, this.data!)));
        this.body.append(grid);
      }
    }
  }
}
