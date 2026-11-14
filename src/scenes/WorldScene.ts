import Phaser from 'phaser';
import type { WorldFile, BuildingOut } from '@/shared/world-format';
import { WorldMap } from '@/world/WorldMap';
import { Player } from '@/entities/Player';
import { Npc } from '@/entities/Npc';
import { GameClock } from '@/systems/clock';
import { fishingRodOut } from '@/systems/fishlock';
import { Hud } from '@/ui/Hud';
import { TILE, DEFAULT_ZOOM_INDEX } from '@/core/const';
import { Streamer } from '@/world/Streamer';
import { type Profile } from '@/shared/profile';
import { saveProfile } from '@/core/profileStore';
import { NetClient } from '@/net/client';
import { NET, packFlags, type PublicProfile } from '@/shared/protocol';
import { RemotePlayer } from '@/entities/RemotePlayer';
import { ProfilePanel } from '@/ui/ProfilePanel';
import { ChatPanel } from '@/ui/ChatPanel';
import { ReportDialog } from '@/ui/ReportDialog';
import { TouchControls, isTouchDevice } from '@/ui/TouchControls';
import { mountOrientation } from '@/ui/Orientation';
import { BoardPanel } from '@/ui/BoardPanel';
import { ShopPanel } from '@/ui/ShopPanel';
import { WallPanel } from '@/ui/WallPanel';
import { NoticePanel } from '@/ui/NoticePanel';
import { SocialUi } from '@/ui/SocialUi';
import { CreateCharacter } from '@/ui/CreateCharacter';
import { Cat } from '@/entities/Cat';
import { LakeBirds } from '@/entities/LakeBird';
import { BackpackPanel } from '@/ui/BackpackPanel';
import { MonPanel } from '@/ui/MonPanel';
import { BattleUi } from '@/ui/BattleUi';
import { TeleportPanel } from '@/ui/TeleportPanel';
import { DormPanel } from '@/ui/DormPanel';
import { WorldPanel } from '@/ui/WorldPanel';
import { HandUi } from '@/ui/HandUi';
import { HAND, glide, handOffset } from '@/shared/hand';
import { CatPanel } from '@/ui/CatPanel';
import { BackupPanel } from '@/ui/BackupPanel';
import { AchievementPanel } from '@/ui/AchievementPanel';
import { TitlePanel } from '@/ui/TitlePanel';
import { EmotePanel } from '@/ui/EmotePanel';
import { PhotoMode } from '@/ui/PhotoMode';
import { emoteDef } from '@/shared/emotes';
import { nearestSeat, seatSpots, type Seat } from '@/shared/seats';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { QuestPanel } from '@/ui/QuestPanel';
import { CalendarPanel } from '@/ui/CalendarPanel';
import { FestivalFx } from '@/systems/festival';
import { RunPanel } from '@/ui/RunPanel';
import { AdminPanel } from '@/ui/AdminPanel';
import { PartyPanel } from '@/ui/PartyPanel';
import { CodexPanel } from '@/ui/CodexPanel';
import { HallPanel } from '@/ui/HallPanel';
import { PlacePanel } from '@/ui/PlacePanel';
import { buildPlaces, type PlaceDef } from '@/shared/place';
import { TradePanel } from '@/ui/TradePanel';
import { FishFightUi } from '@/ui/FishFightUi';
import { FishCard } from '@/ui/FishCard';
import { BoxPanel } from '@/ui/BoxPanel';
import { lakeMask, type WaterMask } from '@/shared/water';
import { audio } from '@/audio/engine';
import { music } from '@/audio/music';
import { sfx } from '@/audio/sfx';
import { type CatInfo } from '@/shared/cats';
import { seasonAt, type Season, type WeatherState } from '@/shared/season';
import { WeatherFx } from '@/systems/weather';
import { standUp, updateAudio } from './world/actions';
import { applyZoom, changeZoom } from './world/camera';
import { checkDawn, loadSeason, updateClock } from './world/clock';
import { buildTrackMarks, drawHandLinks, drawRunMark, onBikeCrash } from './world/effects';
import { buildBikes, spawnCats, spawnKeeper, spawnNpcs, spawnTrainers, updateCreatures, updateKeeper } from './world/entities';
import { fishLockState, stopFishing } from './world/fishing';
import { mainHotkeys, overlayKeys } from './world/hotkeys';
import { updateInteraction } from './world/interaction';
import { updateBoardEntry, updatePlace } from './world/place';
import { buildLighting, buildStream, mapLabels, tickStream, updateBuildingFade } from './world/stream';
import { wireSocial } from './world/wire-panels';

export type Keys = Record<'l' | 'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd' | 'shift' | 'e' | 'space' | 'esc' | 'v' | 'm' | 'c' | 'b' | 'n' | 'f' | 'i' | 'j' | 'k' | 'q' | 't' | 'x' | 'p' | 'h' | 'g' | 'r' | 'y' | 'u' | 'o' | 'enter' | 'plus' | 'minus' | 'plus2' | 'minus2', Phaser.Input.Keyboard.Key>;

export class WorldScene extends Phaser.Scene {
  world!: WorldMap;
  wf!: WorldFile;
  player!: Player;
  hud!: Hud;
  clock = new GameClock();
  /** 当前季节（决定用哪一套地面块/树木图集）和天气画面 */
  season: Season = 'spring';
  propsKey = 'props';
  seasonChanging = false;
  seasonLocked = false; // 开发调试：锁定季节（不跟随服务器时间）
  weather!: WeatherFx; festFx!: FestivalFx; lastFest = '';
  lastWx = ''; lastBow = false;
  wxPlaceT = 0; placeText = '';
  keys!: Keys;
  tintRect!: Phaser.GameObjects.Rectangle;
  stream = new Streamer(700, 1500);
  waterActive = new Map<string, Phaser.GameObjects.Image[]>();
  waterFrame = 0;
  zoomIndex = DEFAULT_ZOOM_INDEX;
  lastPlace = '';
  nearBuilding: BuildingOut | null = null;
  /** 地点留言板：地点表、玩家现在所在的地点、入口按钮 */
  placeUi!: PlacePanel; places: PlaceDef[] = []; curPlace: PlaceDef | null = null; placeBtn?: HTMLButtonElement; placeChkAt = 0; placeKey?: Phaser.Input.Keyboard.Key;
  npcs: Npc[] = [];
  /** 精工湖钓具摊旁的固定 NPC「钓具老板」+ 名字牌 + 头顶的「！」（有委托奖励可以领时） */
  keeper: Npc | null = null; keeperTag: Phaser.GameObjects.Text | null = null; keeperMark: Phaser.GameObjects.Text | null = null;
  /** 训练家 NPC（按 shared/trainers.ts 的位置生成；id → 实体） */
  trainers = new Map<string, Npc>();
  entering = false;
  enterPos: { x: number; y: number } | null = null;
  rand = Math.random;
  profileUi!: ProfilePanel;
  chatUi!: ChatPanel;
  chatUnread = 0;
  reportUi!: ReportDialog;
  boardUi!: BoardPanel;
  shopUi!: ShopPanel;
  wallUi!: WallPanel;
  /** 送过猫窝的小猫编号（只有我自己看得到那些窝） */
  catBeds = new Set<number>();
  catRo?: ResizeObserver;
  /** 刚发了「接回宿舍 / 送回校园」，在等服务器的结果文字（显示在小猫面板里） */
  dormCatAwait = false;
  noticeUi!: NoticePanel;
  socialUi!: SocialUi;
  backpackUi!: BackpackPanel;
  catUi!: CatPanel;
  backupUi!: BackupPanel;
  achUi!: AchievementPanel;
  titleUi!: TitlePanel;
  emoteUi!: EmotePanel;
  settingsUi!: SettingsPanel;
  questUi!: QuestPanel;
  calUi!: CalendarPanel;
  runUi!: RunPanel;
  adminUi!: AdminPanel;
  partyUi!: PartyPanel;
  codexUi!: CodexPanel;
  hallUi!: HallPanel;
  monUi!: MonPanel;
  battleUi!: BattleUi;
  tpUi!: TeleportPanel;
  dormUi!: DormPanel;
  worldUi!: WorldPanel;
  handUi!: HandUi;
  /** 手拉手：我被谁牵着（牵手的人的玩家编号，0 = 没有）；全部牵着手的一对；连线的画布 */
  holdPid = 0; holdSide: 1 | -1 = 1;
  handPairs: { l: number; f: number }[] = [];
  handG!: Phaser.GameObjects.Graphics;
  tradeUi!: TradePanel;
  /** 垃圾桶（脚点，像素坐标；编号 = 世界文件里垃圾桶的顺序，和服务器一致） */
  bins: { x: number; y: number }[] = [];
  /** 骑车撞墙：上次上报的时间；凌晨四点：这次登录有没有报过 */
  crashAt = 0; dawnSent = false; dawnNext = 0;
  /** 校园币余额（服务器推送；交易面板要用） */
  coinBal = 0;
  /** 今天还能翻几次垃圾桶（-1 = 还没翻过，不知道） */
  binLeft = -1;
  fightUi!: FishFightUi;
  boxUi!: BoxPanel;
  fishCard!: FishCard;
  /** 浮漂落点（世界像素）：钓上来的鱼从这里飞出水面 */
  bobber: { x: number; y: number } | null = null;
  /** 正坐在谁的车后座（车主的玩家编号，0 = 没坐车）：位置每帧跟着车主走 */
  paxPid = 0;
  runMark?: Phaser.GameObjects.Graphics;
  stepT = 0; moodT = 0;
  photo!: PhotoMode;
  /** 可以坐的长椅座位（和服务器按同一份数据、同一个算法算出来） */
  seats: Seat[] = [];
  /** 钓鱼：精工湖的水面格；当前的钓鱼阶段（和服务器保持一致，由 fish_state 驱动） */
  water: WaterMask | null = null;
  fishPhase: 'idle' | 'wait' | 'bite' | 'fight' = 'idle';
  cats: Cat[] = [];
  /** 精工湖的鸭子和天鹅（没有湖的世界里是 undefined） */
  lakeBirds?: LakeBirds;
  /** 各只小猫对我的好感度（服务器推送；猫编号 → 点数） */
  catAff: Record<string, number> = {};
  /** 我给各只小猫取的专属名字（猫编号 → 名字）；谁带着哪只猫（猫编号 → 玩家编号） */
  catNick: Record<string, string> = {};
  /** 服务器给的每只猫"今天的状态" / 今天和累计收到的回礼数 */
  catInfo: Record<string, CatInfo> = {};
  catGifts = { today: 0, total: 0 };
  catWith = new Map<number, number>();
  /** 摆着共享单车的停车点（像素坐标）：走到旁边按 E 扫码骑行 */
  bikeSpots: { x: number; y: number }[] = [];
  /** 别人（或自己）下车后留在原地的单车：编号 → 位置与图 */
  droppedBikes = new Map<number, { x: number; y: number; img: Phaser.GameObjects.Image }>();
  /** 这一帧玩家是不是在奔跑（小猫据此决定要不要躲） */
  runNow = false;
  net!: NetClient;
  remotes = new Map<number, RemotePlayer>();
  lastSent = { x: -1, y: -1, flags: -1 };
  sendAcc = 0;
  editing = false;
  touchUi?: TouchControls;
  /** 触屏的"互动"/点提示/点对话框：置位后由下一帧的 update 当作按了 E 处理 */
  touchPress = false;
  /** 我现在拿的手持物（0 = 没拿）：V 键 / 菜单「手持物」依次切换，联机时同步给看得见我的人 */
  heldId = 0;
  /** 流式构建的状态：路灯光晕、建筑淡出（每栋楼的翼体范围 + 当前透明度）、建筑图集按页加载的等待队列；镜头缩放的用户偏移 */
  glowActive = new Set<Phaser.GameObjects.Image>();
  bld = new Map<string, { alpha: number; rects: { l: number; r: number; t: number; base: number }[]; imgs: Set<Phaser.GameObjects.Image> }>();
  bldWait = new Map<number, (() => void)[]>();
  userZoomOffset = 0;
  /** 钓鱼沉浸用的状态：鱼飞出水面 + 卡片弹出之前也算钓鱼流程；上次提示"钓鱼中"的时间 */
  catchUntil = 0; fishBlockAt = 0;
  /** 可改字的文字牌（校名石彩蛋）：id → 当前显示第几句（0 = 原文）与场景里正在显示的文字对象 */
  egg = new Map<string, { step: number; busy?: boolean; text?: Phaser.GameObjects.Text }>();

  constructor() { super('World'); }

  create() {
    this.hud = this.registry.get('hud') as Hud;
    this.wf = this.cache.json.get('world') as WorldFile;
    this.world = new WorldMap(this.wf);
    this.season = (this.registry.get('season') as Season | undefined) ?? seasonAt(Date.now());
    buildLighting(this);
    this.weather = new WeatherFx(this); this.festFx = new FestivalFx(this);
    buildStream(this);

    const sp = this.wf.spawn;
    const profile = this.registry.get('profile') as Profile;
    this.player = new Player(this, sp.x * TILE, sp.y * TILE, profile.look, profile.app);
    this.player.setNameTag(profile.name, '#ffe9a0');
    wireSocial(this, profile);
    this.setupTouch();
    this.registry.set('touchUi', () => this.touchUi);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.world.pxW, this.world.pxH);
    cam.startFollow(this.player.sprite, true, 0.14, 0.14);
    cam.roundPixels = true;
    applyZoom(this);
    this.scale.on('resize', () => applyZoom(this));
    cam.centerOn(this.player.x, this.player.y);
    tickStream(this);
    this.time.addEvent({ delay: 120, loop: true, callback: () => tickStream(this) });

    const kb = this.input.keyboard!;
    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = kb.addKeys({
      up: K.UP, down: K.DOWN, left: K.LEFT, right: K.RIGHT, w: K.W, a: K.A, s: K.S, d: K.D, shift: K.SHIFT, e: K.E, space: K.SPACE,
      esc: K.ESC, v: K.V, m: K.M, c: K.C, b: K.B, n: K.N, f: K.F, i: K.I, j: K.J, k: K.K, q: K.Q, t: K.T, x: K.X, p: K.P, h: K.H, g: K.G, r: K.R, y: K.Y, u: K.U, o: K.O, l: K.L, enter: K.ENTER, plus: K.PLUS, minus: K.MINUS, plus2: K.NUMPAD_ADD, minus2: K.NUMPAD_SUBTRACT,
    }) as Keys;
    // 主键盘 =/- 的 keyCode
    this.placeKey = kb.addKey(190); // 句号键 .：打开地点留言板（字母键都被占满了）
    kb.addKey(187).on('down', () => changeZoom(this, 1));
    kb.addKey(189).on('down', () => changeZoom(this, -1));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => { if (!this.hud.dialogOpen) changeZoom(this, dy < 0 ? 1 : -1); });

    this.water = lakeMask(this.wf.waterRuns, this.wf.width, this.wf.height, this.wf.pois);
    this.places = buildPlaces(this.wf.buildings, this.wf.pois); // 地点留言板：有名字的建筑 + 地标
    this.seats = seatSpots(this.wf.objects.filter((o) => o.k === 'bench'), this.world);
    this.bins = this.wf.objects.filter((o) => o.k === 'bin').map((o) => ({ x: o.x, y: o.y }));
    RemotePlayer.findSeat = (x, y) => { const s = nearestSeat(this.seats, x, y, 30); return s && { bx: s.bx, by: s.by }; };
    buildTrackMarks(this);
    spawnNpcs(this);
    spawnTrainers(this);
    spawnCats(this);
    if (this.water) this.lakeBirds = new LakeBirds(this, this.water);
    spawnKeeper(this);
    buildBikes(this);
    this.registry.set('tickClock', (dt: number) => updateClock(this, dt)); // 进了宿舍 / 室内：校园场景在睡觉，由室内场景每帧代为推进时钟（时间显示、天气播报才不会停）
    this.events.on('wake', () => {
      this.entering = false; this.touchPress = false; this.registry.set('touchPress', false); // 室内里按过的互动键别带回外面（否则一出来又"进入"了）
      if (this.registry.get('dormForced')) this.registry.set('dormForced', false); // 在宿舍里被传走：位置已经是服务器给的新位置，别再放回门口
      else if (this.enterPos) { this.player.x = this.enterPos.x; this.player.y = this.enterPos.y; this.player.facing = 'down'; }
      this.cameras.main.fadeIn(260, 20, 14, 10);
      this.cameras.main.centerOn(this.player.x, this.player.y);
    });
    this.hud.setupMinimap(this.world.w, this.world.h, this.wf.pois, mapLabels(this));
    this.hud.hideLoading();
    this.hud.banner('河北工程大学', '新校区 · 从南门出发');
    if (import.meta.env.DEV) (window as any).__game = { scene: this, audio, music, sfx, tp: (tx: number, ty: number) => { this.player.x = tx * TILE; this.player.y = ty * TILE; }, setTime: (h: number) => this.clock.devSetHour(h),
      setWeather: (kind?: WeatherState['kind'], power = 1) => { this.weather.forced = kind ? { kind, power, name: kind, icon: '' } : undefined; },
      setSeason: (s: Season) => { this.seasonLocked = true; loadSeason(this, s, true); } };
  }

  /** 有没有面板/弹窗盖在游戏上（有的话点击不该穿透到场景） */
  anyOverlay() { return this.profileUi.isOpen || this.editing || this.boardUi.isOpen || this.shopUi.isOpen || this.wallUi.isOpen || this.placeUi.isOpen || this.noticeUi.isOpen || this.socialUi.isOpen || this.backpackUi.isOpen || this.boxUi.isOpen || this.codexUi.isOpen || this.achUi.isOpen || this.backupUi.isOpen || this.catUi.isOpen || this.titleUi.isOpen || this.questUi.isOpen || this.calUi.isOpen || this.runUi.isOpen || this.partyUi.isOpen || this.adminUi.isOpen || this.settingsUi.isOpen || this.photo.isOpen || this.hallUi.isOpen || this.monUi.isOpen || this.tpUi.isOpen || this.worldUi.isOpen || this.dormUi.anyOpen || this.battleUi.isOpen || this.tradeUi.isOpen || this.hud.dialogOpen; }

  /** 点中的位置（世界坐标）有没有别的玩家：有就弹出资料卡；多个重叠时取最靠前（y 最大）的 */
  pickPlayerAt(wx: number, wy: number) {
    let hit: RemotePlayer | null = null;
    for (const r of this.remotes.values()) if (Math.abs(wx - r.x) <= 14 && wy >= r.y - 44 && wy <= r.y + 4 && (!hit || r.y > hit.y)) hit = r;
    if (hit) this.socialUi.showPlayer(hit.uid, hit.info);
  }

  upsertRemote(id: number, uid: number, x: number, y: number, flags: number, p: PublicProfile, ttl?: string, held?: number, fz?: number, pose?: number) {
    let r = this.remotes.get(id);
    if (r) r.applyInfo(p);
    else { r = new RemotePlayer(this, id, uid, p, x, y, flags); this.remotes.set(id, r); }
    r.applyTitle(ttl); r.setHeld(held ?? 0); r.setFz(fz ?? 0); r.setHeldPose(emoteDef(pose));   // 重新进视野的人还躺着 / 坐着，就直接是那个姿势
  }

  /** 每帧：上报自己的位置（变化才发，最高 15 Hz），并让远程玩家按插值移动 */
  updateNet(dt: number, run: boolean) {
    const hz = this.player.riding ? 30 : NET.REPORT_HZ; // 骑车时上报更密：两次上报之间走得不远，服务器的穿墙检查才不会误判
    this.sendAcc += dt;
    if (this.paxPid || this.holdPid) this.sendAcc = 0; // 坐在队友车上 / 被好友牵着：位置由服务器定，不上报
    else if (this.sendAcc >= 1 / hz) {
      const flags = packFlags(this.player.facing, this.player.moving, run, this.player.riding, this.player.sitting);
      const p = this.player, s = this.lastSent;
      if (Math.abs(p.x - s.x) > 0.01 || Math.abs(p.y - s.y) > 0.01 || flags !== s.flags) {
        this.net.sendPos(p.x, p.y, flags); this.lastSent = { x: p.x, y: p.y, flags }; this.sendAcc = 0;
      } else this.sendAcc = 1 / hz;
    }
    const now = performance.now();
    for (const r of this.remotes.values()) r.tick(now);
  }

  /** 手机：虚拟摇杆 + 按钮。触屏设备一开始就启用；其他设备第一次触屏时再启用（平板的桌面模式等）。 */
  setupTouch() {
    const on = () => {
      if (this.touchUi) return;
      this.touchUi = new TouchControls({
        act: () => this.pressTouch(),
        chat: () => this.chatUi.toggle(),
        zoom: (d) => changeZoom(this, d),
        tap: (cx, cy) => { if (this.anyOverlay()) return; const r = this.game.canvas.getBoundingClientRect(); const w = this.cameras.main.getWorldPoint(cx - r.left, cy - r.top); this.pickPlayerAt(w.x, w.y); },
      });
      mountOrientation();
      this.touchUi.setChatBadge(this.chatUnread);
      const tap = () => this.pressTouch();
      document.getElementById('hint')?.addEventListener('pointerdown', tap);   // 点提示 = 按 E
      document.getElementById('dialog')?.addEventListener('pointerdown', tap); // 点对话框 = 翻页/关闭
    };
    if (isTouchDevice()) on();
    else window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') on(); });
  }
  /** 触屏的"互动"/点提示/点对话框：本场景当作按了 E；同时记在 registry 里，室内场景（InteriorScene）也读它——室内没有自己的触控，摇杆和互动键是同一套 DOM 控件 */
  pressTouch() { this.touchPress = true; this.registry.set('touchPress', true); }

  editProfile(wardrobe = false) {
    this.editing = true; this.registry.set('editorOpen', true);
    this.input.keyboard!.resetKeys();
    new CreateCharacter(this.textures, {
      initial: this.profileUi.profile, wardrobe,
      onCancel: () => { this.editing = false; this.registry.set('editorOpen', false); },
      onDone: (p) => {
        this.editing = false; this.registry.set('editorOpen', false);
        saveProfile(p);
        this.registry.set('profile', p);
        this.profileUi.set(p);
        this.net.updateProfile(p);
        this.player.setLook(p.look, p.app);
        this.player.setNameTag(p.name, '#ffe9a0');
      },
    }).open();
  }

  override update(_t: number, delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    const k = this.keys;
    const joy = this.touchUi?.state;
    this.runNow = this.player.moving && !this.player.riding && (k.shift.isDown || (joy?.run ?? false));
    updateKeeper(this, dt, _t);
    updateCreatures(this, dt);
    { const l = this.player.riding ? 0.24 : 0.14; this.cameras.main.setLerp(l, l); } // 骑车时镜头跟得更紧
    // 注意顺序：anyOverlay() 里也包含对话框，所以对话框必须先判断，否则下面"翻页/关闭"的分支永远走不到（手机上与 NPC 对话后点屏幕没反应、卡死就是这个原因）
    if (!this.hud.dialogOpen && this.anyOverlay()) {
      this.player.update(dt, 0, 0, false, this.world);
      overlayKeys(this, k, dt, joy);
    } else if (this.hud.dialogOpen) {
      if (Phaser.Input.Keyboard.JustDown(k.esc)) this.hud.closeDialog();
      else if (Phaser.Input.Keyboard.JustDown(k.e) || Phaser.Input.Keyboard.JustDown(k.space) || this.touchPress) this.hud.advanceDialog();
      this.player.update(dt, 0, 0, false, this.world);
    } else if (this.entering) {
      this.player.update(dt, 0, 0, false, this.world);
    } else if (this.fishPhase === 'fight') { // 拉鱼小游戏：人站着不动，空格 / 按钮控制绿条，Esc 放弃
      this.player.update(dt, 0, 0, false, this.world);
      if (this.touchPress) this.fightUi.tap();
      this.fightUi.updateWith(dt, k.space.isDown);
      if (Phaser.Input.Keyboard.JustDown(k.esc)) { this.net.fishCancel(); stopFishing(this); sfx('lock'); }
      this.hud.hint(null);
    } else {
      const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
      const ky = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
      const ix = kx || (joy?.x ?? 0), iy = ky || (joy?.y ?? 0); // 键盘优先，没按键时用摇杆
      const fl = fishingRodOut(fishLockState(this)); // 钓鱼沉浸：会打断钓鱼的界面快捷键先不响应（背包 I、地图 M、钓鱼图鉴 G、聊天 Enter、缩放照常）
      if (this.player.sitting && (ix !== 0 || iy !== 0)) standUp(this); // 坐着时一推方向就起身
      if ((this.fishPhase === 'wait' || this.fishPhase === 'bite') && (ix !== 0 || iy !== 0)) { this.net.fishCancel(); stopFishing(this); } // 钓鱼时一走动就收线
      this.player.update(dt, ix, iy, k.shift.isDown || (joy?.run ?? false), this.world);
      mainHotkeys(this, k, fl);
      updateInteraction(this);
    }
    if (this.player.takeCrash()) onBikeCrash(this); // 骑车撞墙：镜头抖一下，并告诉服务器（成就「墙是实心的」）
    checkDawn(this);
    if (this.paxPid) { const d = this.remotes.get(this.paxPid); if (d) { this.player.x = d.x; this.player.y = d.y; this.player.facing = d.facing; } } // 后座：跟着车主走
    if (this.holdPid) { const d = this.remotes.get(this.holdPid); if (d) { const [ox, oy] = handOffset(d.facing, this.holdSide), [gx, gy] = glide(this.player.x, this.player.y, d.x + ox, d.y + oy, HAND.GLIDE_PXS * dt); this.player.followMove(gx, gy, d.facing, d.moving || Math.hypot(gx - d.x - ox, gy - d.y - oy) > 1, d.running); } } // 被牵着：站在牵手的人身边、跟着走
    drawHandLinks(this);
    this.updateNet(dt, k.shift.isDown || (joy?.run ?? false));
    updateBuildingFade(this);
    updateClock(this, dt);
    updateAudio(this, dt);
    this.runUi.tick(); drawRunMark(this);
    updatePlace(this);
    updateBoardEntry(this);
    this.hud.setPlayerOnMap(this.player.x / TILE, this.player.y / TILE);
    this.touchPress = false;
  }
}
