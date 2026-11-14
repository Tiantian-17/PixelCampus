import type { NetClient } from '@/net/client';
import { TELEPORTS, TELEPORT_GROUPS, TP_COOLDOWN_MS } from '@/shared/teleport';
import { ui } from './actions';

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

/**
 * 传送面板：按分组列出预设地点（南门/东门/西门、图书馆门前、教学楼、餐厅、各社区、留学生公寓、42 号楼），点一下就传过去。
 * 服务器校验状态（骑车/坐着/钓鱼/战斗中不能传）和冷却；这里只显示一个"冷却中"的小提示，真正的判断都在服务器。
 * 电脑按 Y 或点菜单「传送」，手机点 ☰ → 传送。
 */
export class TeleportPanel {
  private root = el('div', 'screen hidden');
  private msg = el('div', 'tp-msg');
  private buttons: HTMLButtonElement[] = [];
  private lastGo = 0;

  /** 点了某一层：等服务器说「传到了」之后，通知场景进入这一层 */
  private pendingFloor: string | null = null;
  /** 刚点了哪个地点（onGone 要用它判断"是不是传到了校园农场"） */
  private pendingId: string | null = null;
  /** 这次去农场是不是从大树洞钻的（onGone 要换树洞版的进场特效和横幅） */
  private viaTree = false;

  constructor(private net: NetClient, private onGone: (floor?: string, id?: string, viaTree?: boolean) => void = () => {}) {
    const panel = el('div', 'box tp');
    const head = el('div', 'board-head');
    const close = el('button', 'btn', '✕'); close.type = 'button'; close.setAttribute('aria-label', '关闭传送面板');
    close.addEventListener('click', () => this.close());
    head.append(el('div', 'board-title', '传送'), close);
    panel.append(head, el('div', 'create-sub', '点一个地点，立刻传过去（骑车、坐着、钓鱼、战斗中不能传，传送后有几秒冷却）。'), this.msg);
    for (const g of TELEPORT_GROUPS) {
      panel.append(el('div', 'tp-group', g));
      const row = el('div', 'tp-row');
      for (const t of TELEPORTS.filter((x) => x.group === g)) {
        const b = el('button', 'btn tp-btn', t.name); b.type = 'button'; b.dataset.id = t.id;
        b.addEventListener('click', () => this.go(t.id, null));
        this.buttons.push(b);
        if (t.floors) { // 多层建筑：名字下面再排「1F 2F 3F」，点哪层直接进哪层
          const cell = el('div', 'tp-cell'), fl = el('div', 'tp-floors');
          for (const f of t.floors) { const fb = el('button', 'btn tp-floor', f.label); fb.type = 'button'; fb.title = `${t.name} ${f.label}`; fb.addEventListener('click', () => this.go(t.id, f.interior)); fl.append(fb); }
          cell.append(b, fl); row.append(cell);
        } else row.append(b);
      }
      panel.append(row);
    }
    this.root.append(panel);
    this.root.addEventListener('mousedown', (e) => { if (e.target === this.root) this.close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && this.isOpen) this.close(); });
    (document.getElementById('hud') ?? document.body).append(this.root);
    ui.add({ id: 'teleport', label: '传送', key: 'Y', run: () => this.toggle() });
    net.handlers.tpResult = (ok, msg) => {
      this.say(msg, ok);
      if (ok) { const fl = this.pendingFloor ?? undefined, id = this.pendingId ?? undefined, tree = this.viaTree; this.pendingFloor = null; this.pendingId = null; this.viaTree = false; this.lastGo = Date.now(); this.close(); this.onGone(fl, id, tree); } else { this.pendingFloor = null; this.pendingId = null; this.viaTree = false; }
    };
  }

  /** 菜单「农场」：不用先开面板，直接传送到农场（成功后由场景淡出进入私人农场空间）；fromTree = 从大树洞钻的，换树洞版特效 */
  goFarm(fromTree = false) { this.go('farm', null, fromTree); }

  private go(id: string, floor: string | null, viaTree = false) {
    if (this.net.status !== 'online') { this.say('没连上服务器，不能传送', false); return; }
    // 树洞标记每次都由调用方给：离线 / 被拒时不留下残留，否则下次从面板正常传农场会误用「🌳 大树洞」的横幅和黑屏特效
    this.viaTree = viaTree && id === 'farm';
    this.lastGo = Date.now(); this.pendingFloor = floor; this.pendingId = id; this.net.tpGo(id);
  }
  get isOpen() { return !this.root.classList.contains('hidden'); }
  open() { this.say('', true); this.root.classList.remove('hidden'); }
  close() { this.root.classList.add('hidden'); }
  toggle() { this.isOpen ? this.close() : this.open(); }
  private say(text: string, ok: boolean) { this.msg.textContent = text; this.msg.className = `tp-msg ${ok ? 'ok' : 'bad'}`; }
  /** 刚传送过的冷却（只用来灰掉按钮，服务器才是准的） */
  get cooling() { return Date.now() - this.lastGo < TP_COOLDOWN_MS; }
}
