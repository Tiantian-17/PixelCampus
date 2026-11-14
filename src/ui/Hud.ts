import type { Poi } from '@/shared/blueprint';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

/** DOM 叠层 HUD：地点横幅、时钟、交互提示、多页对话框、小地图、加载条。 */
export class Hud {
  private bannerTimer = 0;
  private mapBig = false;
  private tilesW = 1; private tilesH = 1;
  private pages: string[] = [];
  private pageIdx = 0;
  /** 这段对话翻完（或被 Esc 关掉）时的回调：树洞小剧情用它在对话结束后接着传送 */
  private onDialogDone?: () => void;
  dialogOpen = false;
  /** 管理员：点开大地图后点任意位置传送（格坐标）；不设置就是普通玩家，地图只能看 */
  private onMapPick: ((tx: number, ty: number) => void) | null = null;

  setLoading(p: number, text?: string) {
    $('loading-fill').style.width = `${Math.round(p * 100)}%`;
    if (text) $('loading-text').textContent = text;
  }
  hideLoading() { $('loading').classList.add('done'); }

  /** 校园币余额（左上角小牌子）；涨了会轻轻弹一下 */
  setCoins(n: number) {
    const e = document.getElementById('coin-n'), box = document.getElementById('coin-pill'); if (!e || !box) return;
    const up = n > Number(e.textContent ?? 0);
    e.textContent = String(n);
    if (up) { box.classList.remove('pop'); void box.offsetWidth; box.classList.add('pop'); }
  }
  setClock(day: number, hhmm: string, phase: string, extra?: { season: string; weather: string; place: string; fest?: string }) {
    $('clock-day').textContent = extra ? `第 ${day} 天 · ${extra.season}` : `第 ${day} 天`;
    $('clock-time').textContent = hhmm;
    $('clock-phase').textContent = extra ? `${phase} · ${extra.weather}` : phase;
    const fest = document.getElementById('clock-fest'); if (fest && fest.textContent !== (extra?.fest ?? '')) fest.textContent = extra?.fest ?? '';
    const place = $('clock-place'); // 文字没变就不写 DOM
    const txt = extra ? `📍 ${extra.place}` : '';
    if (place.textContent !== txt) place.textContent = txt;
  }
  banner(title: string, sub?: string) {
    const b = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub ?? '';
    b.classList.remove('hidden', 'broadcast');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.add('hidden'), 2600);
  }
  /** 全服广播横幅：金色、停留更久、带稀有度配色（tone 影响主色） */
  broadcast(title: string, sub?: string, tone?: 'epic' | 'legendary' | 'mythic' | 'record') {
    const b = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub ?? '';
    b.classList.remove('hidden');
    b.classList.toggle('broadcast', true);
    if (tone) b.dataset.tone = tone; else delete b.dataset.tone;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    window.clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => b.classList.add('hidden'), 4200);
  }
  hint(text: string | null) {
    const h = $('hint');
    if (!text) { h.classList.add('hidden'); return; }
    h.textContent = document.body.classList.contains('touch') ? text.replace(/^E\s+/, '👆 ') : text; h.classList.remove('hidden');
  }

  /** 打开多页对话；pages 逐页显示，advanceDialog() 翻页，翻完自动关闭；onDone 在对话关闭（翻完或 Esc）时触发一次 */
  openDialog(title: string, pages: string | string[], onDone?: () => void) {
    this.pages = Array.isArray(pages) ? pages : [pages];
    this.pageIdx = 0;
    this.onDialogDone = onDone;
    $('dialog-title').textContent = title;
    $('dialog').classList.remove('hidden');
    this.dialogOpen = true; this.hint(null);
    this.renderPage();
  }
  private renderPage() {
    $('dialog-body').textContent = this.pages[this.pageIdx];
    const more = this.pageIdx < this.pages.length - 1;
    const touch = document.body.classList.contains('touch');
    $('dialog-foot').textContent = more ? `${touch ? '点这里继续' : '按 E 继续'} ▶  (${this.pageIdx + 1}/${this.pages.length})` : (touch ? '点这里关闭' : '按 E 或 Esc 关闭');
  }
  /** 返回 true 表示仍在对话中 */
  advanceDialog(): boolean {
    if (this.pageIdx < this.pages.length - 1) { this.pageIdx++; this.renderPage(); return true; }
    this.closeDialog(); return false;
  }
  closeDialog() { $('dialog').classList.add('hidden'); this.dialogOpen = false; const cb = this.onDialogDone; this.onDialogDone = undefined; cb?.(); }

  /** 小地图图片每格几像素（和 tools/world/compile.ts 的 MS 一致）；小地图按这个比例 1:1 显示，不缩放，像素才干净 */
  private static readonly MM_PX = 3;
  /** minor = 建筑名等次要地名：只在大地图上出现，而且为了不互相压住，放不下的会被丢掉；pri 越小越先放（地名 0，建筑按占地从大到小） */
  private poiEls: { el: HTMLElement; x: number; y: number; minor: boolean; pri: number }[] = [];
  private mmMode: 'local' | 'big' | '' = '';
  private mmKey = '';
  private layoutTimer = 0;

  /**
   * pois = 区域/大门等地名（小地图、大地图都显示）；extra = 建筑名等次要地名（只在大地图上显示，x、y 是中心格坐标，area 决定谁先占位置）。
   */
  setupMinimap(tilesW: number, tilesH: number, pois: Poi[], extra: { name: string; x: number; y: number; area: number }[] = []) {
    this.tilesW = tilesW; this.tilesH = tilesH;
    const mm = $('minimap');
    const mk = (name: string, x: number, y: number, minor: boolean, pri: number) => {
      const el = document.createElement('div');
      el.className = minor ? 'poi minor' : 'poi'; el.textContent = name;
      mm.appendChild(el);
      this.poiEls.push({ el, x, y, minor, pri });
    };
    for (const p of pois) if (p.kind !== 'spawn') mk(p.name, p.x, p.y, false, 0);
    [...extra].sort((a, b) => b.area - a.area).forEach((e, i) => mk(e.name, e.x, e.y, true, 1 + i));
    // 手机：大地图右上角的"×"，管理员模式下点图是传送，所以需要一个明确的关闭按钮
    const close = document.createElement('div');
    close.id = 'minimap-close'; close.textContent = '×'; close.title = '关闭（Esc / M）'; close.setAttribute('aria-label', '关闭地图');
    close.addEventListener('click', (e) => { e.stopPropagation(); if (this.mapBig) this.toggleMap(); });
    mm.appendChild(close);
    // 点小地图 = 打开大地图（stopImmediatePropagation：别让后面"管理员点图传送"的监听把这一下也当成选点）。
    // 手机上大地图开着时，点任意处 = 关闭（管理员除外：他点图是传送，用右上角的"×"关闭）。
    // 注意：关闭逻辑必须放在这同一个监听里——之前在 WorldScene 另挂了一个，手机上它先执行把图关了，
    // 这里紧接着又发现"没开"就重新打开，表现为"点了关不掉"。
    mm.addEventListener('click', (e) => {
      if (!this.mapBig) { e.stopImmediatePropagation(); this.toggleMap(); return; }
      if (document.body.classList.contains('touch') && !this.onMapPick) { e.stopImmediatePropagation(); this.toggleMap(); }
    });
    // 手机：小地图左上角的"–"收起，收起后右上角留一个"图"小图标；开关记在本机
    const hide = document.createElement('button'); hide.id = 'minimap-hide'; hide.type = 'button'; hide.textContent = '–'; hide.setAttribute('aria-label', '收起小地图');
    hide.addEventListener('click', (e) => { e.stopPropagation(); e.stopImmediatePropagation(); this.setMiniMap(false); });
    mm.appendChild(hide);
    const show = document.createElement('button'); show.id = 'minimap-show'; show.type = 'button'; show.textContent = '图'; show.setAttribute('aria-label', '打开小地图');
    show.addEventListener('click', () => this.setMiniMap(true));
    ($('hud') ?? document.body).appendChild(show);
    let on = true; try { on = localStorage.getItem('pixelcampus.minimap') !== '0'; } catch { /* 没有本地存储就按默认（开） */ }
    document.body.classList.toggle('mm-off', !on);
    window.addEventListener('resize', () => this.scheduleLayout());
  }
  /** 手机小地图（右上角小窗）开/关；记在本机。电脑上的小地图不受这个开关影响 */
  setMiniMap(on: boolean) { document.body.classList.toggle('mm-off', !on); try { localStorage.setItem('pixelcampus.minimap', on ? '1' : '0'); } catch { /* 忽略 */ } this.mmKey = ''; }
  get miniMapOn() { return !document.body.classList.contains('mm-off'); }
  /** 大地图上的名字布局：地名一定显示；建筑名按优先级依次放，和已放的重叠或出界就不放 */
  private layoutBig() {
    if (!this.mapBig) return;
    const r = $('minimap-img').getBoundingClientRect();
    if (!r.width) return;
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    for (const p of [...this.poiEls].sort((a, b) => a.pri - b.pri)) {
      const el = p.el;
      el.style.display = 'block'; el.style.left = `${(p.x / this.tilesW) * 100}%`; el.style.top = `${(p.y / this.tilesH) * 100}%`;
      const w = el.offsetWidth, h = el.offsetHeight, cx = (p.x / this.tilesW) * r.width, cy = (p.y / this.tilesH) * r.height;
      const b = { x0: cx - w / 2, x1: cx + w / 2, y0: p.minor ? cy - h / 2 : cy - h, y1: p.minor ? cy + h / 2 : cy };
      if (p.minor && (b.x0 < 0 || b.x1 > r.width || b.y0 < 0 || b.y1 > r.height || boxes.some((q) => b.x0 < q.x1 + 2 && b.x1 > q.x0 - 2 && b.y0 < q.y1 + 1 && b.y1 > q.y0 - 1))) { el.style.display = 'none'; continue; }
      boxes.push(b);
    }
  }
  /** 大地图尺寸有 0.18 秒的过渡动画，等它走完再按最终尺寸排名字；窗口大小变了也重排 */
  private scheduleLayout() { window.clearTimeout(this.layoutTimer); if (this.mapBig) this.layoutTimer = window.setTimeout(() => this.layoutBig(), 230); }
  /**
   * 小地图：只显示玩家周围的一小块（以玩家为中心，3 像素 = 1 格，约 65 格 × 50 格 = 160 米 × 125 米），红点永远在正中；
   * 大地图：整张校园，红点在它实际的位置上。
   */
  setPlayerOnMap(tx: number, ty: number) {
    const dot = $('minimap-dot'), mm = $('minimap'), img = $('minimap-img');
    const pad = this.mapBig ? 8 : 4, w = mm.clientWidth - pad * 2, h = mm.clientHeight - pad * 2;
    if (this.mapBig) {
      if (this.mmMode !== 'big') {
        this.mmMode = 'big'; this.mmKey = '';
        img.style.backgroundSize = '100% 100%'; img.style.backgroundPosition = 'center';
        for (const p of this.poiEls) { p.el.style.display = p.minor ? 'none' : ''; p.el.style.left = `${(p.x / this.tilesW) * 100}%`; p.el.style.top = `${(p.y / this.tilesH) * 100}%`; }
        this.scheduleLayout();
      }
      dot.style.left = `${pad + (tx / this.tilesW) * w}px`; dot.style.top = `${pad + (ty / this.tilesH) * h}px`;
      return;
    }
    const S = Hud.MM_PX, ox = Math.round(w / 2 - tx * S), oy = Math.round(h / 2 - ty * S);
    if (this.mmMode !== 'local') { this.mmMode = 'local'; this.mmKey = ''; img.style.backgroundSize = `${this.tilesW * S}px ${this.tilesH * S}px`; }
    const key = `${ox},${oy}`;
    if (key !== this.mmKey) { // 走出一格才更新：背景位置 + 窗口内的地名
      this.mmKey = key;
      img.style.backgroundPosition = `${ox}px ${oy}px`;
      for (const p of this.poiEls) {
        if (p.minor) { p.el.style.display = 'none'; continue; }
        const px = pad + ox + p.x * S, py = pad + oy + p.y * S, inside = px > pad + 24 && px < pad + w - 24 && py > pad + 10 && py < pad + h - 4;
        p.el.style.display = inside ? 'block' : 'none';
        if (inside) { p.el.style.left = `${px}px`; p.el.style.top = `${py}px`; }
      }
    }
    dot.style.left = `${pad + w / 2}px`; dot.style.top = `${pad + h / 2}px`;
  }
  /** 打开/关闭"点地图传送"（只有管理员会设置；服务器仍会检查权限） */
  setMapPicker(fn: ((tx: number, ty: number) => void) | null) {
    this.onMapPick = fn;
    const mm = $('minimap');
    mm.classList.toggle('pick', !!fn);
    if (fn && !mm.querySelector('.pick-hint')) { const h = document.createElement('div'); h.className = 'pick-hint'; h.textContent = '管理员：点击地图上任意位置传送'; mm.appendChild(h); mm.addEventListener('click', (e) => this.mapClick(e)); }
  }
  private mapClick(e: MouseEvent) {
    if (!this.onMapPick || !this.mapBig) return;
    const r = $('minimap-img').getBoundingClientRect();
    const fx = (e.clientX - r.left) / r.width, fy = (e.clientY - r.top) / r.height;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
    this.onMapPick(fx * this.tilesW, fy * this.tilesH);
  }
  showMinimap(v: boolean) { $('minimap').style.display = v ? '' : 'none'; }
  toggleMap() { this.mapBig = !this.mapBig; this.mmMode = ''; $('minimap').classList.toggle('big', this.mapBig); }
  get mapOpen() { return this.mapBig; }
}
