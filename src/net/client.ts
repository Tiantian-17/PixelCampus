import { cleanChatText, type ChatMessage } from '@/shared/chat';
import { DEFAULT_CHANNEL_STATES, OFFLINE_CHANNEL_STATES, type ChannelId, type ChannelState } from '@/shared/channels';
import { hueOf, type Profile } from '@/shared/profile';
import type { BoardItem } from '@/shared/board';
import type { WallComment, WallPost, WallSort } from '@/shared/wall';
import type { PlaceComment, PlacePost } from '@/shared/place';
import type { Notice } from '@/shared/notice';
import type { ChatHistoryItem, DmMsg, FriendInfo, PersonInfo } from '@/shared/social';
import type { Gain, Inv } from '@/shared/items';
import type { DormCard } from '@/shared/dorm';
import type { CatInfo, CatResult } from '@/shared/cats';
import type { AchEvent } from '@/shared/achievements';
import type { QuestState } from '@/shared/quests';
import type { FishLog } from '@/shared/fishing';
import type { Equip } from '@/shared/gear';
import type { GearLog } from '@/shared/fishdex';
import type { RunMsg } from '@/shared/run';
import type { FriendLoc } from '@/shared/where';
import type { DroppedBike } from '@/shared/bikes';
import type { PartyMsg } from '@/shared/party';
import { canOp, type AdminCat, type AdminChatItem, type AdminDossier, type AdminFilter, type AdminInfo, type AdminOp, type AdminPlayer, type AdminRole, type AdminWorld, type AuditEntry, type BanEntry } from '@/shared/admin';
import type { ReportKind } from '@/shared/report';
import { PROTOCOL_VERSION, decodeSnapshot, encodeReport, type ClientMsg, type PublicProfile, type RoomWho, type ServerMsg, type SnapEntry } from '@/shared/protocol';
import type { ChatStatus, ChatTransport } from './chat';

export interface NetHandlers {
  welcome?: (id: number, x: number, y: number) => void;
  spawn?: (id: number, uid: number, x: number, y: number, flags: number, p: PublicProfile, ttl?: string, held?: number, fz?: number, pose?: number) => void;
  held?: (pid: number, h: number) => void;
  fz?: (pid: number, c: number) => void;
  fzState?: (own: number[], on: number, news?: number[], gift?: { id: string; n: number }[]) => void;
  despawn?: (id: number) => void;
  snapshot?: (entries: SnapEntry[], now: number) => void;
  correct?: (x: number, y: number) => void;
  /** 与服务器断开（或被踢）：场景据此清掉所有远程玩家 */
  disconnected?: () => void;
  /** 留言板：整页列表 / 新留言 / 发送结果 */
  board?: (items: BoardItem[]) => void;
  boardNew?: (item: BoardItem) => void;
  boardResult?: (ok: boolean, msg: string) => void;
  aboutThanks?: (thanks: string[] | null) => void;
  /** 留言被管理员删除（全员收到） */
  boardDel?: (ids: number[]) => void;
  /** 公告列表（新的在前）；newId = 刚发布的那条（只在发布时有） */
  notices?: (items: Notice[], newId?: number) => void;
  /** 好友面板的全部数据 */
  social?: (friends: FriendInfo[], incoming: PersonInfo[], blocked: PersonInfo[]) => void;
  presence?: (uid: number, online: boolean) => void;
  friendOn?: (uid: number, name: string) => void;
  /** 我现在在哪个世界（进入/切换/成员变化时） / 切换世界的结果 */
  worldState?: (m: Extract<ServerMsg, { t: 'world_state' }>) => void;
  worldResult?: (ok: boolean, msg: string) => void;
  /** 有人邀请我去 TA 的好友世界 / 想加入我的世界 */
  worldAsk?: (uid: number, name: string, kind: 'invite' | 'knock') => void;
  /** 资料里有不适合的内容，服务器给出了改过的资料（或原来的资料） */
  profileFix?: (p: Profile) => void;
  /** 管理员：敏感词过滤的状态 */
  admFilter?: (f: AdminFilter) => void;
  /** 管理员撤回了公屏消息（记录编号）；管理员查询结果：公屏记录 / 私聊 / 玩家详情 / 封禁名单 / 操作记录 */
  chatRecall?: (mids: number[]) => void;
  admChatlog?: (items: AdminChatItem[], more: boolean) => void;
  admDmlog?: (m: Extract<ServerMsg, { t: 'adm_dmlog' }>) => void;
  admInfo?: (i: AdminInfo) => void;
  /** 重发身份备份码的结果（只显示一次） */
  admCode?: (m: Extract<ServerMsg, { t: 'adm_code' }>) => void;
  /** 管理员：找人的结果 / 玩家档案 */
  admHits?: (m: Extract<ServerMsg, { t: 'adm_hits' }>) => void;
  admDossier?: (d: AdminDossier) => void;
  admBans?: (items: BanEntry[]) => void;
  admAudit?: (items: AuditEntry[], more: boolean) => void;
  dm?: (msg: DmMsg) => void;
  dmHistory?: (withUid: number, items: DmMsg[], more: boolean) => void;
  socialResult?: (ok: boolean, msg: string) => void;
  socialNote?: (text: string) => void;
  whois?: (uid: number, info: PersonInfo | null, relation: 'none' | 'self' | 'friend' | 'sent' | 'incoming' | 'blocked', dorm?: DormCard) => void;
  dormLikes?: (uid: number, n: number, liked: boolean, msg?: string) => void;
  /** 进入时收到的公屏最近记录 */
  chatHistory?: (items: ChatHistoryItem[]) => void;
  /** 背包（整份）；gain = 这次新得到的东西 */
  inv?: (items: Inv, gain?: Gain[]) => void;
  /** 我的精灵（整份：出战队伍、精灵背包、图鉴、是否领过初始精灵、可选的初始精灵）与操作结果 */
  mon?: (d: Extract<ServerMsg, { t: 'mon_data' }>) => void;
  monResult?: (ok: boolean, msg: string) => void;
  /** 野外遭遇：草丛里有动静（可迎战/走开）/ 提示失效 / 战斗状态（权威状态 + 这一回合的事件） */
  /** 手拉手：有人想牵我的手 / 全部牵着手的一对（玩家编号）/ 我自己的状态 / 操作结果 */
  handInvite?: (uid: number, name: string) => void;
  handPairs?: (list: { l: number; f: number }[]) => void;
  handMe?: (role: 'lead' | 'follow' | 'none', pid: number, name: string, msg?: string, side?: 1 | -1) => void;
  handResult?: (ok: boolean, msg: string) => void;
  /** 定点传送的结果 */
  tpResult?: (ok: boolean, msg: string) => void;
  /** 宿舍：我的宿舍数据 / 可以进屋了（位置 = 宿舍楼门口）/ 操作结果 */
  dormData?: (m: Extract<ServerMsg, { t: 'dorm_data' }>) => void;
  dormIn?: (x: number, y: number) => void;
  dormOut?: (msg?: string) => void;
  /** 有人邀请我去 TA 的宿舍 / 想来我的宿舍 */
  dormAsk?: (uid: number, name: string, kind: 'invite' | 'knock', title?: string) => void;
  /** 我进了好友的宿舍 */
  dormVisit?: (m: Extract<ServerMsg, { t: 'dorm_visit' }>) => void;
  /** 宿舍里有人进来 / 出去 / 动了 / 屋里的状态变了 */
  roomJoin?: (w: RoomWho) => void;
  roomLeave?: (id: number) => void;
  roomPos?: (id: number, x: number, y: number, flags: number) => void;
  roomState?: (m: Extract<ServerMsg, { t: 'room_state' }>) => void;
  dormResult?: (ok: boolean, msg: string, wake?: boolean) => void;
  monEnc?: (m: Extract<ServerMsg, { t: 'mon_enc' }>) => void;
  monEncEnd?: () => void;
  monBt?: (m: Extract<ServerMsg, { t: 'mon_bt' }>) => void;
  /** 各只小猫对我的好感度（猫编号 → 点数） */
  cats?: (aff: Record<string, number>, beds?: number[], info?: Record<string, CatInfo>, gifts?: { today: number; total: number }) => void;
  /** 校园币余额（gain = 这次刚得到的数量）；商店买卖结果 */
  coins?: (n: number, gain?: number) => void;
  shopResult?: (ok: boolean, msg: string) => void;
  /** 翻垃圾桶的结果；名人堂三张榜；玩家交易：有人邀请我 / 我在等对方 / 报价状态 / 结束 / 一条提示 */
  binResult?: (m: Extract<ServerMsg, { t: 'bin_result' }>) => void;
  hall?: (m: Extract<ServerMsg, { t: 'hall' }>) => void;
  equip?: (eq: Equip) => void;
  /** 钓鱼 2.0：开盲盒的结果 / 合成结果 / 装备图鉴 / 册页奖励结果 */
  boxResult?: (m: Extract<ServerMsg, { t: 'box_result' }>) => void;
  craftResult?: (ok: boolean, msg: string) => void;
  geardex?: (gd: GearLog) => void;
  bundleResult?: (ok: boolean, msg: string, id: string) => void;
  /** 钓鱼 3.0：等级信息 / 钓具老板的委托 / 领委托结果 / 放生结果 */
  fx?: (m: Extract<ServerMsg, { t: 'fx' }>) => void;
  wq?: (m: Extract<ServerMsg, { t: 'wq' }>) => void;
  wqResult?: (ok: boolean, msg: string, id: string) => void;
  releaseResult?: (m: Extract<ServerMsg, { t: 'release_result' }>) => void;
  tradeInvite?: (tid: number, uid: number, name: string) => void;
  tradeWait?: (tid: number, name: string) => void;
  tradeState?: (m: Extract<ServerMsg, { t: 'trade_state' }>) => void;
  tradeEnd?: (tid: number, ok: boolean, msg: string) => void;
  tradeNote?: (msg: string) => void;
  /** 喂水禽的结果 */
  birdResult?: (m: Extract<ServerMsg, { t: 'bird_result' }>) => void;
  /** 校园墙：一页帖子（append = 接在后面）/ 一条帖子和它的评论 / 操作结果 */
  wallPosts?: (items: WallPost[], more: boolean, append: boolean, pending?: number, meta?: { sort?: WallSort; tab?: 'pub' | 'pending'; next?: number; at?: number }) => void;
  wallPending?: (n: number) => void;
  wallThread?: (post: WallPost, comments: WallComment[]) => void;
  wallResult?: (ok: boolean, msg: string) => void;
  /** 地点留言板：上传券 / 一页留言 / 一条留言和评论 / 操作结果 / 管理员总览 / 待审核数 */
  placeUpTicket?: (key: string, ticket: string, url: string) => void;
  placePosts?: (m: Extract<ServerMsg, { t: 'place_posts' }>) => void;
  placeThread?: (post: PlacePost, comments: PlaceComment[]) => void;
  placeResult?: (ok: boolean, msg: string) => void;
  placeAdminList?: (m: Extract<ServerMsg, { t: 'place_admin_list' }>) => void;
  placePending?: (n: number) => void;
  catResult?: (id: number, kind: 'pet' | 'feed' | 'hug', r: CatResult) => void;
  /** 成就：全部解锁记录（成就 id → 时间）；fresh = 这次刚解锁的 */
  ach?: (unlocked: Record<string, number>, fresh?: string[]) => void;
  /** 服务器当前时间（毫秒）：用来校准游戏时钟 */
  time?: (now: number) => void;
  /** 小猫：跟随/取名的提示；我的专属名字；谁带着哪只猫（整份 / 单只变化，pid 0 = 回家）；管理员查看某玩家和小猫的关系 */
  catMsg?: (ok: boolean, msg: string) => void;
  catNicks?: (nicks: Record<string, string>) => void;
  catFollows?: (map: Record<string, number>) => void;
  catFollow?: (id: number, pid: number) => void;
  admPcats?: (m: Extract<ServerMsg, { t: 'adm_pcats' }>) => void;
  /** 组队的全部消息（邀请 / 队伍状态 / 解散 / 结果）；坐上队友的车的结果单独一条 */
  party?: (m: PartyMsg) => void;
  paxResult?: (ok: boolean, pid: number, msg?: string) => void;
  /** 留在原地的单车：整份 / 新停下一辆 / 一辆没了 */
  bikeDrops?: (list: DroppedBike[]) => void;
  bikeDrop?: (b: DroppedBike) => void;
  bikeGone?: (id: number) => void;
  /** 管理员控制台：玩家列表 / 小猫列表 / 操作结果；小猫改名（所有人收到） */
  admPlayers?: (items: AdminPlayer[], online: number, total: number, locked: boolean, announce: boolean) => void;
  admCats?: (items: AdminCat[]) => void;
  /** 举报：我举报的结果 / 管理员：举报列表、未处理条数、所有世界 */
  reportResult?: (ok: boolean, msg: string) => void;
  admReports?: (m: Extract<ServerMsg, { t: 'adm_reports' }>) => void;
  repN?: (n: number) => void;
  admWorlds?: (items: AdminWorld[], mine: string) => void;
  admResult?: (ok: boolean, msg: string) => void;
  catNames?: (names: Record<string, string>) => void;
  /** 在线好友的大致位置；hidden = 我是否对好友隐藏了位置 */
  locs?: (items: FriendLoc[], hidden: boolean) => void;
  /** 校园跑的全部消息（邀请 / 房间状态 / 结果 / 取消 / 成绩） */
  run?: (m: RunMsg) => void;
  /** 钓鱼状态（见协议）与图鉴 */
  fishState?: (m: Extract<ServerMsg, { t: 'fish_state' }>) => void;
  fishdex?: (log: Record<string, FishLog>) => void;
  /** 今天的任务进度；fresh = 这次刚完成的任务 */
  quests?: (list: QuestState[], full: number, fresh?: string[]) => void;
  /** 坐下结果（成功时 x/y 是座位位置）/ 别人（含自己）做了表情 */
  sitResult?: (ok: boolean, msg?: string, x?: number, y?: number) => void;
  emote?: (pid: number, e: number) => void;
  /** 持续型表情（躺下 / 坐地）结束了 */
  emoteEnd?: (pid: number) => void;
  /** 我的称号：已获得 / 正在佩戴 / 这次刚得到的 */
  titles?: (own: Record<string, number>, sel: string, fresh?: string[]) => void;
  /** 上车结果：被拒绝（附近没有车）时场景要把人放下来 */
  rideResult?: (ok: boolean, msg?: string) => void;
}

/**
 * 联机客户端：WebSocket 连接、自动重连（指数退避）、公屏通道（实现 ChatTransport）。
 * 没连上服务器时游戏照常单人玩，公屏消息只回显给自己；服务器恢复后自动连回。
 */
export class NetClient implements ChatTransport {
  status: ChatStatus = 'offline';
  online?: number;
  selfId = 0;
  /** 我的校园号（服务器分配，稳定不变） */
  selfUid = 0;
  readonly handlers: NetHandlers = {};
  private ws: WebSocket | null = null;
  private msgCbs: ((m: ChatMessage) => void)[] = [];
  private statusCbs: ((s: ChatStatus) => void)[] = [];
  private seq = 0;
  private retry = 0;
  private timer = 0;
  private stopped = false;
  private everOnline = false;
  private warnedOffline = false;
  private adminCbs: ((ok: boolean, msg?: string) => void)[] = [];
  /** 当前连接是不是管理员（断线后清零，重连时用令牌自动恢复） */
  isAdmin = false;
  /** 管理员身份：站长 / 协管员（不是管理员 = null）；按权限表决定界面上哪些按钮能用 */
  adminRole: AdminRole | null = null;
  /** 这个身份能不能做这个操作（界面据此隐藏按钮；真正的检查在服务器） */
  can(op: AdminOp['op']) { return canOp(this.adminRole, op); }

  constructor(private url: string, private token: string, private getProfile: () => Profile) {}

  connect() {
    if (this.stopped) return;
    let ws: WebSocket;
    try { ws = new WebSocket(this.url); } catch { this.scheduleRetry(); return; }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => ws.send(JSON.stringify({ t: 'hello', v: PROTOCOL_VERSION, token: this.token, profile: this.getProfile() }));
    ws.onmessage = (ev) => {
      if (typeof ev.data !== 'string') { const s = decodeSnapshot(ev.data as ArrayBuffer); if (s) this.handlers.snapshot?.(s, performance.now()); return; }
      let m: ServerMsg; try { m = JSON.parse(ev.data) as ServerMsg; } catch { return; }
      this.onServer(m);
    };
    ws.onclose = (ev) => {
      if (this.ws !== ws) return;
      this.ws = null;
      const was = this.status === 'online';
      this.setStatus('offline');
      this.online = undefined;
      this.isAdmin = false; this.adminRole = null;
      this.handlers.disconnected?.();
      if ([4001, 4002, 4003, 4005].includes(ev.code) || this.stopped) return; // 版本/资料/身份问题或被顶下线：重连也没用
      if (was) this.system('与服务器断开了，正在重连…');
      else if (!this.warnedOffline && !this.everOnline) { this.warnedOffline = true; this.system('没有连上联机服务器，现在是单人模式；服务器启动后会自动连上。'); }
      this.scheduleRetry(ev.code === 4004 ? 15000 : 0);
    };
    ws.onerror = () => { /* 随后会触发 close */ };
  }

  private scheduleRetry(min = 0) {
    const d = Math.max(min, Math.min(10000, 1000 * 2 ** this.retry++)) + Math.random() * 500;
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => this.connect(), d);
  }

  private onServer(m: ServerMsg) {
    switch (m.t) {
      case 'welcome':
        this.retry = 0; this.selfId = m.id; this.selfUid = m.uid; this.online = m.online; this.setStatus('online');
        this.system(`${this.everOnline ? '已重新连上服务器' : '已连上服务器'}，当前在线 ${m.online} 人`);
        this.everOnline = true;
        this.handlers.welcome?.(m.id, m.x, m.y);
        { const t = readAdminToken(); if (t) this.ws?.send(JSON.stringify({ t: 'admin_resume', token: t })); } // 之前登录过管理员：自动恢复
        break;
      case 'spawn': this.handlers.spawn?.(m.id, m.uid, m.x, m.y, m.flags, m.p, m.ttl, m.held, m.fz, m.pose); break;
      case 'held': this.handlers.held?.(m.pid, m.h); break;
      case 'fz': this.handlers.fz?.(m.pid, m.c); break;
      case 'fz_state': this.handlers.fzState?.(m.own, m.on, m.news, m.gift); break;
      case 'despawn': this.handlers.despawn?.(m.id); break;
      case 'correct': this.handlers.correct?.(m.x, m.y); break;
      case 'chat': this.emit({ id: ++this.seq, kind: m.tone ? 'broadcast' : 'chat', pid: m.pid, uid: m.uid, from: m.from, hue: m.hue, text: m.text, ts: m.ts, mid: m.mid, ...(m.ch ? { ch: m.ch } : {}), ...(m.tone ? { tone: m.tone } : {}) }); break;
      case 'channels': this.setChannels(m.items); break;
      case 'ch_result': for (const cb of this.chResultCbs) cb(m.ok, m.msg); break;
      case 'chat_recall': this.handlers.chatRecall?.(m.mids); break;
      case 'adm_chatlog': this.handlers.admChatlog?.(m.items, m.more); break;
      case 'adm_dmlog': this.handlers.admDmlog?.(m); break;
      case 'adm_info': this.handlers.admInfo?.(m.info); break;
      case 'adm_code': this.handlers.admCode?.(m); break;
      case 'adm_hits': this.handlers.admHits?.(m); break;
      case 'adm_dossier': this.handlers.admDossier?.(m.d); break;
      case 'adm_bans': this.handlers.admBans?.(m.items); break;
      case 'adm_audit': this.handlers.admAudit?.(m.items, m.more); break;
      case 'sys': this.emit({ id: ++this.seq, kind: 'system', text: m.text, ts: m.ts }); break;
      case 'online': this.online = m.n; this.setStatus(this.status); break;
      case 'kick': this.stopped = true; this.system(`${m.reason}。刷新页面可以重新进入。`); break;
      case 'error': this.system(m.msg); break;
      case 'board': this.handlers.board?.(m.items); break;
      case 'board_new': this.handlers.boardNew?.(m.item); break;
      case 'board_result': this.handlers.boardResult?.(m.ok, m.msg); break;
      case 'board_del': this.handlers.boardDel?.(m.ids); break;
      case 'admin':
        this.isAdmin = m.ok; this.adminRole = m.ok ? (m.role ?? 'owner') : null;
        if (m.ok && m.token) saveAdminToken(m.token);   // 只存服务器发的令牌，不存口令
        if (!m.ok) saveAdminToken(null);
        for (const cb of this.adminCbs) cb(m.ok, m.msg);
        break;
      case 'social': this.handlers.social?.(m.friends, m.incoming, m.blocked); break;
      case 'presence': this.handlers.presence?.(m.uid, m.online); break;
      case 'friend_on': this.handlers.friendOn?.(m.uid, m.name); break;
      case 'world_state': this.handlers.worldState?.(m); break;
      case 'world_result': this.handlers.worldResult?.(m.ok, m.msg); break;
      case 'world_ask': this.handlers.worldAsk?.(m.uid, m.name, m.kind); break;
      case 'profile_fix': this.handlers.profileFix?.(m.profile); break;
      case 'adm_filter': this.handlers.admFilter?.(m.f); break;
      case 'dm': this.handlers.dm?.(m.msg); break;
      case 'dm_history': this.handlers.dmHistory?.(m.with, m.items, m.more); break;
      case 'social_result': this.handlers.socialResult?.(m.ok, m.msg); break;
      case 'social_note': this.handlers.socialNote?.(m.text); break;
      case 'whois': this.handlers.whois?.(m.uid, m.info, m.relation, m.dorm); break;
      case 'dorm_likes': this.handlers.dormLikes?.(m.uid, m.n, m.liked, m.msg); break;
      case 'chat_history': this.handlers.chatHistory?.(m.items); break;
      case 'notices': this.handlers.notices?.(m.items, m.newId);
        break;
      case 'about_thanks': this.handlers.aboutThanks?.(m.thanks); break;
      case 'inv': this.handlers.inv?.(m.items, m.gain); break;
      case 'mon_data': this.handlers.mon?.(m); break;
      case 'mon_result': this.handlers.monResult?.(m.ok, m.msg); break;
      case 'tp_result': this.handlers.tpResult?.(m.ok, m.msg); break;
      case 'dorm_data': this.handlers.dormData?.(m); break;
      case 'dorm_in': this.handlers.dormIn?.(m.x, m.y); break;
      case 'dorm_out': this.handlers.dormOut?.(m.msg); break;
      case 'dorm_ask': this.handlers.dormAsk?.(m.uid, m.name, m.kind, m.title); break;
      case 'dorm_visit': this.handlers.dormVisit?.(m); break;
      case 'room_join': this.handlers.roomJoin?.(m.w); break;
      case 'room_leave': this.handlers.roomLeave?.(m.id); break;
      case 'room_pos': this.handlers.roomPos?.(m.id, m.x, m.y, m.flags); break;
      case 'room_state': this.handlers.roomState?.(m); break;
      case 'dorm_result': this.handlers.dormResult?.(m.ok, m.msg, m.wake); break;
      case 'hand_invite': this.handlers.handInvite?.(m.uid, m.name); break;
      case 'hand_pairs': this.handlers.handPairs?.(m.list); break;
      case 'hand_me': this.handlers.handMe?.(m.role, m.pid, m.name, m.msg, m.side); break;
      case 'hand_result': this.handlers.handResult?.(m.ok, m.msg); break;
      case 'mon_enc': this.handlers.monEnc?.(m); break;
      case 'mon_enc_end': this.handlers.monEncEnd?.(); break;
      case 'mon_bt': this.handlers.monBt?.(m); break;
      case 'cats': this.handlers.cats?.(m.aff, m.beds, m.info, m.gifts); break;
      case 'coins': this.handlers.coins?.(m.n, m.gain); break;
      case 'shop_result': this.handlers.shopResult?.(m.ok, m.msg); break;
      case 'bin_result': this.handlers.binResult?.(m); break;
      case 'hall': this.handlers.hall?.(m); break;
      case 'equip': this.handlers.equip?.({ rod: m.rod, bait: m.bait, tackle: m.tackle ?? [], target: m.target ?? '' }); break;
      case 'box_result': this.handlers.boxResult?.(m); break;
      case 'craft_result': this.handlers.craftResult?.(m.ok, m.msg); break;
      case 'geardex': this.handlers.geardex?.(m.gd); break;
      case 'bundle_result': this.handlers.bundleResult?.(m.ok, m.msg, m.id); break;
      case 'fx': this.handlers.fx?.(m); break;
      case 'wq': this.handlers.wq?.(m); break;
      case 'wq_result': this.handlers.wqResult?.(m.ok, m.msg, m.id); break;
      case 'release_result': this.handlers.releaseResult?.(m); break;
      case 'trade_invite': this.handlers.tradeInvite?.(m.tid, m.uid, m.name); break;
      case 'trade_wait': this.handlers.tradeWait?.(m.tid, m.name); break;
      case 'trade_state': this.handlers.tradeState?.(m); break;
      case 'trade_end': this.handlers.tradeEnd?.(m.tid, m.ok, m.msg); break;
      case 'trade_note': this.handlers.tradeNote?.(m.msg); break;
      case 'bird_result': this.handlers.birdResult?.(m); break;
      case 'wall_posts': this.handlers.wallPosts?.(m.items, m.more, m.append === true, m.pending, { sort: m.sort, tab: m.tab, next: m.next, at: m.at }); break;
      case 'wall_pending': this.handlers.wallPending?.(m.n); break;
      case 'wall_thread': this.handlers.wallThread?.(m.post, m.comments); break;
      case 'wall_result': this.handlers.wallResult?.(m.ok, m.msg); break;
      case 'place_up_ticket': this.handlers.placeUpTicket?.(m.key, m.ticket, m.url); break;
      case 'place_posts': this.handlers.placePosts?.(m); break;
      case 'place_thread': this.handlers.placeThread?.(m.post, m.comments); break;
      case 'place_result': this.handlers.placeResult?.(m.ok, m.msg); break;
      case 'place_admin_list': this.handlers.placeAdminList?.(m); break;
      case 'place_pending': this.handlers.placePending?.(m.n); break;
      case 'cat_result': this.handlers.catResult?.(m.id, m.kind, m.r); break;
      case 'ride_result': this.handlers.rideResult?.(m.ok, m.msg); break;
      case 'ach': this.handlers.ach?.(m.unlocked, m.new); break;
      case 'titles': this.handlers.titles?.(m.own, m.sel, m.new); break;
      case 'time': this.handlers.time?.(m.now); break;
      case 'cat_msg': this.handlers.catMsg?.(m.ok, m.msg); break;
      case 'cat_nicks': this.handlers.catNicks?.(m.nicks); break;
      case 'cat_follows': this.handlers.catFollows?.(m.map); break;
      case 'cat_follow': this.handlers.catFollow?.(m.id, m.pid); break;
      case 'adm_pcats': this.handlers.admPcats?.(m); break;
      case 'party_invite': case 'party': case 'party_gone': case 'party_result': this.handlers.party?.(m); break;
      case 'pax_result': this.handlers.paxResult?.(m.ok, m.pid, m.msg); break;
      case 'bike_drops': this.handlers.bikeDrops?.(m.list); break;
      case 'bike_drop': this.handlers.bikeDrop?.(m.bike); break;
      case 'bike_gone': this.handlers.bikeGone?.(m.id); break;
      case 'adm_players': this.handlers.admPlayers?.(m.items, m.online, m.total, m.locked, m.announce); break;
      case 'adm_cats': this.handlers.admCats?.(m.items); break;
      case 'report_result': this.handlers.reportResult?.(m.ok, m.msg); break;
      case 'adm_reports': this.handlers.admReports?.(m); break;
      case 'rep_n': this.handlers.repN?.(m.n); break;
      case 'adm_worlds': this.handlers.admWorlds?.(m.items, m.mine); break;
      case 'adm_result': this.handlers.admResult?.(m.ok, m.msg); break;
      case 'cat_names': this.handlers.catNames?.(m.names); break;
      case 'locs': this.handlers.locs?.(m.items, m.hidden); break;
      case 'run_invite': case 'run_state': case 'run_end': case 'run_gone': case 'run_best': this.handlers.run?.(m); break;
      case 'fish_state': this.handlers.fishState?.(m); break;
      case 'fishdex': this.handlers.fishdex?.(m.log); break;
      case 'quests': this.handlers.quests?.(m.list, m.full, m.fresh); break;
      case 'sit_result': this.handlers.sitResult?.(m.ok, m.msg, m.x, m.y); break;
      case 'emote': this.handlers.emote?.(m.pid, m.e); break;
      case 'emote_end': this.handlers.emoteEnd?.(m.pid); break;
    }
  }

  // ------------------------------------------------------------ 上行
  sendPos(x: number, y: number, flags: number) { if (this.status === 'online') this.ws?.send(encodeReport({ x, y, flags })); }
  getBoard() { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'board_get' })); }
  postBoard(cat: number, text: string) { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'board_post', cat, text })); }
  /** 管理员状态变化（登录/恢复/退出）的监听，可以有多个 */
  onAdmin(cb: (ok: boolean, msg?: string) => void) { this.adminCbs.push(cb); }
  aboutThanksSet(thanks: string[] | null) { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'about_thanks_set', thanks })); }
  noticePublish(title: string, body: string) { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'notice_publish', title, body })); }
  noticeEdit(id: number, title: string, body: string) { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'notice_edit', id, title, body })); }
  noticeDel(id: number) { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'notice_del', id })); }
  private tx(m: object) { if (this.status === 'online') this.ws?.send(JSON.stringify(m)); }
  getSocial() { this.tx({ t: 'social_get' }); }
  shopBuy(id: string, qty = 1) { this.tx({ t: 'shop_buy', id, qty }); }
  shopSell(id: string, n: number) { this.tx({ t: 'shop_sell', id, n }); }
  shopSellBulk() { this.tx({ t: 'shop_sell_bulk' }); }
  getCoins() { this.tx({ t: 'coins_get' }); }
  binSearch(bin: number) { this.tx({ t: 'bin_search', bin }); }
  hallGet() { this.tx({ t: 'hall_get' }); }
  equipSet(slot: 'rod' | 'bait' | 'tackle' | 'target', id: string) { this.tx({ t: 'equip_set', slot, id }); }
  boxOpen(id: string, n = 1) { this.tx({ t: 'box_open', id, ...(n > 1 ? { n } : {}) }); }
  craft(recipe: string, param?: string) { this.tx({ t: 'craft', recipe, ...(param ? { param } : {}) }); }
  getGeardex() { this.tx({ t: 'geardex_get' }); }
  bundleClaim(id: string) { this.tx({ t: 'bundle_claim', id }); }
  getFx() { this.tx({ t: 'fx_get' }); }
  fxRoute(slot: number, route: string) { this.tx({ t: 'fx_route', slot, route }); }
  getWq() { this.tx({ t: 'wq_get' }); }
  wqClaim(id: string) { this.tx({ t: 'wq_claim', id }); }
  fishRelease(id: string) { this.tx({ t: 'fish_release', id }); }
  tradeInvite(uid: number) { this.tx({ t: 'trade_invite', uid }); }
  tradeAccept(tid: number) { this.tx({ t: 'trade_accept', tid }); }
  tradeCancel(tid: number) { this.tx({ t: 'trade_cancel', tid }); }
  tradeOffer(tid: number, items: Gain[], coins: number) { this.tx({ t: 'trade_offer', tid, items, coins }); }
  tradeReady(tid: number, on: boolean) { this.tx({ t: 'trade_ready', tid, on }); }
  wallList(before?: number, pending = false, opt: { sort?: WallSort; off?: number; at?: number } = {}) { this.tx({ t: 'wall_list', ...(before ? { before } : {}), ...(pending ? { pending: true } : {}), ...(opt.sort === 'hot' ? { sort: 'hot' as const } : {}), ...(opt.off ? { off: opt.off } : {}), ...(opt.at ? { at: opt.at } : {}) }); }
  wallReview(id: number, ok: boolean) { this.tx({ t: 'wall_review', id, ok }); }
  wallOpen(id: number) { this.tx({ t: 'wall_open', id }); }
  wallPost(text: string, anon: boolean) { this.tx({ t: 'wall_post', text, anon }); }
  wallComment(id: number, text: string, anon: boolean) { this.tx({ t: 'wall_comment', id, text, anon }); }
  wallLike(id: number) { this.tx({ t: 'wall_like', id }); }
  wallDel(id: number, c?: number) { this.tx({ t: 'wall_del', id, ...(c ? { c } : {}) }); }
  wallReport(id: number, c?: number) { this.tx({ t: 'wall_report', id, ...(c ? { c } : {}) }); }
  wallDelBy(by: string) { this.tx({ t: 'wall_del_by', by }); }
  placeUp(key: string) { this.tx({ t: 'place_up', key }); }
  placeOpen(key: string, opt: { sort?: WallSort; before?: number; off?: number; at?: number } = {}) { this.tx({ t: 'place_open', key, ...(opt.sort === 'hot' ? { sort: 'hot' as const } : {}), ...(opt.before ? { before: opt.before } : {}), ...(opt.off ? { off: opt.off } : {}), ...(opt.at ? { at: opt.at } : {}) }); }
  placeThread(id: number) { this.tx({ t: 'place_thread', id }); }
  placePost(key: string, text: string, imgs?: string[]) { this.tx({ t: 'place_post', key, text, ...(imgs?.length ? { imgs } : {}) }); }
  placeComment(id: number, text: string) { this.tx({ t: 'place_comment', id, text }); }
  placeLike(id: number) { this.tx({ t: 'place_like', id }); }
  placeDel(id: number, c?: number) { this.tx({ t: 'place_del', id, ...(c ? { c } : {}) }); }
  placeReport(id: number, c?: number) { this.tx({ t: 'place_report', id, ...(c ? { c } : {}) }); }
  placeAdmin(tab: 'all' | 'pending' | 'img', key?: string, before?: number) { this.tx({ t: 'place_admin', tab, ...(key ? { key } : {}), ...(before ? { before } : {}) }); }
  placeReview(id: number, ok: boolean) { this.tx({ t: 'place_review', id, ok }); }
  placeDelBy(id: number) { this.tx({ t: 'place_del_by', id }); }
  whois(uid: number) { this.tx({ t: 'whois', uid }); }
  friendReq(uid: number) { this.tx({ t: 'friend_req', uid }); }
  friendAccept(uid: number) { this.tx({ t: 'friend_accept', uid }); }
  friendDecline(uid: number) { this.tx({ t: 'friend_decline', uid }); }
  friendRemove(uid: number) { this.tx({ t: 'friend_remove', uid }); }
  handInvite(uid: number) { this.tx({ t: 'hand_invite', uid }); }
  handAccept(uid: number) { this.tx({ t: 'hand_accept', uid }); }
  handDecline(uid: number) { this.tx({ t: 'hand_decline', uid }); }
  handEnd() { this.tx({ t: 'hand_end' }); }
  friendNote(uid: number, note: string) { this.tx({ t: 'friend_note', uid, note }); }
  block(uid: number) { this.tx({ t: 'block', uid }); }
  unblock(uid: number) { this.tx({ t: 'unblock', uid }); }
  dm(to: number, text: string) { this.tx({ t: 'dm', to, text }); }
  dmHistory(withUid: number, before?: number) { this.tx({ t: 'dm_history', with: withUid, before }); }
  dmRead(withUid: number) { this.tx({ t: 'dm_read', with: withUid }); }
  getInv() { this.tx({ t: 'inv_get' }); }
  monGet() { this.tx({ t: 'mon_get' }); }
  monStarter(sp: string) { this.tx({ t: 'mon_starter', sp }); }
  monMove(id: string, to: 'sq' | 'bx') { this.tx({ t: 'mon_move', id, to }); }
  monOrder(ids: string[]) { this.tx({ t: 'mon_order', ids }); }
  monNick(id: string, name: string) { this.tx({ t: 'mon_nick', id, name }); }
  monFree(id: string) { this.tx({ t: 'mon_free', id }); }
  monReplace(id: string, move: string, drop: number) { this.tx({ t: 'mon_replace', id, move, drop }); }
  trainerBattle(id: string) { this.tx({ t: 'trainer_battle', id }); }
  catTame(id: number) { this.tx({ t: 'cat_tame', id }); }
  catBattle(id: number) { this.tx({ t: 'cat_battle', id }); }
  tpGo(id: string) { this.tx({ t: 'tp_go', id }); }
  dormGet() { this.tx({ t: 'dorm_get' }); }
  dormBind(b: string) { this.tx({ t: 'dorm_bind', b }); }
  dormGo() { this.tx({ t: 'dorm_go' }); }
  dormEnter() { this.tx({ t: 'dorm_enter' }); }
  dormLeave() { this.tx({ t: 'dorm_leave' }); }
  /** 把好感 ≥ 200 的小猫接回宿舍养（on）/ 送回校园 */
  dormCat(id: number, on: boolean) { this.tx({ t: 'dorm_cat', id, on }); }
  dormAc() { this.tx({ t: 'dorm_ac' }); }
  dormSleep(on: boolean) { this.tx({ t: 'dorm_sleep', on }); }
  dormChest(op: 'put' | 'take', id: string, n: number) { this.tx({ t: 'dorm_chest', op, id, n }); }
  worldSet(kind: 'public' | 'solo', remember = true) { this.tx({ t: 'world_set', kind, remember }); }
  worldInvite(uid: number) { this.tx({ t: 'world_invite', uid }); }
  worldKnock(uid: number) { this.tx({ t: 'world_knock', uid }); }
  worldReply(uid: number, accept: boolean) { this.tx({ t: 'world_reply', uid, accept }); }
  worldKick(uid: number) { this.tx({ t: 'world_kick', uid }); }
  worldOpts(noAsk: boolean) { this.tx({ t: 'world_opts', noAsk }); }
  dormInvite(uid: number) { this.tx({ t: 'dorm_invite', uid }); }
  dormKnock(uid: number) { this.tx({ t: 'dorm_knock', uid }); }
  dormReply(uid: number, accept: boolean) { this.tx({ t: 'dorm_reply', uid, accept }); }
  dormTitle(text: string) { this.tx({ t: 'dorm_title', text }); }
  roomMove(x: number, y: number, flags: number) { this.tx({ t: 'room_move', x, y, flags }); }
  monGo(accept: boolean) { this.tx({ t: 'mon_go', accept }); }
  monAct(bid: string, turn: number, a: Extract<ClientMsg, { t: 'mon_act' }>['a']) { this.tx({ t: 'mon_act', bid, turn, a }); }
  catPet(id: number) { this.tx({ t: 'cat_pet', id }); }
  birdFeed(id: number) { this.tx({ t: 'bird_feed', id }); }
  catFeed(id: number, item: string) { this.tx({ t: 'cat_feed', id, item }); }
  catHug(id: number) { this.tx({ t: 'cat_hug', id }); }
  ride(on: boolean) { this.tx({ t: 'ride', on }); }
  getAch() { this.tx({ t: 'ach_get' }); }
  achEvent(ev: AchEvent, tz?: number) { this.tx({ t: 'ach_event', ev, ...(tz !== undefined ? { tz } : {}) }); }
  sit(on: boolean) { this.tx({ t: 'sit', on }); }
  emote(e: number) { this.tx({ t: 'emote', e }); }
  held(h: number) { this.tx({ t: 'held', h }); }
  dormBath(op: 'put' | 'take', id: string, n: number) { this.tx({ t: 'dorm_bath', op, id, n }); }
  /** 装修：place = 摆一件、move = 挪/转、pick = 收回 */
  dormLike(uid: number) { this.tx({ t: 'dorm_like', uid }); }
  dormPub(on: boolean) { this.tx({ t: 'dorm_pub', on }); }
  dormSkin(kind: 'w' | 'f', i: number, op: 'buy' | 'use') { this.tx({ t: 'dorm_skin', kind, i, op }); }
  dormExpand() { this.tx({ t: 'dorm_expand' }); }
  dormLay(m: { op: 'place'; d: string; x: number; y: number; r?: number } | { op: 'move'; i: number; x: number; y: number; r?: number } | { op: 'pick'; i: number } | { op: 'dye'; i: number; c: number } | { op: 'reset' } | { op: 'undo' }) { this.tx({ t: 'dorm_lay', ...m }); }
  fzGet() { this.tx({ t: 'fz_get' }); }
  fzSet(c: number) { this.tx({ t: 'fz_set', c }); }
  /** 举报：kind = chat / dm / board / wall / user；ref 见 ReportDialog */
  report(kind: ReportKind, ref: number, reason: number, note?: string, cid?: number, ch?: ChannelId) { this.tx({ t: 'report', kind, ref, reason, ...(note ? { note } : {}), ...(cid ? { cid } : {}), ...(ch && ch !== 'world' ? { ch } : {}) }); }
  /** 管理员控制台操作（服务器会检查你是不是管理员） */
  adm(op: AdminOp) { this.tx({ t: 'adm', ...op }); }
  hideLoc(on: boolean) { this.tx({ t: 'loc_hide', on }); }
  catFollowCmd(id: number, on: boolean) { this.tx({ t: 'cat_follow', id, on }); }
  catNick(id: number, name: string) { this.tx({ t: 'cat_nick', id, name }); }
  partyInvite(uid: number) { this.tx({ t: 'party_invite', uid }); }
  partyAccept(pid: number) { this.tx({ t: 'party_accept', pid }); }
  partyDecline(pid: number) { this.tx({ t: 'party_decline', pid }); }
  partyLeave() { this.tx({ t: 'party_leave' }); }
  partyKick(uid: number) { this.tx({ t: 'party_kick', uid }); }
  partyTp(uid: number) { this.tx({ t: 'party_tp', uid }); }
  getParty() { this.tx({ t: 'party_get' }); }
  paxJoin(uid: number) { this.tx({ t: 'pax_join', uid }); }
  paxLeave() { this.tx({ t: 'pax_leave' }); }
  runSolo() { this.tx({ t: 'run_solo' }); }
  runNew() { this.tx({ t: 'run_new' }); }
  runInvite(uid: number) { this.tx({ t: 'run_invite', uid }); }
  runAccept(rid: number) { this.tx({ t: 'run_accept', rid }); }
  runDecline(rid: number) { this.tx({ t: 'run_decline', rid }); }
  runStart() { this.tx({ t: 'run_start' }); }
  runLeave() { this.tx({ t: 'run_leave' }); }
  getRun() { this.tx({ t: 'run_get' }); }
  fishCast() { this.tx({ t: 'fish_cast' }); }
  fishReel() { this.tx({ t: 'fish_reel' }); }
  fishEnd(win: boolean, perfect: boolean) { this.tx({ t: 'fish_end', win, ...(perfect ? { perfect: true } : {}) }); }
  fishCancel() { this.tx({ t: 'fish_cancel' }); }
  getFishdex() { this.tx({ t: 'fishdex_get' }); }
  getQuests() { this.tx({ t: 'quest_get' }); }
  getTitles() { this.tx({ t: 'title_get' }); }
  setTitle(id: string) { this.tx({ t: 'title_set', id }); }
  adminLogin(key: string) { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'admin_login', key })); }
  adminLogout() { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'admin_logout' })); saveAdminToken(null); this.isAdmin = false; this.adminRole = null; }
  delBoard(id: number) { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'board_del', id })); }
  delBoardBy(by: string) { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'board_del_by', by })); }
  updateProfile(p: Profile) { if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'profile', profile: p })); }

  // ------------------------------------------------------------ ChatTransport
  send(text: string, ch: ChannelId = 'world') {
    const t = cleanChatText(text);
    if (!t) return;
    if (this.status === 'online') this.ws?.send(JSON.stringify({ t: 'chat', text: t, ...(ch !== 'world' ? { ch } : {}) }));
    else { const p = this.getProfile(); this.emit({ id: ++this.seq, kind: 'chat', from: p.name, hue: hueOf(p.name), text: t, ts: Date.now() }); } // 离线：只回显给自己
  }
  system(text: string) { this.emit({ id: ++this.seq, kind: 'system', text, ts: Date.now() }); }
  /** 我现在有哪些频道（服务器发来的；没连上就是离线的两个） */
  channels: readonly ChannelState[] = OFFLINE_CHANNEL_STATES;
  private chCbs: ((items: readonly ChannelState[]) => void)[] = [];
  private chResultCbs: ((ok: boolean, msg: string) => void)[] = [];
  onChannels(cb: (items: readonly ChannelState[]) => void) { this.chCbs.push(cb); }
  onChResult(cb: (ok: boolean, msg: string) => void) { this.chResultCbs.push(cb); }
  private setChannels(items: readonly ChannelState[]) { this.channels = items; for (const cb of this.chCbs) cb(items); }
  /** 改频道的开关 / 静音：在线发给服务器（它存档并回 channels）；离线只改本机的显示 */
  chSet(ch: ChannelId, set: { on?: boolean; mute?: boolean }) {
    if (this.status === 'online') { this.ws?.send(JSON.stringify({ t: 'ch_set', ch, ...set })); return; }
    this.setChannels(this.channels.map((c) => (c.id === ch ? { ...c, ...(typeof set.on === 'boolean' ? { on: set.on } : {}), ...(typeof set.mute === 'boolean' ? { mute: set.mute } : {}) } : c)));
  }
  onMessage(cb: (m: ChatMessage) => void) { this.msgCbs.push(cb); }
  onStatus(cb: (s: ChatStatus) => void) { this.statusCbs.push(cb); }
  private setStatus(s: ChatStatus) {
    const was = this.status; this.status = s;
    if (s !== was) this.setChannels(s === 'online' ? DEFAULT_CHANNEL_STATES : OFFLINE_CHANNEL_STATES); // 在线先用默认频道，服务器的 channels 随后就到
    for (const cb of this.statusCbs) cb(s);
  }
  private emit(m: ChatMessage) { for (const cb of this.msgCbs) cb(m); }
}

/**
 * 默认的联机地址：与网页同主机、同路径前缀下的 ws。
 * 开发时由 Vite 把 /ws 代理到 npm run server；部署在 https://exist.qd.je/pixel/ 时（构建用 --base=/pixel/）就是 /pixel/ws。
 * VITE_WS_URL 可覆盖。
 */
export function defaultWsUrl(): string {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env;
  if (env?.VITE_WS_URL) return env.VITE_WS_URL;
  const base = (env?.BASE_URL ?? '/').replace(/\/?$/, '/');
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${base}ws`;
}

const ADMIN_KEY = 'pixelcampus.admin';
const readAdminToken = () => { try { return localStorage.getItem(ADMIN_KEY); } catch { return null; } };
const saveAdminToken = (t: string | null) => { try { if (t) localStorage.setItem(ADMIN_KEY, t); else localStorage.removeItem(ADMIN_KEY); } catch { /* 存储不可用：仅本次有效 */ } };
