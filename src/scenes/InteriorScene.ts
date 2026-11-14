import Phaser from 'phaser';
import { WorldMap } from '@/world/WorldMap';
import { Player, Character } from '@/entities/Player';
import { Npc } from '@/entities/Npc';
import { Hud } from '@/ui/Hud';
import { TILE, ZOOMS } from '@/core/const';
import { standNear } from '@/shared/teleport';
import { enterFloor } from './world/transitions';
import type { WorldScene } from './WorldScene';
import type { TeleportPanel } from '@/ui/TeleportPanel';
import type { NetClient } from '@/net/client';
import type { DormPanel } from '@/ui/DormPanel';
import type { ChatPanel } from '@/ui/ChatPanel';
import type { Profile } from '@/shared/profile';
import { AC_NAMES, dormInteriorId, dormInteriorLevel, isDormInterior, roomTitle } from '@/shared/dorm';
import { ensureSkin, skinTextureKey } from '@/systems/dormskin';
import { RemotePlayer } from '@/entities/RemotePlayer';
import { BathFx } from '@/systems/bathfx';
import { DecorEditor } from '@/systems/decoredit';
import { addDecorImage, spotOf } from '@/systems/decorview';
import { topRaise } from '@/shared/decor';
import { decorDef, defaultLay, footOf, seatsOf, type Placed } from '@/shared/decor';
import type { BathView } from '@/shared/dorm';
import { packFlags, type RoomWho, type ServerMsg } from '@/shared/protocol';
import { festData } from '@/ui/festivalData';
import { emoteDef } from '@/shared/emotes';
import type { EmotePanel } from '@/ui/EmotePanel';
import { Cat } from '@/entities/Cat';
import { CAT_REACH, type CatDef } from '@/shared/cats';
import { bedSpots, dormCatHome, type CatBridge, type DormCatFx } from '@/systems/dormcats';
import { FARM_INTERIOR, FARM_PLOTS, cropDef, growthText, plotStage } from '@/shared/farming';
import type { FarmPanel } from '@/ui/FarmPanel';
import type { ShopPanel } from '@/ui/ShopPanel';

/** 翻好的土有 3 张略有差异的图：按地块散开用，16 块排在一起才不像同一张图盖了 16 次 */
const TILLED_FRAMES = ['state_tilled', 'state_tilled_b', 'state_tilled_c'] as const;

export interface InteriorDef {
  id: string; name: string; w: number; h: number; bg: string; desc?: string;
  labels?: { text: string; x: number; y: number; size?: number; color?: string }[];
  interacts?: { x0: number; x1: number; y0: number; y1: number; title: string; text: string; act?: 'bed' | 'ac' | 'wardrobe' | 'chest' | 'sign' | 'bath' }[];
  collision: string[];
  objects: { k: string; x: number; y: number; depth: number }[];
  npcs: { look: number; x: number; y: number; name: string; facing?: 'down' | 'up' | 'left' | 'right'; lines: string[]; shop?: 'farm' }[];
  /** 南墙门洞（回校园）；多层建筑的二层以上没有，只能走楼梯 */
  exit?: { x: number; w: number }; spawn: { x: number; y: number };
  floor?: number; building?: string;
  /** 能坐的座位（像素）：bx,by = 椅面中心，x,y = 坐下时人的位置 */
  seats?: { x: number; y: number; bx: number; by: number }[];
  /** 楼梯口：x0..y1 = 互动区（像素），land = 从别的楼层走过来时人落的位置（格），label = 提示里的「上二楼」 */
  stairs?: { dir: 'up' | 'down'; to: string; label: string; x0: number; x1: number; y0: number; y1: number; land: { x: number; y: number } }[];
}

/** 室内：整张背景图 + 家具精灵（可前后遮挡）+ 静态 NPC；走出南侧门洞回到校园。id = 'dorm' 时是「我的宿舍」：床/空调/衣柜/宝箱可以互动，公屏照常能看能说。 */
export class InteriorScene extends Phaser.Scene {
  private hud!: Hud;
  private def!: InteriorDef;
  private map!: WorldMap;
  private player!: Player;
  private npcs: Npc[] = [];
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'shift' | 'e' | 'space' | 'esc' | 'enter' | 'y' | 'x', Phaser.Input.Keyboard.Key>;
  private leaving = false;
  /** 从哪一层走楼梯过来的（落在对应楼梯口旁边）；从校园进来 / 传送进来时没有 */
  private fromId?: string;
  /** 从大树洞钻进来的：进场淡入换成「从黑暗里慢慢亮起一层暖光」 */
  private treeArrive = false;
  // ---- 家具摆放（装修）：宿舍里除了床/衣柜/宝箱/浴缸，其余家具都来自摆放数据，客户端按它现画
  private lay: Placed[] = []; private layKey = ''; private decorObjs: Phaser.GameObjects.Image[] = []; private decorTalk: NonNullable<InteriorDef['interacts']> = [];
  private level = 0; private skinNow = { w: -1, f: -1 }; private skinImgs: Phaser.GameObjects.Image[] = []; private skinSeq = 0;
  private baseCollision: string[] = []; private editor?: DecorEditor; private decorBtn?: HTMLButtonElement; private likeBtn?: HTMLButtonElement; private prevLikes?: NetClient['handlers']['dormLikes'];
  private talking: Npc | null = null;
  // ---- 宿舍（id === 'dorm'）
  private dorm = false;
  private net?: NetClient; private dormUi?: DormPanel; private chat?: ChatPanel; private chatFocus: (() => void) | null = null;
  private selfId = 0; private seenProfile: Profile | undefined;
  private acMode = 0; private acVent = { x: 0, y: 0 }; private acLed?: Phaser.GameObjects.Rectangle; private acLabel?: Phaser.GameObjects.Text; private acTimer?: Phaser.Time.TimerEvent;
  private sleeping = false; private sleepPending = false;
  private sleeper?: Phaser.GameObjects.Sprite; private cover?: Phaser.GameObjects.Image; private dim?: Phaser.GameObjects.Rectangle; private zzTimer?: Phaser.Time.TimerEvent;
  private bed: { px: number; py: number; wx: number; wy: number; depth: number } | null = null;
  private prevFindSeat?: typeof RemotePlayer.findSeat; private hasAc = false; private seats: { x: number; y: number; bx: number; by: number }[] = []; private sitting = false;
  // ---- 做客：visit = 我是访客（房主不是我）；remotes = 屋里的其他人（房主或访客）
  private visit: Extract<ServerMsg, { t: 'dorm_visit' }> | null = null;
  private remotes = new Map<number, RemotePlayer>();
  private hostName = ''; private titleRaw = ''; private signText?: Phaser.GameObjects.Text; private signAt = { x: 0, y: 0 };
  private prevEmote?: NetClient['handlers']['emote']; private prevEmoteEnd?: NetClient['handlers']['emoteEnd']; private heldPoseId = -1;
  private prevFz?: NetClient['handlers']['fz']; private prevHeld?: NetClient['handlers']['held']; private unFest?: () => void;
  /** 养在宿舍的小猫（房主养的；房主自己能摸 / 喂 / 抱，访客只能看）：猫编号 → 宿舍里的那只 Cat */
  private dormCats = new Map<number, Cat>(); private catBridge?: CatBridge; private peersBefore: Cat[] = []; private heldCats = new Set<number>(); private catCrouch = false; private catShift = false; private bnd = { x: 0, y: 0, w: 0, h: 0 };
  private sleepWho?: Character; private rt = { t: 0, x: -1, y: -1, f: -1 };
  // ---- 农场（id === 'farm'）：一块独立空间，每块地分「土壤层」（荒草地 / 翻好的深色土）+「作物层」（嫩芽/成熟）两层按状态换图
  private farm = false;
  private farmData: Extract<ServerMsg, { t: 'farm' }> | null = null;
  private farmCells: Phaser.GameObjects.Image[] = [];
  private farmCrops: Phaser.GameObjects.Image[] = [];
  private farmAt: { x: number; y: number; w: number; h: number }[] = [];
  private prevFarmHandler?: NetClient['handlers']['farm'];
  /** 刚和商店老板聊完的时间点：4 秒内再按 E 直接开柜台，不然又是重新聊一遍 */
  private chatUntil = 0;
  /** 已经播过「农场管理员提醒」了（每次进屋只提醒一次） */
  private farmTold = false;
  /** 我是不是房主（自己的宿舍） */
  private get isHost() { return !this.visit; }
  /** 手机：摇杆/互动键是校园场景创建的 DOM 控件（共用），这里读它的状态；互动键按下记在 registry 的 touchPress 里 */
  private touchState() { return (this.registry.get('touchUi') as (() => { state: { x: number; y: number; run: boolean } } | undefined) | undefined)?.()?.state; }
  private takeTouchPress() { const p = !!this.registry.get('touchPress'); if (p) this.registry.set('touchPress', false); return p; }
  constructor() { super('Interior'); }

  init(data: { id: string; from?: string; treeArrive?: boolean }) { this.registry.set('interiorId', data.id); this.fromId = data.from; this.treeArrive = data.treeArrive ?? false; this.leaving = false; this.sitting = false; this.seats = []; this.layKey = ''; this.lay = []; this.decorObjs = []; this.decorTalk = []; this.skinNow = { w: -1, f: -1 }; this.skinImgs = []; this.skinSeq++; this.farm = false; this.farmData = null; this.farmCells = []; this.farmCrops = []; this.farmAt = []; this.farmTold = false; }

  create() {
    this.hud = this.registry.get('hud') as Hud;
    const id = this.registry.get('interiorId') as string;
    const defs = this.cache.json.get('interiors') as InteriorDef[];
    this.def = defs.find((d) => d.id === id)!;
    const d = this.def;
    this.map = new WorldMap({ width: d.w, height: d.h, collision: d.collision });
    this.baseCollision = d.collision.slice();
    this.cameras.main.setBackgroundColor('#17110d');
    if (!isDormInterior(d.id)) this.add.image(0, 0, d.bg).setOrigin(0).setDepth(-1); // 宿舍的底图是墙纸 + 地板两层，按玩家选的样式在 setupDorm 里加载
    for (const o of d.objects) this.add.image(o.x, o.y, 'furniture', o.k).setOrigin(0).setDepth(o.depth);
    for (const l of d.labels ?? []) this.add.text(l.x * TILE, l.y * TILE, l.text, { fontFamily: 'ArkPixel', fontSize: `${l.size ?? 10}px`, color: l.color ?? '#2a2a33' }).setOrigin(0.5).setDepth(9000); // 文字牌要压在家具上面（家具的层级 = 它的底边像素，比 5 大得多，之前文字被横幅/字画盖住了）
    this.npcs = d.npcs.map((n) => new Npc(this, n.x * TILE, n.y * TILE, n.look, n.name, n.lines, d.id === FARM_INTERIOR, n.facing ?? 'down')); // 农场管理员会在田边溜达，其他 NPC 站着不动
    this.dorm = isDormInterior(d.id); this.level = dormInteriorLevel(d.id); this.farm = d.id === FARM_INTERIOR;
    this.visit = this.dorm ? ((this.registry.get('dormVisit') as Extract<ServerMsg, { t: 'dorm_visit' }> | null | undefined) ?? null) : null;
    const me = this.registry.get('profile') as Profile | undefined; this.seenProfile = me;
    const sp = (this.fromId && d.stairs?.find((t) => t.to === this.fromId)?.land) || d.spawn; // 走楼梯过来：落在通向来处的那个楼梯口旁边
    this.seats = d.seats ? d.seats.slice() : []; // 数据里的椅子 / 沙发（宿舍的座位来自摆放数据，setLay 里会覆盖）
    this.player = new Player(this, sp.x * TILE, sp.y * TILE, me ? me.look : 0, me?.app); // 所有室内都是你自己的样子（换装后也跟着变）；之前只有宿舍这样，进餐厅 / 教学楼会变回默认造型
    Character.umbrella = false; // 屋里不打伞（外面下雨时，校园场景每帧会把它设回去，所以这里只管室内）
    this.player.facing = 'up'; this.player.sprite.setFrame('c0_up_0');
    this.player.setFz(festData.on); // 自己戴着的节日装扮：室内也要显示

    const cam = this.cameras.main;
    cam.startFollow(this.player.sprite, true, 0.15, 0.15);
    cam.roundPixels = true;
    this.applyZoom();
    this.scale.on('resize', this.applyZoom, this);
    this.events.once('shutdown', () => this.scale.off('resize', this.applyZoom, this));

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({ up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D, shift: K.SHIFT, e: K.E, space: K.SPACE, esc: K.ESC, enter: K.ENTER, y: K.Y, x: K.X }) as any;
    this.registry.set('touchPress', false); // 进门那一下的互动键别算在室内里
    if (this.treeArrive) cam.fadeIn(760, 250, 243, 214); // 树洞钻进来：从全黑里慢慢亮起一层暖光（呼应剧情里「洞里浮着暖光」）——比正常进屋慢，像眼睛适应黑暗
    else cam.fadeIn(280, 20, 14, 10);
    this.hud.showMinimap(false);
    this.hud.banner(d.name, d.desc ?? '走到南侧门口即可离开');
    if (this.dorm) this.setupDorm();
    if (this.farm) this.setupFarm();
  }

  // ------------------------------------------------------------ 宿舍
  private setupDorm() {
    this.net = this.registry.get('net') as NetClient | undefined;
    this.dormUi = this.registry.get('dormUi') as DormPanel | undefined;
    this.chat = this.registry.get('chat') as ChatPanel | undefined;
    this.selfId = this.net?.selfId ?? 0;
    if (this.net) this.net.handlers.dormOut = (msg) => { if (msg) this.hud.banner('🏠 宿舍', msg); this.leaveForced(); }; // 在屋里被传走（传送/房主离开…）：直接离开室内，人留在新位置
    if (this.chat) { this.chatFocus = this.chat.onFocus; this.chat.onFocus = () => { this.input.keyboard!.resetKeys(); this.chatFocus?.(); }; } // 公屏：宿舍里也能看、能说
    // 床、空调、鱼缸、门牌都是可以挪的家具：位置来自摆放数据，在 setLay 里绑定（rebindFixtures）
    { const sk = this.visit ? this.visit.sk : this.dormUi?.data?.sk; this.setSkin(sk?.w ?? 0, sk?.f ?? 0); }
    this.setLay(this.visit ? (this.visit.lay ?? defaultLay(this.level)) : (this.dormUi?.data?.lay ?? defaultLay(this.level))); // 房里的家具摆放：访客用房主的，自己用自己的（数据还没来就先用默认布局）
    this.hostName = this.visit?.hostName ?? ((this.registry.get('profile') as Profile | undefined)?.name ?? '');
    if (this.visit) { // 我是访客：屋里的状态来自房主（空调、门牌、房主睡没睡），屋里已有的人也要画出来
      this.setTitle(this.visit.title); this.setAc(this.visit.ac); this.setBath(this.visit.bv);
      for (const w of this.visit.roster) this.addRemote(w);
      if (this.visit.sleeping) this.showSleeper(this.hostChar());
      this.hud.banner(`🏠 ${roomTitle(this.visit.title, this.visit.hostName, false)}`, `${this.visit.hostName} 的宿舍 · 走到南侧门口即可离开`);
    }
    if (this.net) {
      const h = this.net.handlers;
      h.roomJoin = (w) => { this.addRemote(w); if (this.editor?.active) { this.editor.close(); this.hud.banner('🛋 装修', `${w.p.name} 进来了，装修先停一下`); } };
      h.roomLeave = (id) => this.removeRemote(id);
      this.prevEmote = h.emote; this.prevEmoteEnd = h.emoteEnd;   // 屋里的表情（自己的和同屋人的）：校园场景的处理函数管的是校园里的人，这里自己接
      h.emote = (pid, e) => { const d = emoteDef(e); if (!d) return; if (pid === this.selfId) this.player.emote(d); else this.remotes.get(pid)?.emote(d); };
      h.emoteEnd = (pid) => { if (pid === this.selfId) this.player.endPose(); else this.remotes.get(pid)?.endPose(); };
      this.prevFz = h.fz; this.prevHeld = h.held;
      h.fz = (pid, c) => this.remotes.get(pid)?.setFz(c);          // 屋里别人换了节日装扮 / 手持物：校园场景的处理函数管的是校园里的人，这里自己接
      h.held = (pid, hv) => this.remotes.get(pid)?.setHeld(hv);
      this.unFest = festData.subscribe(() => this.player.setFz(festData.on));
      h.roomPos = (id, x, y, f) => { if (id === this.selfId) { this.player.x = x; this.player.y = y; return; } this.remotes.get(id)?.push(x, y, f, performance.now()); }; // 发给自己的 = 被服务器拉回
      h.roomState = (m) => {
        this.setTitle(m.title); this.setAc(m.ac); this.setBath(m.bv); if (!this.isHost) this.setSkin(m.sk?.w ?? 0, m.sk?.f ?? 0);
        if (!this.isHost) { if (m.sleeping) this.showSleeper(this.hostChar()); else if (this.sleepWho && this.sleepWho !== this.player) this.hideSleeper(); } // 房主自己的睡觉由本地按钮流程驱动
      };
    }
    this.registry.set('roomSay', (pid: number, text: string) => { if (pid === this.selfId) this.player.say(text); else this.remotes.get(pid)?.say(text); }); // 公屏的话冒泡在人头上
    if (this.dormUi) {
      this.dormUi.onData = (m) => { if (this.isHost) { this.setAc(m.ac); this.setTitle(m.title ?? ''); this.setBath(m.bv); this.setSkin(m.sk?.w ?? 0, m.sk?.f ?? 0); if ((m.rm ?? 0) !== this.level) { this.expandTo(m.rm ?? 0); return; } this.setLay(m.lay ?? defaultLay(this.level)); this.syncDormCats(m.dc ?? []); this.editor?.refresh(); } };
      this.dormUi.onResult = (ok, msg, wake) => {
        this.hud.banner(ok ? '🏠 宿舍' : '⚠️ 宿舍', msg);
        if (this.sleepPending) { this.sleepPending = false; if (ok) this.beginSleep(); }
        if (wake && this.sleeping) this.endSleep(false);
      };
      if (this.isHost) { if (this.dormUi.data) { this.setAc(this.dormUi.data.ac); this.setTitle(this.dormUi.data.title ?? ''); this.setBath(this.dormUi.data.bv); } else this.net?.dormGet(); }
    }
    this.prevFindSeat = RemotePlayer.findSeat; RemotePlayer.findSeat = (x, y) => { const t = this.seats.find((q) => Math.hypot(q.x - x, q.y - y) < 6); return t ? { bx: t.bx, by: t.by, strip: false } : undefined; }; // 屋里别人坐在哪把椅子上
    if (this.isHost && this.net) this.setupDecorUi(this.net);
    if (this.visit && this.net) this.setupLikeUi(this.net, this.visit);
    this.catBridge = this.registry.get('catBridge') as CatBridge | undefined;
    if (this.catBridge) { // 养在宿舍的猫：Cat 的同伴列表换成宿舍里的（校园里的猫在睡觉，不参与）；校园场景收到互动结果时转发过来
      this.peersBefore = Cat.peers; Cat.peers = [];
      this.registry.set('dormCatFx', ((id, kind, r) => this.dormCatFx(id, kind, r)) as DormCatFx);
      this.syncDormCats(this.visit ? this.visit.dc ?? [] : this.dormUi?.data?.dc ?? []);
    }
    this.events.once('shutdown', () => { // 每一步单独兜底：这里任何一步抛错，Phaser 会放弃后面排队的"唤醒校园场景"，人就卡在黑屏里
      const safe = (f: () => void) => { try { f(); } catch (e) { console.warn('宿舍场景收尾出错（已忽略）', e); } };
      safe(() => { this.registry.set('roomSay', null); this.registry.set('dormVisit', null); });
      safe(() => { if (this.net) { const h = this.net.handlers; h.roomJoin = h.roomLeave = h.roomPos = h.roomState = undefined; h.fz = this.prevFz; h.held = this.prevHeld; h.emote = this.prevEmote; h.emoteEnd = this.prevEmoteEnd; } });
      safe(() => { this.unFest?.(); this.unFest = undefined; });
      safe(() => this.dormUi?.closeSign());
      safe(() => this.clearRemotes());
      safe(() => { this.clearDormCats(); this.registry.set('dormCatFx', null); Cat.peers = this.peersBefore; });
      safe(() => { if (this.chat && this.chatFocus) this.chat.onFocus = this.chatFocus; });
      safe(() => { if (this.net) this.net.handlers.dormOut = undefined; });
      safe(() => { if (this.dormUi) { this.dormUi.onData = () => {}; this.dormUi.onResult = () => {}; this.dormUi.close(); this.dormUi.closeChest(); } });
      safe(() => { this.acTimer?.remove(); this.zzTimer?.remove(); });
      safe(() => { RemotePlayer.findSeat = this.prevFindSeat; this.sitting = false; });
      safe(() => { this.editor?.destroy(); this.editor = undefined; this.decorBtn?.remove(); this.decorBtn = undefined; this.likeBtn?.remove(); this.likeBtn = undefined; });
      safe(() => { if (this.net) this.net.handlers.dormLikes = this.prevLikes; });
    });
  }
  // ------------------------------------------------------------ 农场
  /** 农场：16 块地（4×4 格子）由状态 tile 盖出来——每块地一层土壤 32×32（草地/深色土）+ 一层作物 32×40（向上长），向服务器要自己的田 */
  private setupFarm() {
    this.net = this.registry.get('net') as NetClient | undefined;
    this.farmAt = FARM_PLOTS.map((p) => ({ x: p.x * TILE, y: p.y * TILE, w: p.w * TILE, h: p.h * TILE }));
    for (const a of this.farmAt) {
      const cx = a.x + a.w / 2, cy = a.y + a.h / 2;
      const soil = this.add.image(cx, cy, 'farmTiles', 'state_grass');
      soil.setDepth(-0.5); // 土壤是地面装饰，永远压在底图之上、所有人和作物之下：走到地里不会被人被土块盖掉
      this.farmCells.push(soil);
      const crop = this.add.image(cx, a.y + a.h - 20, 'farmTiles', 'state_sprout0').setAlpha(0); // 作物图 32×40：底边贴地块底边，只向上占用格子间的空隙
      crop.setDepth(a.y + a.h + 0.2); // 作物层盖在土上；层级按地块底边：站在地块南侧时人画在作物前面
      this.farmCrops.push(crop);
    }
    for (const n of this.npcs) n.box = { x0: 168, y0: 226, x1: 356, y1: 300 }; // 管理员在田南侧的田埂上溜达，不走进田里 / 墙里
    if (this.net) {
      const h = this.net.handlers;
      this.prevFarmHandler = h.farm;
      h.farm = (m) => { this.prevFarmHandler?.(m); this.applyFarm(m); }; // 面板也要这份数据：串在它前面
      this.events.once('shutdown', () => { if (this.net) this.net.handlers.farm = this.prevFarmHandler; });
      this.net.getFarm();
    }
  }
  /** 服务器下发的农场数据 → 每块地盖什么：土壤层（翻过=深色土，没翻=草地），作物层（嫩芽 4 阶段 → 成熟；今天浇过水偏冷色） */
  private applyFarm(m: Extract<ServerMsg, { t: 'farm' }>) {
    if (!m.mine) return; // 农场里只画自己的地（看好友的田在面板「访客」页）
    this.farmData = m;
    FARM_PLOTS.forEach((p, slot) => {
      const soil = this.farmCells[slot], crop = this.farmCrops[slot];
      if (!soil || !crop) return;
      const plot = m.plots[slot];
      const def = cropDef(plot.c);
      const stage = plotStage(plot, m.today);
      // 土壤层：种着东西或翻过 = 深色土（3 张图按地块散开用）；荒地 = 草地
      soil.setFrame(plot.c || plot.t ? TILLED_FRAMES[(slot * 2 + Math.floor(slot / 4)) % TILLED_FRAMES.length] : 'state_grass').setAlpha(1);
      if (!plot.c) { crop.setAlpha(0); return; } // 空地没有作物层
      const frame = stage === 'ripe'
        ? `state_mature_${plot.c.replace(/^crop_/, '')}`
        : `state_sprout${Math.min(3, Math.floor((plot.w / Math.max(1, def!.days)) * 4))}`;
      crop.setFrame(frame).setAlpha(1).setTint(plot.wd === m.today ? 0xbfe6ff : 0xffffff);
    });
    if (!this.farmTold) { // 进屋第一次拿到田里的数据：管理员先把「该浇水 / 该收了」说一遍
      this.farmTold = true;
      const advice = this.farmAdvice();
      if (advice) this.hud.banner('农场管理员', advice);
    }
  }
  /** 农场管理员的一句提醒：几块地能收、几块等着浇水、几块还没翻（都没事就返回空串） */
  private farmAdvice(): string {
    const m = this.farmData;
    if (!m) return '';
    let ripe = 0, thirsty = 0, wild = 0;
    for (const p of m.plots) {
      const st = plotStage(p, m.today);
      if (st === 'ripe') ripe++;
      else if (st === 'growing') { if (p.wd !== m.today) thirsty++; }
      else if (!p.t) wild++;
    }
    return [
      ripe ? `${ripe} 块地能收了` : '',
      thirsty ? `${thirsty} 块地还等着浇水` : '',
      wild ? `${wild} 块荒地没翻` : '',
    ].filter(Boolean).join('，');
  }
  /** 站在哪块地边上（地块外扩 10px = 贴着地边也能按 E；相邻地块的判定区会重叠，取中心最近的那块） */
  private farmPlotAt(): number {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.farmAt.length; i++) {
      const a = this.farmAt[i];
      if (this.player.x < a.x - 10 || this.player.x > a.x + a.w + 10 || this.player.y < a.y - 10 || this.player.y > a.y + a.h + 10) continue;
      const dd = Math.hypot(a.x + a.w / 2 - this.player.x, a.y + a.h / 2 - this.player.y);
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  }
  private farmUi() { return this.registry.get('farmUi') as FarmPanel | undefined; }
  private shopUi() { return this.registry.get('shopUi') as ShopPanel | undefined; }
  /** 这个 NPC 是不是商店老板（数据里带 shop 字段）：是的话按 E 直接开商店，不弹普通对话框 */
  private npcShop(n: Npc) { return this.def.npcs[this.npcs.indexOf(n)]?.shop; }

  // ---- 宿舍里养的猫
  /** 让宿舍里的猫和 ids 一致：多出来的（送回校园了）去掉，新来的画出来 */
  private syncDormCats(ids: readonly number[]) {
    if (!this.catBridge) return;
    for (const [id, c] of this.dormCats) if (!ids.includes(id)) { c.destroy(); this.dormCats.delete(id); this.heldCats.delete(id); }
    for (const id of ids) {
      if (this.dormCats.has(id)) continue;
      const def = this.catBridge.def(id); if (!def) continue;
      const cat = new Cat(this, { ...def }); cat.nick = this.catBridge.nick(id); this.dormCats.set(id, cat);
    }
    Cat.peers = [...this.dormCats.values()];
    this.homeDormCats();
  }
  /** 按猫窝的位置给每只猫分家（猫窝挪了 / 收回了也跟着变）；新来的猫直接站到家里 */
  private homeDormCats() {
    if (!this.dormCats.size) return;
    const beds = bedSpots(this.lay), fb = standNear((px, py) => this.map.boxBlocked(px, py), this.def.w * 8, 6 * 16, 96) ?? { x: this.def.w * 8, y: 7 * 16 };
    let i = 0;
    for (const cat of this.dormCats.values()) {
      const h = dormCatHome(i++, beds, fb), d = cat.def as CatDef;
      const fresh = d.hx === 0 && d.hy === 0 ? true : cat.x === d.hx && cat.y === d.hy;
      d.hx = h.x; d.hy = h.y; cat.restSpot = h.bed ? { x: h.x, y: h.y } : undefined;
      if (fresh || this.map.boxBlocked(cat.x, cat.y)) { cat.x = h.x; cat.y = h.y; }
    }
  }
  private clearDormCats() { for (const c of this.dormCats.values()) { try { c.destroy(); } catch { /* 关闭阶段，忽略 */ } } this.dormCats.clear(); this.heldCats.clear(); }
  /** 每帧：宿舍里的猫自己活动；小猫面板开着时那只猫原地待着、玩家蹲下 */
  private updateDormCats(dt: number) {
    if (!this.dormCats.size) return;
    const P = this.player, v = { x: P.x, y: P.y, fast: P.running, still: !P.moving, sitting: this.sitting, fishing: false };
    const pn = this.catBridge?.panel(), openId = pn?.isOpen ? pn.id : undefined;
    for (const [id, cat] of this.dormCats) {
      const want = openId === id;
      if (want !== this.heldCats.has(id)) { cat.hold(want, P.x); if (want) this.heldCats.add(id); else this.heldCats.delete(id); }
      cat.update(dt, this.map, v, this.catBridge?.aff(id) ?? 0, null);
    }
    { // 小猫面板在屏幕下方：镜头往上挪一点，别让面板盖住人和猫（和校园场景一个思路）
      const root = openId !== undefined ? document.querySelector('.cat-panel') as HTMLElement | null : null, cam = this.cameras.main;
      if (root) { // 目标：人落在面板上沿以上约 100 像素处；房间本来正好占满镜头范围，所以把范围往下多放一块（200 像素），镜头才挪得动
        const r = root.getBoundingClientRect(), z = cam.zoom || 1, want = r.top - 100, up = Math.max(0, window.innerHeight / 2 - want) / z;
        cam.setBounds(this.bnd.x, this.bnd.y, this.bnd.w, this.bnd.h + 200); cam.setFollowOffset(0, -up); this.catShift = true;
      }
      else if (this.catShift) { cam.setFollowOffset(0, 0); cam.setBounds(this.bnd.x, this.bnd.y, this.bnd.w, this.bnd.h); this.catShift = false; }
    }
    const crouch = openId !== undefined && this.dormCats.has(openId) && !this.sitting && !this.sleeping;
    if (crouch !== this.catCrouch) { this.catCrouch = crouch; P.setCrouch(crouch); }
  }
  private dormCatFx(id: number, kind: 'pet' | 'feed' | 'hug', r: { ok: boolean; loved?: boolean; leveled?: boolean; gift?: boolean }) {
    const c = this.dormCats.get(id); if (!c || !r.ok) return;
    if (kind === 'pet') c.pet(); else if (kind === 'hug') c.hug(this.player.x, this.player.y); else c.eat();
    if (r.loved) c.loved(); if (r.leveled) c.leveledUp(); if (r.gift) c.giftMeow();
  }
  /** 走近宿舍里的猫按 E：房主打开小猫面板；访客只能看（好感度、喂食都是房主自己的事） */
  private touchDormCat(cat: Cat) {
    if (this.isHost) { this.catBridge?.open(cat.def.id); return; }
    this.hud.openDialog(cat.label, [`${cat.def.name}是${this.hostName}养在宿舍里的猫，睡在猫窝里。`, '只有房主能摸它、喂它。']);
  }

  /** 回校园：先清掉屋里的人，再关室内、唤醒校园场景；万一唤醒没成功（关闭阶段抛了别的错），1.5 秒后兜底再唤醒一次，绝不让人卡在黑屏里 */
  private backToWorld() {
    const mgr = this.scene.manager;
    this.clearRemotes(); this.hud.showMinimap(true);
    const floor = this.afterFloor; this.afterFloor = undefined;
    this.scene.stop('Interior'); this.scene.wake('World');
    if (floor) window.setTimeout(() => { try { const w = mgr.getScene('World') as WorldScene | null; if (w && w.sys.isActive()) enterFloor(w, floor); } catch { /* 忽略 */ } }, 450); // 等校园场景淡入完再进那一层
    window.setTimeout(() => { try { const w = mgr.getScene('World'); if (w && w.sys.isSleeping() && !mgr.isActive('Interior')) mgr.wake('World'); } catch { /* 忽略 */ } }, 1500);
  }
  /** 把屋里其他人的画面都销毁（要在场景还活着的时候调；关闭阶段 tweens 等插件已经没了） */
  private clearRemotes() { for (const r of this.remotes.values()) { try { r.destroy(); } catch (e) { console.warn('销毁屋里的人出错（已忽略）', e); } } this.remotes.clear(); this.sleepWho = undefined; }

  /** 空调：0 关 / 1 制冷 / 2 制热。状态灯换色，出风口持续飘出冷风（蓝白风丝+雪点）或暖风（橙色热气） */
  private bathFx?: BathFx; private bathView?: BathView;
  private setBath(v: BathView | undefined) { this.bathView = v; this.bathFx?.set(v); }
  private setAc(mode: number) {
    if (mode === this.acMode && (this.acTimer || !mode)) return;
    this.acMode = mode;
    this.acTimer?.remove(); this.acTimer = undefined;
    if (!this.hasAc) return; // 空调现在不在墙上（被收回了）：只记着状态
    this.acLed?.setFillStyle(mode === 1 ? 0x58d0ff : mode === 2 ? 0xff8a3a : 0x3f9a58);
    this.acLabel?.destroy(); this.acLabel = undefined;
    if (!mode) return;
    const cool = mode === 1;
    this.acLabel = this.add.text(this.acVent.x, this.acVent.y + 5, cool ? '制冷 24℃' : '制热 28℃', { fontFamily: 'ArkPixel', fontSize: '10px', color: cool ? '#bfeaff' : '#ffd9a0', stroke: '#1a2438', strokeThickness: 3 }).setOrigin(0.5, 0).setDepth(9002);
    this.acTimer = this.time.addEvent({ delay: mode === 1 ? 120 : 160, loop: true, callback: () => this.blow() });
  }
  private blow() {
    const { x, y } = this.acVent, cool = this.acMode === 1, r = Phaser.Math.Between;
    const px = x + r(-14, 14);
    if (cool) {
      const streak = this.add.rectangle(px, y + 2, 2, r(9, 15), r(0, 2) ? 0xbfe8ff : 0xffffff, 0.9).setDepth(9000);
      this.tweens.add({ targets: streak, y: y + r(26, 48), x: px + r(-5, 5), alpha: 0, duration: r(900, 1500), onComplete: () => streak.destroy() });
      if (r(0, 2) === 0) { // 时不时一点雪花
        const flake = this.add.rectangle(px, y + 4, 3, 3, 0xffffff, 1).setDepth(9000);
        this.tweens.add({ targets: flake, y: y + r(34, 56), x: px + r(-12, 12), alpha: 0, angle: 90, duration: r(1400, 2000), onComplete: () => flake.destroy() });
      }
    } else {
      const wave = this.add.rectangle(px, y + 3, r(8, 14), 3, r(0, 1) ? 0xff9a3a : 0xffd27a, 0.8).setDepth(9000);
      this.tweens.add({ targets: wave, y: y + r(24, 42), alpha: 0, scaleX: 1.6, duration: r(1000, 1600), onComplete: () => wave.destroy() });
      this.tweens.add({ targets: wave, x: { from: px - 3, to: px + 3 }, duration: 300, yoyo: true, repeat: 4, ease: 'Sine.easeInOut' });
    }
  }

  // ---- 睡觉的画面：躺着的人只露出脑袋和肩膀在枕头上，盖上被子，头顶飘 💤，屋里暗下来。房主自己睡、或访客看房主睡，都画这一套
  private hostChar(): Character | undefined { for (const r of this.remotes.values()) if (r.uid === this.visit?.host) return r; return undefined; }
  private showSleeper(who: Character | undefined) {
    if (!who || this.sleepWho) return;
    this.sleepWho = who;
    const sp = who.sprite;
    who.facing = 'down';
    const tex = sp.texture.key, fr = sp.frame.name.replace(/_(up|left|right)_/, '_down_');
    const bed = this.bed; if (!bed) return;
    const pcx = bed.px + 17, pcy = bed.py + 17.5; // 枕头中心
    this.sleeper = this.add.sprite(pcx, pcy - 12 + 42, tex, fr).setOrigin(sp.originX, sp.originY).setCrop(0, 0, sp.frame.width, 26).setDepth(bed.depth + 0.5);
    this.cover = this.add.image(bed.px, bed.py, 'furniture', 'dbed_cover').setOrigin(0).setDepth(bed.depth + 1);
    sp.setVisible(false); who.tagsHidden = true;
    this.dim = this.add.rectangle(-1500, -1500, 4000, 4000, 0x0a1033, 0).setOrigin(0).setDepth(8999);
    this.tweens.add({ targets: this.dim, fillAlpha: 0.38, duration: 900 });
    this.zzTimer = this.time.addEvent({ delay: 1100, loop: true, callback: () => this.zz(pcx, pcy) });
    this.zz(pcx, pcy);
  }
  private hideSleeper() {
    const who = this.sleepWho; if (!who) return;
    this.sleepWho = undefined;
    this.zzTimer?.remove(); this.zzTimer = undefined;
    this.sleeper?.destroy(); this.sleeper = undefined; this.cover?.destroy(); this.cover = undefined;
    const dim = this.dim; this.dim = undefined; if (dim) this.tweens.add({ targets: dim, fillAlpha: 0, duration: 500, onComplete: () => dim.destroy() });
    who.sprite.setVisible(true); who.tagsHidden = false;
  }
  /** 房主上床 */
  private beginSleep() {
    if (this.sleeping) return;
    this.standUp();
    this.sleeping = true; this.hud.hint(null);
    this.player.facing = 'down'; this.player.update(0.016, 0, 0, false, this.map);
    this.showSleeper(this.player);
    this.hud.hint('任意方向键 / 点一下  起床');
  }
  private zz(cx: number, cy: number) {
    const t = this.add.text(cx + 14, cy - 12, '💤', { fontFamily: '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",ArkPixel,sans-serif', fontSize: '16px' }).setOrigin(0.5).setDepth(9001).setAlpha(0);
    this.tweens.add({ targets: t, y: cy - 46, x: cx + 24, alpha: { from: 0, to: 1 }, scale: { from: 0.8, to: 1.35 }, duration: 1900, ease: 'Sine.easeOut', yoyo: false, onComplete: () => t.destroy() });
    this.tweens.add({ targets: t, alpha: 0, delay: 1300, duration: 600 });
  }
  /** 房主起床：人站到床尾外面；tell = 要不要告诉服务器（服务器让你起床时不用再说） */
  private endSleep(tell = true) {
    if (!this.sleeping) return;
    this.sleeping = false;
    if (tell) this.net?.dormSleep(false);
    this.hideSleeper();
    const bw = this.bed ?? { wx: this.player.x, wy: this.player.y };
    const spot = standNear((px, py) => this.map.boxBlocked(px, py), bw.wx, bw.wy, 64) ?? { x: bw.wx, y: bw.wy }; // 起床站的位置要真能站（之前落在墙/垃圾桶里，人动不了）
    this.player.x = spot.x; this.player.y = spot.y; this.player.facing = 'down';
    this.player.sprite.setVisible(true); this.player.update(0.016, 0, 0, false, this.map);
    this.hud.hint(null);
  }

  // ---- 屋里的其他人（房主或访客）
  private addRemote(w: RoomWho) {
    if (w.id === this.selfId || this.remotes.has(w.id)) return;
    const r = new RemotePlayer(this, w.id, w.uid, w.p, w.x, w.y, w.flags);
    r.applyTitle(w.ttl); if (w.held) r.setHeld(w.held); if (w.fz) r.setFz(w.fz);
    this.remotes.set(w.id, r); r.setHeldPose(emoteDef(w.pose));   // 进屋时对方正躺着 / 坐在地上
    this.rt.f = -1; // 新来的人要马上知道我在哪
    if (w.uid === this.visit?.host && this.visit.sleeping) this.showSleeper(r);
  }
  private removeRemote(id: number) {
    const r = this.remotes.get(id); if (!r) return;
    if (this.sleepWho === r) this.hideSleeper();
    r.destroy(); this.remotes.delete(id);
  }
  /** 屋里有别人时，每 ~100 毫秒把自己的位置报给服务器（没变就不报；一个人在屋里时一条都不发） */
  private reportPos(now: number) {
    if (!this.net || !this.remotes.size || this.net.status !== 'online' || now - this.rt.t < 100) return;
    const x = Math.round(this.player.x * 4) / 4, y = Math.round(this.player.y * 4) / 4, f = packFlags(this.player.facing, this.player.moving, this.player.running, false, this.sitting);
    if (x === this.rt.x && y === this.rt.y && f === this.rt.f) return;
    this.rt = { t: now, x, y, f }; this.net.roomMove(x, y, f);
  }
  /** 门牌：房主起的名字（没起过：自己看到「我的宿舍」，访客看到「xx的宿舍」）；字太长就缩到牌子里放得下 */
  private setTitle(raw: string) {
    this.titleRaw = raw;
    if (!this.signText) return;
    this.signText.setScale(1).setText(roomTitle(raw, this.hostName, this.isHost));
    const maxW = 68; if (this.signText.width > maxW) this.signText.setScale(maxW / this.signText.width);
  }

  private dormAct(act: 'bed' | 'ac' | 'wardrobe' | 'chest' | 'sign' | 'bath') {
    if (!this.net || this.net.status !== 'online') { this.hud.banner('⚠️ 宿舍', '没连上服务器，这里的东西暂时用不了'); return; }
    const who = this.hostName || '房主';
    if (act === 'ac') this.net.dormAc();
    else if (act === 'sign') { if (this.isHost) this.dormUi?.openSign(this.titleRaw); else this.hud.openDialog('门牌', [`「${roomTitle(this.titleRaw, this.hostName, false)}」——${who}的宿舍`]); }
    else if (act === 'bed') { if (!this.isHost) this.hud.openDialog('单人床', [`这是 ${who} 的床。`]); else if (!this.sleepPending) { this.sleepPending = true; this.net.dormSleep(true); } }
    else if (act === 'bath') {
      if (this.isHost) this.dormUi?.openBath();
      else { const v = this.bathView, n = v ? v.r.reduce((a, b) => a + b, 0) : 0; this.hud.openDialog('鱼缸', [v && v.f.length ? `${who} 的鱼缸里养着 ${v.f.length > 1 ? '好几种' : ''}鱼${n ? `，其中有 ${n} 条会发光的稀有鱼` : ''}，水面闪闪的。` : `${who} 的鱼缸是空的，水很清。`]); }
    }
    else if (act === 'chest') { if (this.isHost) this.dormUi?.openChest(); else this.hud.openDialog('宝箱', [`${who} 的宝箱，只有主人能打开。`]); }
    else { const edit = this.registry.get('editProfile') as (() => void) | undefined; this.input.keyboard!.resetKeys(); edit?.(); }
  }

  /** 墙纸 + 地板：两层透明图叠在一起（没加载过的先下载）；换样式时旧的换成新的 */
  private setSkin(w: number, f: number) {
    if (w === this.skinNow.w && f === this.skinNow.f) return;
    this.skinNow = { w, f }; const seq = ++this.skinSeq, lv = this.level;
    void ensureSkin(this.textures, lv, w, f).then((ok) => {
      if (seq !== this.skinSeq || !this.scene.isActive()) return;
      for (const i of this.skinImgs) i.destroy(); this.skinImgs = [];
      if (ok) this.skinImgs = [this.add.image(0, 0, skinTextureKey(lv, 'f', f)).setOrigin(0).setDepth(-1), this.add.image(0, 0, skinTextureKey(lv, 'w', w)).setOrigin(0).setDepth(-0.9)];
    });
  }
  /** 房间扩建了：换成对应大小的房间（重新进屋，人站在新房间的门口） */
  private expandTo(level: number) {
    if (this.leaving) return; this.leaving = true;
    this.editor?.close(); this.hud.banner('🏠 宿舍', '房间扩建好了！');
    this.time.delayedCall(60, () => this.scene.start('Interior', { id: dormInteriorId(level) }));
  }

  /** 装修：右上角的「装修」按钮 + 装修模式（只有房主）。屋里有访客、正在睡觉时不能装修 */
  private setupDecorUi(net: NetClient) {
    this.editor = new DecorEditor(this, net, { lay: () => this.lay, level: () => this.level, data: () => this.dormUi?.data ?? null, banner: (t, x) => this.hud.banner(t, x), onToggle: (on) => { this.decorBtn?.classList.toggle('hidden', on); if (on) this.hud.hint(null); }, reserve: (px, side = 0) => { if (px !== this.reserve || side !== this.reserveW) { this.reserve = px; this.reserveW = side; this.applyZoom(); } } });
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn decor-open'; b.textContent = '🛋 装修'; b.title = '摆放家具、挪动、收回';
    b.addEventListener('click', () => {
      if (net.status !== 'online') { this.hud.banner('⚠️ 装修', '没连上服务器，现在不能装修'); return; }
      if (this.remotes.size) { this.hud.banner('🛋 装修', '屋里有访客，装修会挤到人：等好友出去再装修'); return; }
      if (this.sleeping || this.hud.dialogOpen || this.dormUi?.anyOpen) return;
      this.editor?.open();
    });
    (document.getElementById('hud') ?? document.body).append(b); this.decorBtn = b;
  }

  /** 做客时：左边一个「赞」按钮，给这间宿舍点赞 / 取消（规则在服务器：累计在线满 10 分钟、每天 20 次） */
  private setupLikeUi(net: NetClient, v: Extract<ServerMsg, { t: 'dorm_visit' }>) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'btn decor-open dorm-like';
    let n = v.likes ?? 0, liked = !!v.liked;
    const paint = () => { b.textContent = `${liked ? '❤️ 已赞' : '🤍 赞'} ${n}`; b.classList.toggle('on', liked); };
    paint(); b.title = `给 ${v.hostName} 的宿舍点个赞（再点一下取消）`;
    b.addEventListener('click', () => { if (net.status !== 'online') { this.hud.banner('⚠️ 宿舍', '没连上服务器'); return; } net.dormLike(v.host); });
    (document.getElementById('hud') ?? document.body).append(b); this.likeBtn = b;
    this.prevLikes = net.handlers.dormLikes;
    net.handlers.dormLikes = (uid, nn, ll, msg) => { this.prevLikes?.(uid, nn, ll, msg); if (uid !== v.host) return; n = nn; liked = ll; paint(); if (msg) this.hud.banner('🏠 宿舍', msg); };
  }

  /** 坐在椅子 / 沙发上（坐姿只有一个朝向；别人也看得到，位置和坐姿随位置上报一起发） */
  private sitDown(seat: { x: number; y: number; bx: number; by: number }) {
    if (this.sleeping) return;
    this.player.x = seat.x; this.player.y = seat.y; this.player.halt();
    this.player.setSitting(true, { bx: seat.bx, by: seat.by, strip: false }); this.sitting = true; this.rt.f = -1; this.hud.hint(null);
  }
  /** 起身：按着方向键起身时，优先站到那个方向前面（不然就近找一个空位——可能在椅子的另一侧，按着方向键只能原地迈步） */
  private standUp(dirX = 0, dirY = 0) {
    if (!this.sitting) return;
    this.player.setSitting(false); this.sitting = false; this.rt.f = -1;
    if (dirX || dirY) {
      const len = Math.hypot(dirX, dirY);
      for (const d of [10, 14, 18, 24]) { const nx = this.player.x + (dirX / len) * d, ny = this.player.y + (dirY / len) * d; if (!this.map.boxBlocked(nx, ny)) { this.player.x = nx; this.player.y = ny; return; } }
    }
    const spot = standNear((px, py) => this.map.boxBlocked(px, py), this.player.x, this.player.y, 48); if (spot) { this.player.x = spot.x; this.player.y = spot.y; }
  }

  /** 床、空调、鱼缸、门牌是可以挪的家具：它们摆在哪儿，睡觉的位置、空调的风、缸里的鱼、门牌上的字就跟到哪儿（家具不在房里 = 对应功能暂时没有） */
  private rebindFixtures(lay: Placed[]) {
    this.acLed?.destroy(); this.acLed = undefined; this.hasAc = false; this.bathFx?.destroy(); this.bathFx = undefined; this.signText?.destroy(); this.signText = undefined; this.bed = null;
    for (const p of lay) {
      const def = decorDef(p.d); if (!def?.act) continue;
      const sp = spotOf(this.textures, lay, p); if (!sp) continue;
      if (def.act === 'ac') { this.hasAc = true; this.acVent = { x: sp.x + 18, y: sp.y + 13 }; this.acLed = this.add.rectangle(sp.x + 28.5, sp.y + 5, 5, 2, 0x3f9a58).setDepth(sp.depth + 1); }
      else if (def.act === 'bed') this.bed = { px: sp.x, py: sp.y, wx: sp.x + 17, wy: sp.y + 71, depth: sp.depth }; // wx/wy = 起床后站的位置（床尾外面，再用 standNear 找个真能站的）
      else if (def.act === 'bath') { this.bathFx = new BathFx(this, sp.x, sp.y, sp.depth); this.bathFx.set(this.bathView); }
      else if (def.act === 'sign') { this.signAt = { x: sp.x + 41, y: sp.y + 11 }; this.signText = this.add.text(this.signAt.x, this.signAt.y, '', { fontFamily: 'ArkPixel', fontSize: '10px', color: '#4a2e14' }).setOrigin(0.5).setDepth(9000); this.setTitle(this.titleRaw); }
    }
    const m = this.acMode; this.acMode = -1; this.acTimer?.remove(); this.acTimer = undefined; this.setAc(m); // 空调挪了地方：风从新位置吹出来
  }

  /** 按摆放数据画房里的家具（地毯、桌椅、柜子、小件、墙饰），并更新碰撞：占地的地面家具挡路，地毯、小件、墙饰不挡 */
  private setLay(lay: Placed[]) {
    const key = JSON.stringify(lay); if (key === this.layKey) return; this.layKey = key; this.lay = lay;
    this.standUp(); // 家具挪动 / 重画了：坐着的人先站起来
    for (const o of this.decorObjs) o.destroy(); this.decorObjs = []; this.decorTalk = [];
    const rows = this.baseCollision.map((r) => r.split(''));
    for (const p of lay) {
      const def = decorDef(p.d), spot = spotOf(this.textures, lay, p); if (!def || !spot) continue;
      this.decorObjs.push(addDecorImage(this, spot));
      if (def.act && def.kind === 'wall') this.decorTalk.push({ x0: p.x * 16 - 8, x1: (p.x + def.fw) * 16 + 8, y0: 0, y1: Math.max((p.y + 3) * 16, 80), title: def.name, text: '', act: def.act }); // 墙上的空调、门牌：走到它下面按 E
      if (def.kind === 'top' && def.say) { const raise = topRaise(lay, p); this.decorTalk.push({ x0: p.x * 16 - 8, x1: (p.x + 1) * 16 + 8, y0: p.y * 16 - 8 - raise, y1: (p.y + 1) * 16 + 16, title: def.name, text: def.say }); }
      if (def.kind !== 'floor' || def.walk) continue; // 猫窝能直接走上去：不挡路
      const { fw, fh } = footOf(def, p.r);
      for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) if (rows[p.y + j]?.[p.x + i] !== undefined) rows[p.y + j][p.x + i] = '1';
      if (def.say || def.act) this.decorTalk.push({ x0: p.x * 16 - 8, x1: (p.x + fw) * 16 + 8, y0: p.y * 16 - 8, y1: (p.y + fh) * 16 + 16, title: def.name, text: def.say ?? '', ...(def.act ? { act: def.act } : {}) });
    }
    this.rebindFixtures(lay);
    this.seats = lay.flatMap((p) => seatsOf(p));
    this.map = new WorldMap({ width: this.def.w, height: this.def.h, collision: rows.map((r) => r.join('')) });
    this.homeDormCats();
    if (this.player && this.map.boxBlocked(this.player.x, this.player.y)) { const s = standNear((px, py) => this.map.boxBlocked(px, py), this.player.x, this.player.y, 64); if (s) { this.player.x = s.x; this.player.y = s.y; } } // 家具摆到了人脚下：把人挪到旁边
  }

  /** 装修托盘占了屏幕底部多少像素：房间缩放到上面剩下的空间里（装修时允许缩到 1 倍） */
  private reserve = 0; private reserveW = 0;
  private applyZoom() {
    // 让整间屋子尽量完整可见，但不低于 2 倍（装修时为托盘让位，可以低到 1 倍）
    const availH = Math.max(120, this.scale.height - this.reserve), availW = Math.max(160, this.scale.width - this.reserveW); // 装修托盘在底部（占高度）或手机横屏时在右边（占宽度）
    const fit = Math.min(availW / (this.def.w * TILE + 32), availH / (this.def.h * TILE + 48));
    const reserved = this.reserve > 0 || this.reserveW > 0;
    let z = 2; if (reserved) z = Math.max(1, Math.min(5, Math.floor(fit * 2) / 2)); else for (const c of ZOOMS) if (c <= fit) z = c; // 装修时允许半倍缩放（手机竖屏房间放大一点）
    const cam = this.cameras.main; cam.setSize(availW, availH); cam.setZoom(reserved ? z : Math.max(2, z)); // 窗口大小变化时，Phaser 自己的相机尺寸更新可能比这里慢一拍，所以直接按画布尺寸来
    // 房间比屏幕小时，把相机范围撑到屏幕那么大并让房间居中——否则 Phaser 会把房间贴在屏幕左上角，剩下一大片黑（"室内黑屏"的真正原因）
    const vw = availW / cam.zoom, vh = availH / cam.zoom, rw = this.def.w * TILE, rh = this.def.h * TILE, ex = Math.max(0, vw - rw), ey = Math.max(0, vh - rh);
    this.bnd = { x: -ex / 2, y: -ey / 2, w: rw + ex, h: rh + ey }; cam.setBounds(this.bnd.x, this.bnd.y, this.bnd.w, this.bnd.h);
  }

  override update(_t: number, delta: number) {
    (this.registry.get('tickClock') as ((dt: number) => void) | undefined)?.(Math.min(0.1, delta / 1000)); // 时钟 / 天气 / 节日由校园场景算，它睡着时这里代为推进
    this.bathFx?.update(Math.min(0.1, delta / 1000));
    this.updateDormCats(Math.min(50, delta) / 1000);
    const dt = Math.min(delta, 50) / 1000, k = this.keys, joy = this.touchState(), tap = this.takeTouchPress();
    { const me = this.registry.get('profile') as Profile | undefined; if (me && me !== this.seenProfile) { this.seenProfile = me; this.player.setLook(me.look, me.app); } } // 换装后刷新外观（所有室内）
    if (this.dorm && this.dormFrame(dt, k, joy, tap)) return;
    if (!this.dorm) { // 非宿舍的室内也能开传送（Y / 菜单）；面板开着时不能走动
      const tp = this.registry.get('tpUi') as TeleportPanel | undefined;
      if (Phaser.Input.Keyboard.JustDown(k.y) && !this.hud.dialogOpen && !this.leaving) tp?.toggle();
      if (tp?.isOpen && !this.leaving) { this.player.update(dt, 0, 0, false, this.map); this.hud.hint(null); return; }
    }
    if (this.hud.dialogOpen) {
      if (Phaser.Input.Keyboard.JustDown(k.esc)) { this.hud.closeDialog(); this.talking = null; }
      else if (Phaser.Input.Keyboard.JustDown(k.e) || Phaser.Input.Keyboard.JustDown(k.space) || tap) { if (!this.hud.advanceDialog()) this.talking = null; }
      this.player.update(dt, 0, 0, false, this.map);
      return;
    }
    const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const ky = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    const ix = kx || (joy?.x ?? 0), iy = ky || (joy?.y ?? 0); // 键盘优先，没按键时用手机摇杆（之前室内只读键盘，手机进了 214 室就动不了）
    const farmBusy = this.farm && (!!this.farmUi()?.isOpen || !!this.shopUi()?.isOpen); // 农场面板 / 管理员商店开着：人原地站着，别在地里乱走
    if (this.farm && !farmBusy) for (const n of this.npcs) n.update(dt, this.map, Math.random); // 农场管理员自己在田埂上溜达
    if (this.sitting && (ix || iy)) this.standUp(ix, iy); // 坐着时一推方向就起身（站到那个方向前面）
    if (!this.leaving) this.player.update(dt, farmBusy ? 0 : ix, farmBusy ? 0 : iy, k.shift.isDown || (joy?.run ?? false), this.map);

    const press = !farmBusy && (Phaser.Input.Keyboard.JustDown(k.e) || Phaser.Input.Keyboard.JustDown(k.space) || tap);
    // 最近的 NPC
    let near: Npc | null = null, nd = 30;
    for (const n of this.npcs) { const dd = Math.hypot(n.x - this.player.x, n.y - this.player.y); if (dd < nd) { nd = dd; near = n; } }
    // 横幅等可互动的家具：站在好几个互动区重叠的地方时，选中心最近的那个
    let spot: NonNullable<InteriorDef['interacts']>[number] | null = null, sd = Infinity;
    let dcat: Cat | null = null; // 宿舍里养的猫：走近到够得着，优先于家具 / 椅子
    if (this.dorm && !near) { let cd = CAT_REACH; for (const c of this.dormCats.values()) { const dd = c.distTo(this.player.x, this.player.y); if (dd < cd) { cd = dd; dcat = c; } } }
    // 农场：站在地边按 E 打开农场面板（翻土/播种/浇水/收获都在里面）
    const plotIdx = this.farm && !dcat ? this.farmPlotAt() : -1; // 不看 near：站在田边按 E 永远先开农场面板，别被溜达过来的管理员抢了键
    const fplot = plotIdx >= 0 && this.farmData ? this.farmData.plots[plotIdx] : undefined;
    const plotTip = plotIdx >= 0 ? `E  第 ${plotIdx + 1} 块地 · ${fplot?.c && this.farmData ? growthText(fplot, this.farmData.today) : '空地（翻土 + 播种）'}` : null;
    if (!near && !dcat) for (const a of [...(this.def.interacts ?? []), ...this.decorTalk]) {
      if (this.player.x < a.x0 || this.player.x > a.x1 || this.player.y < a.y0 || this.player.y > a.y1) continue;
      const dd = Math.hypot((a.x0 + a.x1) / 2 - this.player.x, (a.y0 + a.y1) / 2 - this.player.y);
      if (dd < sd) { sd = dd; spot = a; }
    }
    const tip = (a: NonNullable<InteriorDef['interacts']>[number]) => a.act === 'sign' ? (this.isHost ? 'E  给宿舍起个名字（改门牌）' : 'E  看门牌') : a.act === 'bed' ? (this.isHost ? 'E  上床睡觉（精灵会慢慢恢复）' : `E  ${this.hostName} 的床`) : a.act === 'ac' ? `E  空调：现在${AC_NAMES[this.acMode as 0 | 1 | 2]}，点一下切换` : a.act === 'wardrobe' ? 'E  打开衣柜（换装）' : a.act === 'bath' ? (this.isHost ? 'E  鱼缸：放鱼进去养着（放进去的鱼不能卖）' : 'E  看看鱼缸里的鱼') : a.act === 'chest' ? (this.isHost ? 'E  打开宝箱（仓库）' : 'E  宝箱（只有主人能开）') : `E  查看：${a.title}`;
    // 楼梯口：站在楼梯上按 E 换层（坐着时先起身）
    let stair: NonNullable<InteriorDef['stairs']>[number] | null = null;
    if (!near && !spot && !dcat && !this.sitting && !this.leaving) for (const t of this.def.stairs ?? []) if (this.player.x >= t.x0 && this.player.x <= t.x1 && this.player.y >= t.y0 && this.player.y <= t.y1) { stair = t; break; }
    // 椅子：靠近按 E 坐下；坐着时按 E 起身
    let seat: (typeof this.seats)[number] | null = null;
    if (!near && !spot && !dcat && !stair && !this.sitting) { let sd2 = 26; for (const q of this.seats) { const dd = Math.hypot(q.bx - this.player.x, q.by - this.player.y); if (dd < sd2) { sd2 = dd; seat = q; } } }
    this.hud.hint(this.sitting ? 'E / 方向键  起身' : plotIdx >= 0 ? plotTip : near ? (this.npcShop(near) ? (this.time.now < this.chatUntil ? `E  打开柜台（买种子 / 卖菜）` : `E  和「${near.name}」聊聊`) : `E  和「${near.name}」交谈`) : dcat ? `E  ${this.isHost ? '和' : '看看'}「${dcat.label}」${this.isHost ? '玩' : ''}` : spot ? tip(spot) : stair ? `E  ${stair.label}` : seat ? 'E  坐下' : null);
    if (stair && press) { this.changeFloor(stair.to); return; }
    if (this.sitting && press) this.standUp(); else if (seat && press) this.sitDown(seat);
    if (dcat && press && !this.sitting) this.touchDormCat(dcat);
    if (plotIdx >= 0 && press && !this.sitting) { this.farmUi()?.open(plotIdx); return; } // 开了面板就到此为止：同一下 E 不能又弹管理员的对话
    if (spot && press) { if (spot.act) this.dormAct(spot.act); else this.hud.openDialog(spot.title, [spot.text]); }
    if (near && press) {
      this.talking = near;
      // 让 NPC 面向玩家
      const dx = this.player.x - near.x, dy = this.player.y - near.y;
      near.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      near.sprite.setFrame(`c${near.look}_${near.facing}_0`);
      const shop = this.npcShop(near);
      if (!shop) this.hud.openDialog(near.name, near.lines);
      else if (this.time.now < this.chatUntil) { this.chatUntil = 0; this.shopUi()?.open(shop); } // 刚聊完又按 E：开柜台（买种子 / 卖菜）
      else { // 老板也是人：先随手聊一句，对话里写清楚再按 E 才开柜台
        this.chatUntil = this.time.now + 4000;
        const line = near.lines[Math.floor(Math.random() * near.lines.length)];
        const advice = this.farmAdvice();
        this.hud.openDialog(near.name, [line + (advice ? ` 我看了一圈：${advice}。` : ''), '要种子，还是把菜卖给我？再按一下 E 打开柜台。']);
      }
    }
    // 走出南侧门洞
    if (!this.leaving && this.def.exit && this.player.y > (this.def.h - 1) * TILE + 6) this.leave();
  }

  /**
   * 宿舍每帧的额外处理，返回 true = 这一帧到此为止：
   * 身份换了（断线重连）→ 重新告诉服务器我在屋里；换装后刷新外观；睡着时任何操作都是起床；面板/编辑器开着时不能走动；Enter 打开公屏输入。
   */
  private dormFrame(dt: number, k: InteriorScene['keys'], joy: { x: number; y: number; run: boolean } | undefined, tap: boolean): boolean {
    const net = this.net;
    if (net && this.selfId !== net.selfId) { // 连接断过又重连了：服务器上"在宿舍里"的标记没了——房主补发进屋、访客直接出来；睡觉的会话也没了，起床
      this.selfId = net.selfId;
      if (net.status === 'online') { if (!this.isHost) { this.leaveForced(); return true; } net.dormEnter(); if (this.sleeping) this.endSleep(false); }
    }
    { const now = performance.now(); for (const r of this.remotes.values()) r.tick(now); this.reportPos(now); }
    if (Phaser.Input.Keyboard.JustDown(k.enter) && !this.hud.dialogOpen && !this.registry.get('editorOpen')) this.chat?.focus();
    { const hp = this.player.holdingEmote; if (this.heldPoseId >= 0 && hp < 0 && this.player.moving && !this.remotes.size && net?.status === 'online') net.emote(this.heldPoseId); this.heldPoseId = hp; } // 屋里没人时不上报位置：自己走开了，用再发一次同一个表情的方式让服务器也知道站起来了
    const tp = this.registry.get('tpUi') as TeleportPanel | undefined;
    if (Phaser.Input.Keyboard.JustDown(k.x) && !this.chat?.typing && !this.registry.get('editorOpen') && !this.dormUi?.anyOpen && !this.hud.dialogOpen && !this.sleeping) (this.registry.get('emoteUi') as EmotePanel | undefined)?.toggle(); // X：宿舍里也能做表情
    if (Phaser.Input.Keyboard.JustDown(k.y) && !this.chat?.typing && !this.registry.get('editorOpen') && !this.dormUi?.anyOpen) tp?.toggle(); // Y：在宿舍里也能打开传送
    const typing = !!this.chat?.typing, busy = (this.dormCats.size > 0 && !!this.catBridge?.panel().isOpen) || !!tp?.isOpen || !!this.dormUi?.anyOpen || !!this.registry.get('editorOpen') || typing || !!this.editor?.active;
    if (this.sleeping) {
      const move = !busy && (k.up.isDown || k.down.isDown || k.left.isDown || k.right.isDown || k.w.isDown || k.a.isDown || k.s.isDown || k.d.isDown || Math.abs(joy?.x ?? 0) + Math.abs(joy?.y ?? 0) > 0.3);
      if (move || (tap && !busy)) this.endSleep();
      return true;
    }
    if (busy && !this.hud.dialogOpen) { this.player.update(dt, 0, 0, false, this.map); this.hud.hint(null); return true; }
    return false;
  }

  /** 传送成功（世界场景的传送面板回调进来）：服务器已把人传到新位置，直接离开室内回校园，人留在新位置；选了某一层的话回到校园后再进那一层。宿舍里被传走时服务器会先发 dorm_out，这里已经在离开了，只补记「要进的那一层」 */
  teleportOut(floor?: string) {
    if (floor) this.afterFloor = floor;
    if (this.leaving) return;
    this.standUp(); this.leaveForced();
  }
  private afterFloor: string | undefined;

  /** 服务器把我从宿舍里带走了：不用再告诉服务器，也别把人放回宿舍楼门口，直接回校园 */
  private leaveForced() {
    if (this.leaving) return;
    this.leaving = true; this.registry.set('dormForced', true);
    this.endSleep(false); this.hud.hint(null);
    this.editor?.close(); this.dormUi?.close(); this.dormUi?.closeChest(); (this.registry.get('tpUi') as TeleportPanel | undefined)?.close();
    this.cameras.main.fadeEffect.reset(); this.cameras.main.fadeOut(240, 20, 14, 10); // 刚进屋的淡入还没播完就退出：不先 reset，淡出会被忽略，"淡出完成"永远不触发，人就卡在屋里（Phaser 的淡入淡出同一时间只能有一个）
    this.cameras.main.once('camerafadeoutcomplete', () => { this.backToWorld(); });
  }

  /** 走楼梯：淡出 → 重新进入目标楼层（人落在对应楼梯口旁边）；坐着的先起身 */
  private changeFloor(to: string) {
    if (this.leaving) return;
    this.leaving = true; this.standUp(); this.hud.hint(null);
    this.cameras.main.fadeEffect.reset(); this.cameras.main.fadeOut(200, 20, 14, 10);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Interior', { id: to, from: this.def.id }));
  }

  private leave() {
    this.leaving = true;
    this.hud.hint(null);
    if (this.dorm) { this.endSleep(); this.net?.dormLeave(); }
    this.cameras.main.fadeEffect.reset(); this.cameras.main.fadeOut(240, 20, 14, 10); // 刚进屋的淡入还没播完就退出：不先 reset，淡出会被忽略，"淡出完成"永远不触发，人就卡在屋里（Phaser 的淡入淡出同一时间只能有一个）
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.backToWorld();
    });
  }
}
