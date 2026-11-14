/** 面板与网络回调的接线（原 WorldScene.setupSocial）+ 全局 Esc 登记。执行顺序和原来完全一致。 */
import Phaser from 'phaser';
import { FISHING_BLOCK_MSG, fishingBlocksUi } from '@/systems/fishlock';
import { TILE } from '@/core/const';
import { type Profile } from '@/shared/profile';
import { saveProfile, getToken } from '@/core/profileStore';
import { NetClient, defaultWsUrl } from '@/net/client';
import { ProfilePanel } from '@/ui/ProfilePanel';
import { ChatPanel } from '@/ui/ChatPanel';
import { ReportDialog } from '@/ui/ReportDialog';
import { isTouchDevice } from '@/ui/TouchControls';
import { mountImmersive } from '@/ui/Immersive';
import { BoardPanel } from '@/ui/BoardPanel';
import { ShopPanel } from '@/ui/ShopPanel';
import { WallPanel } from '@/ui/WallPanel';
import { marketDay, resolveGear } from '@/shared/economy';
import { NoticePanel } from '@/ui/NoticePanel';
import { SocialUi } from '@/ui/SocialUi';
import { mountSideButtons, ui } from '@/ui/actions';
import { Cat } from '@/entities/Cat';
import { BackpackPanel } from '@/ui/BackpackPanel';
import { MonPanel } from '@/ui/MonPanel';
import { BattleUi } from '@/ui/BattleUi';
import { TeleportPanel } from '@/ui/TeleportPanel';
import { setDormDefs } from '@/ui/DormPeek';
import { DormPanel } from '@/ui/DormPanel';
import { WorldPanel } from '@/ui/WorldPanel';
import { HandUi } from '@/ui/HandUi';
import { CatPanel } from '@/ui/CatPanel';
import { BackupPanel } from '@/ui/BackupPanel';
import { AchievementPanel } from '@/ui/AchievementPanel';
import { TitlePanel } from '@/ui/TitlePanel';
import { EmotePanel } from '@/ui/EmotePanel';
import { PhotoMode } from '@/ui/PhotoMode';
import { emoteDef } from '@/shared/emotes';
import { Character } from '@/entities/Player';
import { SettingsPanel } from '@/ui/SettingsPanel';
import { mountWatermark } from '@/ui/AboutPanel';
import { QuestPanel } from '@/ui/QuestPanel';
import { CalendarPanel } from '@/ui/CalendarPanel';
import { festData } from '@/ui/festivalData';
import { escStack, installEscStack, type EscTarget } from '@/ui/escstack';
import { festivalByCode } from '@/shared/calendar';
import { RunPanel } from '@/ui/RunPanel';
import { AdminPanel } from '@/ui/AdminPanel';
import { PartyPanel } from '@/ui/PartyPanel';
import { CodexPanel } from '@/ui/CodexPanel';
import { HallPanel } from '@/ui/HallPanel';
import { PlacePanel, closeLightbox, lightboxOpen } from '@/ui/PlacePanel';
import { FarmPanel } from '@/ui/FarmPanel';
import { TradePanel } from '@/ui/TradePanel';
import { FishFightUi } from '@/ui/FishFightUi';
import { FishCard } from '@/ui/FishCard';
import { BoxPanel } from '@/ui/BoxPanel';
import { fishData } from '@/ui/fishData';
import { questDef } from '@/shared/quests';
import { sfx } from '@/audio/sfx';
import { titleDef } from '@/shared/titles';
import { ACH_TOTAL, achDef } from '@/shared/achievements';
import { allCats } from '@/shared/cats';
import type { CatBridge, DormCatFx } from '@/systems/dormcats';
import { itemDef } from '@/shared/items';
import { seasonAt, weatherAt } from '@/shared/season';
import { isNightAt } from '@/shared/clock';
import { cycleHeld, doEmote, setupAudio, takePhoto } from './actions';
import { changeZoom } from './camera';
import { catAction, closeCat, refreshCatPanel } from './cats';
import { addDropped, clearDropped } from './entities';
import { fishBlocked, fishLockState, onFishState } from './fishing';
import { setupPlaceBtn } from './place';
import { enterDorm, enterFarm, enterFarmTree, enterFloor } from './transitions';
import type { WorldScene } from '../WorldScene';

export function wireSocialCore(sc: WorldScene, profile: Profile) {
  sc.backupUi = new BackupPanel();
  sc.profileUi = new ProfilePanel(sc.textures, profile, () => sc.editProfile(), () => sc.backupUi.open('show'), () => sc.achUi.open(), () => sc.titleUi.open(), () => sc.settingsUi.open('about'));
  sc.profileUi.setAch(0, ACH_TOTAL);
  sc.net = new NetClient(defaultWsUrl(), getToken(), () => sc.profileUi.profile);
  sc.reportUi = new ReportDialog(sc.net); // 举报弹窗：公屏 / 私聊 / 留言板 / 校园墙 / 玩家资料共用
  sc.chatUi = new ChatPanel(sc.net);
  sc.chatUi.onUnread = (n) => { sc.chatUnread = n; sc.touchUi?.setChatBadge(n); }; // 手机底部「聊天」按钮的未读角标（只算没静音的频道）
  sc.chatUi.onFocus = () => sc.input.keyboard!.resetKeys();
  sc.boardUi = new BoardPanel(sc.net, (uid, ctx) => sc.adminUi.openUserMenu(uid, ctx));
  sc.wallUi = new WallPanel(sc.net);
  sc.placeUi = new PlacePanel(sc.net);
  setupPlaceBtn(sc);
  sc.noticeUi = new NoticePanel(sc.net, (title) => { sc.hud.banner('📢 新公告', title); sc.net.system(`📢 新公告：${title}（点「公告」查看）`); });
  setDormDefs(() => sc.cache.json.get('interiors'));
  sc.socialUi = new SocialUi(sc.net, sc.textures, (t) => { if (!t.startsWith('💬')) sc.hud.banner('👥 好友', t); sc.net.system(t); sfx('notify'); });
  sc.chatUi.onNameClick = (uid, ctx) => { if (sc.net.isAdmin) sc.adminUi.openUserMenu(uid, ctx); else sc.socialUi.showPlayer(uid); }; // 管理员点名字：禁言/撤回/封禁菜单；普通玩家：资料卡
  sc.chatUi.admin = () => sc.net.isAdmin;
}

export function wirePartyRun(sc: WorldScene) {
  sc.partyUi = new PartyPanel(sc.net, {
    friends: () => sc.socialUi.friendList,
    note: (title, text) => { sc.hud.banner(title, text); sc.net.system(`${title}：${text}`); },
    beep: () => sfx('notify'),
  });
  sc.runUi = new RunPanel(sc.net, {
    friends: () => sc.socialUi.friendList as never,
    beep: (k) => sfx(k === 'count' ? 'count' : k === 'go' ? 'go' : k === 'finish' ? 'finish' : 'notify'),
    note: (title, text) => { sc.hud.banner(title, text); sc.net.system(`${title}：${text}`); },
  });
}

export function wireBackpackShop(sc: WorldScene) {
  fishData.attach(sc.net); // 钓鱼图鉴记录 / 装备图鉴：几个面板共用
  fishData.env = () => { const t = Date.now() + sc.clock.offset; return { night: isNightAt(t), rain: weatherAt(t).kind === 'rain', season: seasonAt(t) }; };
  sc.backpackUi = new BackpackPanel(sc.net, sc.textures, (gains) => {
    const text = gains.map((g) => `${itemDef(g.id)?.name ?? g.id} ×${g.n}`).join('、');
    sc.hud.banner('🎒 获得物品', text); sc.net.system(`🎒 获得：${text}`); sfx('pickup');
  }, () => sc.codexUi.open('fish'));
  sc.boxUi = new BoxPanel(sc.net, sc.textures, () => sc.backpackUi.inv);
  sc.backpackUi.onOpenBox = (id, n) => sc.boxUi.open(id, n);
  sc.backpackUi.openLevel = () => { sc.backpackUi.close(); sc.codexUi.openFishSub('level'); };
  sc.net.handlers.releaseResult = (m) => { sc.hud.banner(m.ok ? '🌊 放生' : '放生失败', m.msg); sc.net.system(m.ok ? `🌊 ${m.msg}` : m.msg); if (m.ok) sfx('pickup'); };
  // 钓鱼升级：横幅 + 系统消息；升到 5 / 10 级提示去选路线
  fishData.onLevelUp = (m) => {
    const up = m.up!, text = `Lv.${up.from} → Lv.${up.to}：${up.coins} 校园币${up.items.map((g) => `、${itemDef(g.id)?.name ?? g.id} ×${g.n}`).join('')}`;
    sc.hud.banner('🎣 钓鱼升级！', text); sc.net.system(`🎣 钓鱼升到 Lv.${up.to}（${text}）`); sfx('achieve');
    if ((up.from < 5 && up.to >= 5) || (up.from < 10 && up.to >= 10)) window.setTimeout(() => { sc.hud.banner('🎣 解锁了新的路线槽', '在图鉴的「等级」页选择：渔夫（卖鱼价 +10%）或寻宝（盲盒 ×1.3）'); }, 3200);
  };
  sc.shopUi = new ShopPanel(sc.net, sc.textures, () => marketDay(Date.now() + sc.clock.offset), { openQuests: (tab) => sc.questUi.open(tab) }); // 钓具摊的「📋 钓鱼委托」：打开任务面板的钓鱼页
  sc.registry.set('shopUi', sc.shopUi); // 农场里的「农场管理员」（室内场景）要用：按 E 打开买种子 / 卖菜
  sc.fightUi = new FishFightUi();
  sc.fishCard = new FishCard(sc.textures);
  sc.fishCard.onRelease = (id) => sc.net.fishRelease(id);
  sc.monUi = new MonPanel(sc.net);
  sc.backpackUi.attachMons(sc.monUi); // 精灵并入背包的「精灵」页（按 R 直达）
}

export function wireHand(sc: WorldScene) {
  sc.battleUi = new BattleUi(sc.net);
  sc.handUi = new HandUi(sc.net);
  sc.handUi.onNote = (title, text) => { sc.hud.banner(title, text); sc.net.system(`${title}：${text}`); };
  sc.handUi.onRole = (role, pid, side) => { const was = sc.holdPid; sc.holdPid = role === 'follow' ? pid : 0; sc.holdSide = side; sc.player.led = role === 'follow'; if (role !== 'none' && !(was && was === sc.holdPid)) sfx('pickup'); };
  sc.net.handlers.handPairs = (list) => { sc.handPairs = list; };
  sc.handG = sc.add.graphics().setDepth(100000);
}

export function wireWorld(sc: WorldScene) {
  // 校园农场：一块独立的私人空间（和宿舍一样传送进去），面板负责翻土/播种/浇水/收获与访客
  sc.farmUi = new FarmPanel(sc.net, sc.textures, {
    friends: () => sc.socialUi.friendList.map((f) => ({ uid: f.uid, name: SocialUi.label(f) })),
    season: () => seasonAt(Date.now() + sc.clock.offset),
    inv: () => sc.backpackUi.inv,
    // 第一次收获：土里翻出一颗"不像种子"的种子，给以后的「特殊种子 → 植物精灵」留钩子（只弹一次，本机记）
    harvested: (() => {
      let fired = false; // 连收好几块地时只弹一次（不等 localStorage，避免 600ms 内重复排队）
      return () => {
        if (fired) return;
        let seen = true; try { seen = !!localStorage.getItem('pixelcampus.farmSeedHint'); } catch { /* 存储不可用就当看过了，别反复打扰 */ }
        if (seen) return;
        fired = true;
        window.setTimeout(() => { // 等收获的那条结果先显示出来，再弹旁白
          try { localStorage.setItem('pixelcampus.farmSeedHint', '1'); } catch { /* 忽略 */ }
          sc.hud.openDialog('土里的东西', [
            '（菜拔出来那一下，手感不对——根须底下连着一团土，捏在手里是温的。）',
            '（掰开土块，滚出一颗灰扑扑的种子。它比寻常种子沉得多，放在掌心，还顶了一下你的手。）',
            '（你把它压进种子袋最底层。合上袋口前，你看见它探出一小截根，像脚一样，在地上蹬了蹬。）',
          ]);
        }, 600);
      };
    })(),
  });
  sc.tpUi = new TeleportPanel(sc.net, (floor, id, viaTree) => {
    if (viaTree) sc.hud.banner('🌳 大树洞', '钻过去了……'); else sc.hud.banner('📍 传送', '到啦'); sfx('go');
    if (id === 'farm') { (viaTree ? enterFarmTree : enterFarm)(sc); return; } // 传到农场：进入私人农场空间（从大树洞钻的用树洞版：慢暗 → 黑一拍 → 暖光亮起）
    const it = sc.scene.isActive('Interior') ? (sc.scene.get('Interior') as unknown as { teleportOut?: (f?: string) => void }) : null; // 在室内（宿舍/教室）里点传送：先退出室内再进楼层
    if (it?.teleportOut) it.teleportOut(floor); else if (floor) enterFloor(sc, floor);
  }); // 选了某一层：到门口后直接进那一层
  sc.worldUi = new WorldPanel(sc.net, { friends: () => sc.socialUi.friendList, locOf: (u) => sc.socialUi.locOf(u) });
  sc.socialUi.onWorld = (uid) => sc.worldUi.openFor(uid); sc.socialUi.onLocs = () => sc.worldUi.refresh();
  sc.worldUi.onChange = (kind) => { // 换了世界：旧世界里的人物、公屏都不是这个世界的了（服务器会补发这个世界的单车/小猫/牵手/公屏记录）
    for (const r of sc.remotes.values()) r.destroy(); sc.remotes.clear(); sc.paxPid = 0; sc.holdPid = 0;
    sc.chatUi.clear();
    sc.hud.banner(kind === 'solo' ? '🏠 个人世界' : kind === 'group' ? '👥 好友世界' : '🌍 公共世界', kind === 'solo' ? '这里只有你一个人' : kind === 'group' ? '只有你们几位好友' : '回到了大家中间'); sfx('go');
  };
}

export function wireDorm(sc: WorldScene) {
  sc.dormUi = new DormPanel(sc.net);
  { const h = sc.net.handlers, pd = h.dormData, pr = h.dormResult; // 接回 / 送回宿舍后：小猫面板的按钮状态和结果文字也要跟着刷新
    h.dormData = (m) => { pd?.(m); refreshCatPanel(sc); };
    h.dormResult = (ok, msg, wake) => { pr?.(ok, msg, wake); if (sc.dormCatAwait) { sc.dormCatAwait = false; if (sc.catUi?.isOpen) sc.catUi.say(msg, ok); } };
  }
  sc.net.handlers.dormIn = (x, y) => { sc.registry.set('dormVisit', null); enterDorm(sc, x, y); };
  sc.net.handlers.dormVisit = (m) => { sc.registry.set('dormVisit', m); enterDorm(sc, sc.player.x, sc.player.y); }; // 去好友的宿舍做客：出来时回到现在站的地方
  sc.registry.set('net', sc.net); sc.registry.set('dormUi', sc.dormUi); sc.registry.set('farmUi', sc.farmUi); sc.registry.set('chat', sc.chatUi); sc.registry.set('editProfile', () => sc.editProfile(true)); sc.registry.set('tpUi', sc.tpUi); // 宿舍（室内场景）要用
  sc.battleUi.onOpen = () => closeCat(sc); // 对战开始：收起和小猫互动的小面板
  sc.monUi.onData = () => { refreshCatPanel(sc); sc.backpackUi.refreshTabs(); sc.codexUi?.refresh(); };
  { const prev = sc.net.handlers.monResult; sc.net.handlers.monResult = (ok, msg) => { prev?.(ok, msg); if (sc.catUi?.isOpen) sc.catUi.say(msg, ok); }; }
}

export function wireHallTradeCodex(sc: WorldScene) {
  sc.hallUi = new HallPanel(sc.net, { showPlayer: (uid) => sc.socialUi.showPlayer(uid), selfUid: () => sc.net.selfUid });
  sc.tradeUi = new TradePanel(sc.net, sc.textures, {
    inv: () => sc.backpackUi.inv, coins: () => sc.coinBal,
    note: (title, text) => { sc.hud.banner(title, text); sc.net.system(`${title}：${text}`); },
    beep: (k) => sfx(k === 'done' ? 'achieve' : 'notify'),
  });
  sc.socialUi.onTrade = (uid) => sc.tradeUi.invite(uid);
  sc.socialUi.onHand = (uid) => sc.net.handInvite(uid);
  sc.socialUi.onDorm = (uid, kind) => (kind === 'invite' ? sc.net.dormInvite(uid) : sc.net.dormKnock(uid));
  sc.codexUi = new CodexPanel(sc.net, sc.textures, { cats: () => ({ defs: allCats(sc.wf.npcSpawns), aff: sc.catAff, nicks: sc.catNick, info: sc.catInfo }), inv: () => sc.backpackUi.inv, gear: () => { const g = resolveGear(sc.backpackUi.inv, sc.backpackUi.equip, fishData.env()); return { rod: g.rod?.id ?? '', bait: g.bait?.id ?? '' }; }, mons: () => sc.monUi.monData });
}

export function wireProgressPanels(sc: WorldScene) {
  sc.achUi = new AchievementPanel(sc.net, {
    onNew: (ids) => { for (const id of ids) { const a = achDef(id); if (!a) continue; sc.hud.banner('🏆 成就达成', a.name); sc.net.system(`🏆 成就达成：${a.name}`); sfx('achieve'); } },
    onCount: (n) => sc.profileUi.setAch(n, ACH_TOTAL),
  });
  sc.questUi = new QuestPanel(sc.net, {
    onDone: (ids) => { for (const id of ids) { const q = questDef(id); if (q) { sc.hud.banner('📋 任务完成', q.name); sc.net.system(`📋 任务完成：${q.name}`); sfx('catch'); } } },
  });
  sc.calUi = new CalendarPanel({ now: () => Date.now() + sc.clock.offset, wear: (c) => { if (sc.net.status === 'online') sc.net.fzSet(c); else sc.hud.banner('离线中', '连上服务器才能换节日装扮'); } });
  sc.adminUi = new AdminPanel(sc.net, sc.textures, { openMap: () => { if (!sc.hud.mapOpen) sc.hud.toggleMap(); }, showCard: (uid) => sc.socialUi.showPlayer(uid), openPlaceThread: (id) => sc.placeUi.openThread(id), placeOpen: () => sc.placeUi.isOpen || lightboxOpen() });
  // 管理员：大地图上点哪里就传送到哪里（服务器会再检查是不是管理员，并把落点挪到能站的地方）
  sc.net.onAdmin((ok) => sc.hud.setMapPicker(ok ? (tx, ty) => { sc.net.adm({ op: 'tp', x: tx * TILE, y: ty * TILE }); if (sc.hud.mapOpen) sc.hud.toggleMap(); } : null));
  sc.settingsUi = new SettingsPanel(sc.net, sc.chatUi, { // 声音 / 聊天频道 / 沉浸模式 / 全屏 / 小地图 / 账号与备份 / 关于 都在「设置」里
    miniMap: { on: () => sc.hud.miniMapOn, set: (on) => sc.hud.setMiniMap(on) },
    card: () => sc.profileUi.open(), editProfile: () => sc.editProfile(), backup: () => sc.backupUi.open('show'), achievements: () => sc.achUi.open(), titles: () => sc.titleUi.open(),
  });
  mountWatermark();
  setupAudio(sc);
  sc.emoteUi = new EmotePanel((id) => doEmote(sc, id));
  sc.registry.set('emoteUi', sc.emoteUi); // 宿舍（室内场景）里按 X 也能打开
  sc.photo = new PhotoMode({
    enter: () => { sc.input.keyboard!.resetKeys(); sc.cameras.main.stopFollow(); },
    exit: () => { sc.cameras.main.startFollow(sc.player.sprite, true, 0.14, 0.14); Character.hideTags = false; },
    shoot: () => takePhoto(sc),
    zoom: (d) => changeZoom(sc, d),
    tags: (hidden) => { Character.hideTags = hidden; },
  });
  sc.titleUi = new TitlePanel(sc.net);
  sc.codexUi.attach('ach', '成就', sc.achUi); sc.codexUi.attach('titles', '称号', sc.titleUi); // 成就、称号并入图鉴（J 直达成就页）
  sc.net.onAdmin((ok) => sc.titleUi.setAdmin(ok));
}

export function wireCatPanel(sc: WorldScene) {
  sc.catUi = new CatPanel({
    pet: () => catAction(sc, 'pet'), feed: (item, fishId) => catAction(sc, 'feed', item, fishId), close: () => closeCat(sc),
    follow: (on) => { const c = sc.catUi.current; if (c) sc.net.catFollowCmd(c.id, on); },
    nick: (name) => { const c = sc.catUi.current; if (c) sc.net.catNick(c.id, name); },
    hug: () => { const c = sc.catUi.current; if (c) sc.net.catHug(c.id); },
    tame: () => { const c = sc.catUi.current; if (c) sc.net.catTame(c.id); },
    duel: () => { const c = sc.catUi.current; if (c) sc.net.catBattle(c.id); },
    dorm: (on) => { const c = sc.catUi.current; if (c) { sc.dormCatAwait = true; sc.net.dormCat(c.id, on); } },
  }, sc.textures);
  { // 养在宿舍的小猫：宿舍场景用这座"桥"拿猫的资料 / 好感度、打开同一个小猫面板（宿舍里的猫是另一只 Cat 实体，数据都在这里）
    const bridge: CatBridge = {
      def: (id) => sc.cats[id]?.def, aff: (id) => sc.catAff[id] ?? 0, nick: (id) => sc.catNick[id],
      open: (id) => { const c = sc.cats[id]; if (!c) return; sc.catUi.open(c.def); sc.hud.hint(null); refreshCatPanel(sc); },
      panel: () => ({ isOpen: sc.catUi.isOpen, id: sc.catUi.current?.id }),
    };
    sc.registry.set('catBridge', bridge);
  }
}

export function wireMenus(sc: WorldScene) {
  sc.net.handlers.chatHistory = (items) => sc.chatUi.addHistory(items);
  sc.net.handlers.chatRecall = (mids) => { sc.chatUi.recall(mids); sc.adminUi?.onRecall(); };
  // 点场景里的玩家 → 资料卡（加好友 / 私聊）。点在界面上的不会到这里
  sc.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => { if (!sc.anyOverlay()) sc.pickPlayerAt(ptr.worldX, ptr.worldY); });
  // 手机菜单里的地图 / 学生证（电脑上用 M / C 键和左上角头像）
  ui.add({ id: 'held', label: '手持物', key: 'V', desktop: false, run: () => cycleHeld(sc) });
  ui.add({ id: 'map', label: '地图', desktop: false, run: () => sc.hud.toggleMap() });
  ui.add({ id: 'card', label: '学生证', desktop: false, run: () => sc.profileUi.toggle() });
  ui.guard = (a) => (fishingBlocksUi(fishLockState(sc), a.id) ? FISHING_BLOCK_MSG : null); // 钓鱼中：会打断钓鱼的菜单入口不响应（背包、地图、声音等仍可用）
  ui.onBlocked = () => fishBlocked(sc);
  mountSideButtons();
  mountImmersive(); // 沉浸模式：藏起所有界面，只剩画面（菜单「沉浸模式」/ Z / 右上角 ⤢）
  registerEsc(sc);
}

export function wireChatBubbles(sc: WorldScene) {
  sc.net.onMessage((m) => {
    if (m.kind === 'broadcast') { sc.hud.broadcast('🎣 全服播报', m.text, m.tone); sfx('achieve'); return; }
    if (m.kind !== 'chat') return;
    const style = sc.chatUi.bubbleOf(m); if (!style) return; // 静音 / 关闭的频道不冒气泡
    (sc.registry.get('roomSay') as ((pid: number, text: string) => void) | null | undefined)?.(m.pid as number, m.text); // 人在宿舍里时，话冒泡在宿舍里的人头上
    if (m.pid !== undefined && m.pid === sc.net.selfId) sc.player.say(m.text, undefined, style);
    else if (m.pid !== undefined) sc.remotes.get(m.pid)?.say(m.text, undefined, style);
    else if (m.from === sc.profileUi.profile.name) sc.player.say(m.text, undefined, style); // 离线回显
  });
}

export function wireNetPlayer(sc: WorldScene) {
  const h = sc.net.handlers;
  h.welcome = (_id, x, y) => {
    sc.monUi.refresh();   // 连上（或重连）后取一次精灵数据，菜单上的红点要靠它
    if (sc.heldId) sc.net.held(sc.heldId);   // 重连后把手里的东西再告诉服务器
    sc.player.setRiding(false); sc.player.setSitting(false); sc.player.setFishing(false); sc.fishPhase = 'idle'; sc.fightUi.close(); sc.paxPid = 0; sc.player.setPassenger(false); sc.holdPid = 0; sc.player.led = false; sc.handPairs = []; // 新会话从"没骑车、没坐着"开始（服务器也是这么认为的）
    sc.profileUi.setUid(sc.net.selfUid); sc.player.x = x; sc.player.y = y; sc.lastSent = { x: -1, y: -1, flags: -1 }; sc.cameras.main.centerOn(x, y);
    try { if (!localStorage.getItem('pixelcampus.backupHint')) { localStorage.setItem('pixelcampus.backupHint', '1'); sc.net.system('💾 建议备份身份：点左上角头像 →「身份备份」，抄下备份码。清了浏览器数据或换设备，也能找回好友和背包。'); } } catch { /* 存储不可用：不提示 */ }
  };
  h.profileFix = (p) => { // 服务器说资料里有不适合的内容：换上服务器给的资料（昵称/学院/专业/签名）
    saveProfile(p); sc.registry.set('profile', p); sc.profileUi.set(p); sc.player.setLook(p.look, p.app); sc.player.setNameTag(p.name, '#ffe9a0');
  };
  h.friendOn = (_uid, name) => sc.net.system(`🟢 您的好友 ${name} 上线了`); // 只有互为好友的才收到，不是公屏广播
  h.spawn = (id, uid, x, y, flags, p, ttl, held, fz, pose) => sc.upsertRemote(id, uid, x, y, flags, p, ttl, held, fz, pose);
  h.held = (pid, hv) => sc.remotes.get(pid)?.setHeld(hv);
  h.fz = (pid, c) => sc.remotes.get(pid)?.setFz(c);
  h.fzState = (own, on, news, gift) => { // 自己的节日装扮：获得了哪些 / 戴着哪个
    festData.set(own, on); sc.player.setFz(on);
    for (const c of news ?? []) { const f = festivalByCode(c); if (f) { sc.hud.banner(`${f.icon} 获得节日装扮`, `${f.costume.name}（日历 · 节日里可以穿上）`); sfx('achieve'); } }
    for (const g of gift ?? []) sc.net.system(`🎁 节日礼物：${itemDef(g.id)?.name ?? g.id} ×${g.n}`);
  };
  h.titles = (own, sel, fresh) => {
    sc.titleUi.set(own, sel); sc.profileUi.setTitle(sel);
    const t = titleDef(sel); sc.player.setTitle(t ? { name: t.name, color: t.color } : undefined);
    for (const id of fresh ?? []) { const d = titleDef(id); if (d) { sc.hud.banner('🎖 获得称号', d.name); sc.net.system(`🎖 获得称号：${d.name}（学生证 →「称号」可以佩戴）`); sfx('title'); } }
  };
  h.despawn = (id) => { sc.remotes.get(id)?.destroy(); sc.remotes.delete(id); };
  h.snapshot = (entries, now) => { for (const e of entries) sc.remotes.get(e.id)?.push(e.x, e.y, e.flags, now); };
  h.correct = (x, y) => { const far = Math.hypot(sc.player.x - x, sc.player.y - y) > 240; sc.player.x = x; sc.player.y = y; sc.player.halt(); sc.lastSent = { x: -1, y: -1, flags: -1 }; if (far) sc.cameras.main.centerOn(x, y); }; // 被服务器"传送"（比如校园跑接受邀请）：离得远就直接把镜头拉过去
  h.sitResult = (ok, msg) => { if (!ok) { sc.player.setSitting(false); sc.hud.banner('🪑 长椅', msg ?? '现在不能坐下'); } };
  h.emote = (pid, e) => { const d = emoteDef(e); if (!d) return; if (pid === sc.net.selfId) { sc.player.emote(d); sfx('emote'); } else sc.remotes.get(pid)?.emote(d); };
  h.emoteEnd = (pid) => { if (pid === sc.net.selfId) sc.player.endPose(); else sc.remotes.get(pid)?.endPose(); };
  h.rideResult = (ok, msg) => { if (!ok) { sc.player.setRiding(false); sc.hud.banner('🚲 共享单车', msg ?? '现在不能骑车'); } };
}

export function wireNetWorld(sc: WorldScene) {
  const h = sc.net.handlers;
  h.cats = (aff, beds, info, gifts) => {
    sc.catAff = aff; if (beds) { sc.catBeds = new Set(beds); for (const c of sc.cats) c.setBed(sc.catBeds.has(c.def.id)); }
    sc.catInfo = info ?? {}; if (gifts) sc.catGifts = gifts;
    refreshCatPanel(sc); sc.codexUi.refresh();
  };
  h.wallPending = (n) => { sc.hud.banner('📝 校园墙', `有新帖等待审核（共 ${n} 条）`); sfx('notify'); };
  h.coins = (n, gain) => {
    sc.coinBal = n; sc.hud.setCoins(n); sc.shopUi.setCoins(n);
    if (gain) { sc.hud.banner('🪙 校园币', `+${gain}`); sfx('pickup'); }
  };
  h.binResult = (m) => {
    if (!m.ok) { sc.hud.banner('🗑 垃圾桶', m.msg); sfx('lock'); return; }
    if (m.treasure) { sc.hud.banner('🗑 垃圾桶里居然有宝贝！', m.msg); sc.net.system(`🗑 ${m.msg}`); sfx('achieve'); }
    else { sc.hud.banner('🗑 翻垃圾桶', `${m.msg}${m.left !== undefined ? `（今天还能翻 ${m.left} 次）` : ''}`); sfx('pickup'); }
    if (m.left !== undefined) sc.binLeft = m.left;
  };
  h.catNicks = (nicks) => { sc.catNick = nicks; for (const c of sc.cats) c.nick = nicks[c.def.id]; refreshCatPanel(sc); sc.codexUi.refresh(); };
  h.catFollows = (map) => { sc.catWith = new Map(Object.entries(map).map(([k, v]) => [Number(k), v])); refreshCatPanel(sc); };
  h.catFollow = (id, pid) => { if (pid) sc.catWith.set(id, pid); else sc.catWith.delete(id); refreshCatPanel(sc); };
  h.birdResult = (m) => { if (m.ok) { sc.lakeBirds?.byId(m.id)?.feed(); sfx('feed'); } sc.hud.banner(m.ok ? '🦆 喂水禽' : '🦆 水禽', m.msg); };
  h.catMsg = (ok, msg) => { if (sc.catUi.isOpen) sc.catUi.say(msg, ok); else sc.hud.banner('🐱 小猫', msg); };
  h.catResult = (id, kind, r) => {
    sc.catUi.result(id, kind, r);                                  // 记进这只猫的操作记录（当前这只猫同时更新 msg 区）
    if (sc.catUi.current?.id === id && r.ok) sc.catUi.started(kind);
    if (!r.ok) return;
    const c = sc.cats[id];
    if (kind === 'pet') { c?.pet(); sfx('pet'); }
    else if (kind === 'hug') { c?.hug(sc.player.x, sc.player.y); sfx('pet'); }
    else { c?.eat(); sfx('feed'); }
    if (r.loved) { c?.loved(); sfx('catch'); }                       // 喂到最爱：一串爱心
    if (r.leveled) { c?.leveledUp(); sfx('achieve'); }               // 升档：更多爱心
    if (r.gift) c?.giftMeow();                                       // 有回礼：喵一声（物品由背包的"获得物品"横幅提示）
    (sc.registry.get('dormCatFx') as DormCatFx | undefined)?.(id, kind, r); // 在宿舍里互动的话，宿舍里那只猫也要有反应
  };
  const onInv = h.inv; h.inv = (items, gain) => { onInv?.(items, gain); sc.shopUi.setInv(items); refreshCatPanel(sc); };
  h.disconnected = () => { for (const r of sc.remotes.values()) r.destroy(); sc.remotes.clear(); sc.player.setFishing(false); sc.fishPhase = 'idle'; sc.fightUi.close(); clearDropped(sc); };
  h.fishState = (m) => onFishState(sc, m);
  h.time = (now) => sc.clock.sync(now); // 校准到服务器时间：全服的时间、昼夜都一样
  h.paxResult = (ok, pid, msg) => {
    if (ok && pid > 0) { sc.paxPid = pid; sc.player.setPassenger(true); sc.hud.banner('🚲 坐上了队友的车', '按 E 下车'); sfx('bell'); }
    else { sc.paxPid = 0; sc.player.setPassenger(false); if (msg) sc.hud.banner('🚲 同骑单车', msg); if (ok) sfx('lock'); }
  };
  h.bikeDrops = (list) => { clearDropped(sc); for (const b of list) addDropped(sc, b); };
  h.bikeDrop = (b) => addDropped(sc, b);
  h.bikeGone = (id) => { const d = sc.droppedBikes.get(id); if (d) { d.img.destroy(); sc.droppedBikes.delete(id); } };
  h.catNames = (names) => { for (const [id, n] of Object.entries(names)) { const c = sc.cats[Number(id)]; if (c) c.def.name = n; } refreshCatPanel(sc); }; // 管理员给小猫改了名
}

export function wireWelcome(sc: WorldScene) {
  if (isTouchDevice()) {
    sc.net.system('欢迎来到河北工程大学！左半屏按住拖动 = 走路（推到边缘奔跑），点右下角「互动」「聊天」「证」「地图」。');
  } else {
    sc.net.system('欢迎来到河北工程大学！按 Enter 说话，Esc 退出输入。');
    sc.net.system('WASD 移动 · Shift 奔跑 · E 互动 · I 背包 · R 精灵 · Y 传送 · Q 任务 · X 表情 · V 手持物 · P 拍照 · Z 沉浸 · C 学生证 · M 地图 · +/- 缩放');
  }
  // ?offline 可关掉联机（开发调试：传送等操作会被服务器校验拉回）
  if (!new URLSearchParams(location.search).has('offline')) sc.net.connect();
  else sc.net.system('离线调试模式（?offline）：没有连接服务器。');
}

/** 一次接好所有面板和网络回调（顺序同原 setupSocial） */
export function wireSocial(sc: WorldScene, profile: Profile) {
  wireSocialCore(sc, profile);
  wirePartyRun(sc);
  wireBackpackShop(sc);
  wireHand(sc);
  wireWorld(sc);
  wireDorm(sc);
  wireHallTradeCodex(sc);
  wireProgressPanels(sc);
  wireCatPanel(sc);
  wireMenus(sc);
  wireChatBubbles(sc);
  wireNetPlayer(sc);
  wireNetWorld(sc);
  wireWelcome(sc);
}

/**
 * 全局 Esc：把所有会"调出来"的面板登记进 escStack，Esc 一次关最上面（最后打开）的一个（见 ui/escstack.ts）。
 * 新面板怎么接入：有 isOpen（getter）和 close() 就 `reg(面板)`；Esc 要特殊处理（先关子页 / 取消）就再给它一个 escape()。
 * 不在这里的（对话框、拉鱼取消、装修模式、战斗、建角色）由各自原有的 Esc 逻辑处理。
 */
export function registerEsc(sc: WorldScene) {
  const reg = (t: EscTarget) => escStack.register(t);
  for (const p of [sc.profileUi, sc.boardUi, sc.shopUi, sc.wallUi, sc.placeUi, sc.noticeUi, sc.socialUi, sc.backpackUi, sc.boxUi, sc.codexUi, sc.backupUi, sc.questUi, sc.calUi, sc.runUi, sc.partyUi, sc.adminUi, sc.settingsUi, sc.photo, sc.hallUi, sc.tpUi, sc.worldUi, sc.emoteUi, sc.reportUi, sc.dormUi, sc.farmUi]) reg(p as EscTarget);
  const hud = sc.hud, adm = sc.adminUi, trade = sc.tradeUi, cat = sc.catUi, card = sc.fishCard;
  reg({ get isOpen() { return lightboxOpen(); }, close: () => { closeLightbox(); } });                      // 留言图片的大图（灯箱）
  reg({ get isOpen() { return hud.mapOpen; }, close: () => { if (hud.mapOpen) hud.toggleMap(); } });         // 大地图
  reg({ get isOpen() { return adm.userMenuOpen; }, close: () => adm.closeUserMenu() });                    // 管理员点人弹出的小菜单
  reg({ get isOpen() { return trade.isOpen; }, close: () => trade.escape() });                             // 交易：Esc = 取消
  reg({ get isOpen() { return cat.isOpen; }, close: () => closeCat(sc) });                              // 小猫面板：要走 closeCat（猫恢复自由、人站起来）
  reg({ get isOpen() { return card.isOpen && sc.fishPhase !== 'fight'; }, close: () => card.hide() });    // 钓到鱼的小卡片（拉鱼时 Esc 仍是放弃，不被它抢走）
  installEscStack();
}
