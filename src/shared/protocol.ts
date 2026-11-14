/**
 * 联机协议（客户端与服务器共用）。
 * - 低频、结构化的消息用 JSON 文本帧：hello / chat / profile / welcome / spawn / despawn / sys / online / correct / kick / error，
 *   以及背包（inv）、小猫（cats / cat_*）、骑行（ride）、身份恢复（restore）
 * - 高频的位置用二进制帧：客户端 → 服务器 "位置上报"（6 字节），服务器 → 客户端 "快照"（按视野过滤 + 只发变化的，每人 7 字节）
 * 坐标单位是世界像素，二进制里按 1/4 像素定点存 u16（世界最大约 11264 px × 4 = 45056，装得下）。
 */
import type { Profile } from './profile';
import type { BathView, DormCard } from './dorm';
import type { Placed } from './decor';
import type { BoardItem } from './board';
import type { WallComment, WallPost, WallSort } from './wall';
import type { PlaceComment, PlacePost } from './place';
import type { Notice } from './notice';
import type { ChatHistoryItem, DmMsg, FriendInfo, PersonInfo } from './social';
import type { Gain, Inv } from './items';
import type { CatInfo, CatResult } from './cats';
import type { AchEvent } from './achievements';
import type { QuestState } from './quests';
import type { FishLog } from './fishing';
import type { GearLog } from './fishdex';
import type { CommReward, CommTier } from './commissions';
import type { RunMsg } from './run';
import type { FriendLoc } from './where';
import type { AdminCat, AdminChatItem, AdminDm, AdminDmPeer, AdminDossier, AdminFilter, AdminHit, AdminInfo, AdminOp, AdminPlayer, AdminRole, AdminWorld, AuditEntry, BanEntry } from './admin';
import type { ReportEntry, ReportKind } from './report';
import type { DroppedBike } from './bikes';
import type { PartyMsg } from './party';
import type { HallData } from './hall';
import type { TradeOffer, TradeSide } from './trade';
import type { ChannelId, ChannelState } from './channels';
import type { Mon } from './mons';
import type { BEvent } from './battle';
import type { DexEntry } from './monbox';

/**
 * 协议版本：服务器和客户端必须一致，不一致的旧页面会被要求刷新。
 * 2：精灵系统上线（服务器会下发客户端不认识的新物种等内容，旧页面必须刷新）
 * 9：聊天频道（chat 带 ch、channels、ch_set；队伍 / 附近的话不能漏进旧页面的公屏）
 * 10：钓鱼 2.0（神话鱼、配件、盲盒、合成、册页；装备栏多了配件和指名目标，旧页面不认识）
 * 11：钓鱼 3.0（钓鱼等级与路线、钓具老板的每日 / 每周委托、放生）
 * 12：宿舍第四批（房间里没有固定家具了：床、衣柜、窗…都在摆放数据里；室内底图不再画窗/地毯/门垫；屋里坐姿位；旧页面画不出新宿舍，必须刷新）
 */
export const PROTOCOL_VERSION = 12;

/** 一个委托给客户端看的样子 */
export interface CommView { id: CommTier; tier: CommTier; name: string; desc: string; goal: number; prog: number; done: boolean; claimed: boolean; reward: CommReward }

/** 宿舍里的一位玩家（和 spawn 消息同一套字段，位置是屋里的坐标） */
export interface RoomWho { id: number; uid: number; x: number; y: number; flags: number; p: PublicProfile; ttl?: string; held?: number; fz?: number; /** 正在保持的持续型表情（躺下 / 坐地）的编号；没有就没有这个字段 */ pose?: number }

export const NET = {
  /** 服务器快照频率（Hz） */
  SNAPSHOT_HZ: 10,
  /** 客户端位置上报最高频率（Hz） */
  REPORT_HZ: 15,
  /** 视野：进入 / 离开半径（像素）。离开半径更大，避免在边界来回抖动 */
  AOI_ENTER: 1000,
  AOI_LEAVE: 1200,
  /** 客户端渲染他人时落后的毫秒数（用来在两次快照之间插值） */
  INTERP_MS: 130,
  /** 服务器接受的最大移动速度 = 游戏最高速度 × 该容差 */
  SPEED_TOLERANCE: 1.35,
  /** 位置之间允许的额外误差（像素） */
  POS_SLACK: 6,
  /**
   * 移动额度上限（毫秒的满速移动量）：额度随时间按最高速累积、走路消耗，不是按"两条上报到达的间隔"判断。
   * 这样网络抖动导致几条上报挤在一起到达也不会被误判；而"睡一觉再瞬移"最多只能一次用掉这么多额度。
   */
  BURST_MS: 750,
  HELLO_TIMEOUT_MS: 5000,
  CHAT_COOLDOWN_MS: 600,
} as const;

export const OP = { REPORT: 1, SNAPSHOT: 2 } as const;

/** flags：bit0-1 朝向（0 下 1 上 2 左 3 右），bit2 在移动，bit3 在奔跑，bit4 在骑共享单车，bit5 坐在长椅上，bit6 在钓鱼（这几位服务器按自己的判断覆盖） */
export type Facing = 'down' | 'up' | 'left' | 'right';
const FACINGS: Facing[] = ['down', 'up', 'left', 'right'];
export const FLAG_RIDE = 16;
/** bit5 坐在长椅上（服务器按自己的判断覆盖这一位） */
export const FLAG_SIT = 32;
/** bit6 正在钓鱼（服务器按自己的判断覆盖这一位） */
export const FLAG_FISH = 64;
/** bit7 坐在队友的单车后座上（服务器让他的位置/朝向跟着车主走，画面上画成坐在车主身后） */
export const FLAG_PAX = 128;
export const packFlags = (facing: Facing, moving: boolean, run: boolean, ride = false, sit = false, fish = false) => FACINGS.indexOf(facing) | (moving && !sit ? 4 : 0) | (run && moving && !ride && !sit ? 8 : 0) | (ride ? FLAG_RIDE : 0) | (sit ? FLAG_SIT : 0) | (fish ? FLAG_FISH : 0);
export const unpackFlags = (f: number) => ({ facing: FACINGS[f & 3], moving: (f & 4) !== 0, run: (f & 8) !== 0, ride: (f & FLAG_RIDE) !== 0, sit: (f & FLAG_SIT) !== 0, fish: (f & FLAG_FISH) !== 0, pax: (f & FLAG_PAX) !== 0 });

const Q = 4;
const q = (v: number) => Math.max(0, Math.min(65535, Math.round(v * Q)));

export interface PosReport { x: number; y: number; flags: number }
export interface SnapEntry { id: number; x: number; y: number; flags: number }

export function encodeReport(r: PosReport): Uint8Array {
  const b = new Uint8Array(6), v = new DataView(b.buffer);
  v.setUint8(0, OP.REPORT); v.setUint16(1, q(r.x)); v.setUint16(3, q(r.y)); v.setUint8(5, r.flags);
  return b;
}
export function decodeReport(d: ArrayBuffer | Uint8Array): PosReport | null {
  const u = d instanceof Uint8Array ? d : new Uint8Array(d);
  if (u.byteLength !== 6 || u[0] !== OP.REPORT) return null;
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength);
  return { x: v.getUint16(1) / Q, y: v.getUint16(3) / Q, flags: v.getUint8(5) };
}

export function encodeSnapshot(entries: SnapEntry[]): Uint8Array {
  const b = new Uint8Array(3 + entries.length * 7), v = new DataView(b.buffer);
  v.setUint8(0, OP.SNAPSHOT); v.setUint16(1, entries.length);
  entries.forEach((e, i) => { const o = 3 + i * 7; v.setUint16(o, e.id); v.setUint16(o + 2, q(e.x)); v.setUint16(o + 4, q(e.y)); v.setUint8(o + 6, e.flags); });
  return b;
}
export function decodeSnapshot(d: ArrayBuffer | Uint8Array): SnapEntry[] | null {
  const u = d instanceof Uint8Array ? d : new Uint8Array(d);
  if (u.byteLength < 3 || u[0] !== OP.SNAPSHOT) return null;
  const v = new DataView(u.buffer, u.byteOffset, u.byteLength), n = v.getUint16(1);
  if (u.byteLength !== 3 + n * 7) return null;
  const out: SnapEntry[] = [];
  for (let i = 0; i < n; i++) { const o = 3 + i * 7; out.push({ id: v.getUint16(o), x: v.getUint16(o + 2) / Q, y: v.getUint16(o + 4) / Q, flags: v.getUint8(o + 6) }); }
  return out;
}

/** 其他玩家的公开信息（spawn 消息携带；玩家资料本来就对所有人可见） */
export type PublicProfile = Pick<Profile, 'name' | 'gender' | 'look' | 'college' | 'major' | 'year' | 'motto' | 'cardNo' | 'app'>;
export const toPublic = (p: Profile): PublicProfile => ({ name: p.name, gender: p.gender, look: p.look, college: p.college, major: p.major, year: p.year, motto: p.motto, cardNo: p.cardNo, ...(p.app ? { app: p.app } : {}) });

export type ClientMsg =
  | { t: 'hello'; v: number; token: string; profile: Profile }
  /** ch 不写 = world；sys 不能发言 */
  | { t: 'chat'; text: string; ch?: ChannelId }
  /** 要我的频道状态（服务器在 welcome 之后会主动发一次，一般不用主动要） */
  | { t: 'ch_get' }
  /** 改某个频道的开关 / 静音：on:false = 关闭（不收也不能发）；服务器清洗、存档后回 channels */
  | { t: 'ch_set'; ch: ChannelId; on?: boolean; mute?: boolean }
  | { t: 'profile'; profile: Profile }
  | { t: 'board_get' }
  | { t: 'board_post'; cat: number; text: string }
  | { t: 'admin_login'; key: string }
  | { t: 'admin_resume'; token: string }
  | { t: 'admin_logout' }
  | { t: 'board_del'; id: number }
  | { t: 'board_del_by'; by: string }
  /** 举报：kind = chat / dm / board / wall / user；ref = 内容编号（见 ReportEntry.ref），校园墙评论再给 cid */
  /** kind = chat 时 ch 是被举报的话所在的频道（不写 = world） */
  | { t: 'report'; kind: ReportKind; ref: number; cid?: number; reason: number; note?: string; ch?: ChannelId }
  /** 管理员控制台操作（服务器只认管理员连接） */
  | ({ t: 'adm' } & AdminOp)
  | { t: 'notice_publish'; title: string; body: string }
  | { t: 'notice_edit'; id: number; title: string; body: string }
  | { t: 'notice_del'; id: number }
  /** 站长编写「关于」页的致谢（thanks = null：恢复默认） */
  | { t: 'about_thanks_set'; thanks: string[] | null }
  | { t: 'social_get' }
  | { t: 'whois'; uid: number }
  | { t: 'friend_req'; uid: number }
  | { t: 'friend_accept'; uid: number }
  | { t: 'friend_decline'; uid: number }
  | { t: 'friend_remove'; uid: number }
  /** 给好友写备注（空 = 清除；只有自己看得到） */
  | { t: 'friend_note'; uid: number; note: string }
  | { t: 'block'; uid: number }
  | { t: 'unblock'; uid: number }
  | { t: 'dm'; to: number; text: string }
  | { t: 'dm_history'; with: number; before?: number }
  | { t: 'dm_read'; with: number }
  /** 背包：只读（所有增减都由服务器按规则执行） */
  | { t: 'inv_get' }
  | { t: 'cats_get' }
  | { t: 'cat_pet'; id: number }
  | { t: 'cat_feed'; id: number; item: string }
  /** 抱抱（挚友以上；服务器回 cat_result，kind = 'hug'） */
  | { t: 'cat_hug'; id: number }
  /** 喂水禽（精工湖的鸭子 / 天鹅；id 见 shared/waterfowl.ts）：消耗 1 份鱼饵，服务器回 bird_result */
  | { t: 'bird_feed'; id: number }
  /** 让亲密的小猫跟着我 / 回家；给它取专属名字（空 = 清除） */
  | { t: 'cat_follow'; id: number; on: boolean }
  | { t: 'cat_nick'; id: number; name: string }
  /** 成就：读取；上报事件（服务器校验条件后才解锁）。目前的事件：校名石彩蛋走完一轮 */
  | { t: 'ach_get' }
  | { t: 'ach_event'; ev: AchEvent; /** 凌晨四点成就：设备的时区偏移（分钟，同 getTimezoneOffset），服务器用自己的时钟换算当地时间 */ tz?: number }
  /** 上/下共享单车：上车时服务器会检查玩家是不是在停车架旁边 */
  | { t: 'ride'; on: boolean }
  /** 坐下/起身：坐下时服务器会检查玩家是不是在某张长椅旁边 */
  | { t: 'sit'; on: boolean }
  /** 表情动作（编号见 emotes.ts） */
  | { t: 'emote'; e: number }
  /** 手持物（编号见 held.ts，0 = 放下）：只是外观，服务器转发给看得见我的人 */
  | { t: 'held'; h: number }
  /** 节日装扮：要状态 / 戴上（c = 装扮编号，0 = 脱下；没获得的会被拒） */
  | { t: 'fz_get' }
  | { t: 'fz_set'; c: number }
  /** 钓鱼：抛竿（朝向取服务器记的）/ 收竿 / 收线放弃；钓鱼图鉴 */
  | { t: 'fish_cast' }
  | { t: 'fish_reel' }
  /** 拉鱼小游戏结束：win = 拉满了；perfect = 鱼几乎一直在绿条里 */
  | { t: 'fish_end'; win: boolean; perfect?: boolean }
  /** 校园币与商店：买（qty 份）、卖（n 件）、一键卖出；余额主动发 coins */
  | { t: 'coins_get' }
  | { t: 'shop_buy'; id: string; qty: number }
  | { t: 'shop_sell'; id: string; n: number }
  | { t: 'shop_sell_bulk' }
  /** 翻第 bin 号垃圾桶（编号 = 世界文件里垃圾桶列表的下标）；名人堂：取三张榜 */
  | { t: 'bin_search'; bin: number }
  | { t: 'hall_get' }
  /** 钓鱼装备栏：给某一格选一件（id = '' 表示自动，用背包里最低级的）；slot 'tackle' = 配件（点一下装上、再点取下，id '' = 全部取下）、'target' = 指名饵要咬的那种鱼 */
  | { t: 'equip_set'; slot: 'rod' | 'bait' | 'tackle' | 'target'; id: string }
  /** 钓鱼 2.0：打开背包里的一个盲盒；合成（recipe 见 craft.ts，param = 指名饵选的鱼）；装备图鉴；领钓鱼册页的奖励 */
  | { t: 'box_open'; id: string; /** 一次开几个（缺省 1，最多 BOX_BATCH_MAX） */ n?: number }
  | { t: 'craft'; recipe: string; param?: string }
  | { t: 'geardex_get' }
  | { t: 'bundle_claim'; id: string }
  /** 钓鱼 3.0：取等级信息 / 切换路线槽（slot 0 = 5 级的、1 = 10 级的；route 'fisher' | 'finder' | ''）/ 取委托 / 领委托（id = 'mid' | 'hard' | 'extreme' | 'daily'）/ 放生 */
  | { t: 'fx_get' }
  | { t: 'fx_route'; slot: number; route: string }
  | { t: 'wq_get' }
  | { t: 'wq_claim'; id: string }
  | { t: 'fish_release'; id: string }
  /** 玩家交易：邀请 / 接受 / 拒绝或取消 / 修改自己的报价 / 确认（on=false 取消确认） */
  | { t: 'trade_invite'; uid: number }
  | { t: 'trade_accept'; tid: number }
  | { t: 'trade_cancel'; tid: number }
  | ({ t: 'trade_offer'; tid: number } & TradeOffer)
  | { t: 'trade_ready'; tid: number; on: boolean }
  /** 校园墙：看一页帖子 / 打开一条帖子 / 发帖（anon = 匿名）/ 评论 / 点赞（再点取消）/ 删除（c = 评论 id）/ 举报 / 管理员删某作者全部 */
  | { t: 'wall_list'; before?: number; /** 管理员：只看待审核的 */ pending?: boolean; /** 排序：new（默认）/ hot；hot 翻页用 off（偏移）+ at（第一页返回的时间，保证翻页时排名不变） */ sort?: WallSort; off?: number; at?: number }
  | { t: 'wall_review'; id: number; ok: boolean }
  | { t: 'wall_open'; id: number }
  | { t: 'wall_post'; text: string; anon: boolean }
  | { t: 'wall_comment'; id: number; text: string; anon: boolean }
  | { t: 'wall_like'; id: number }
  | { t: 'wall_del'; id: number; c?: number }
  | { t: 'wall_report'; id: number; c?: number }
  | { t: 'wall_del_by'; by: string }
  /** 地点留言板（规则见 shared/place.ts；非管理员要站在这个地点附近才能用）：place_up = 要一张一次性上传券（POST 图片用）；place_open = 打开某地点的留言板 / 翻页（before = 只看比这个 id 更早的；hot 排序翻页用 off + at）；place_thread = 看一条留言和它的评论 */
  | { t: 'place_up'; key: string }
  | { t: 'place_open'; key: string; sort?: WallSort; before?: number; off?: number; at?: number }
  | { t: 'place_thread'; id: number }
  | { t: 'place_post'; key: string; text: string; /** 已经上传好的图片（每张：place_up 券 + POST 返回的 img；最多 9 张，不能重复）；文字和图片至少要有一样 */ imgs?: string[] }
  | { t: 'place_comment'; id: number; text: string }
  | { t: 'place_like'; id: number }
  | { t: 'place_del'; id: number; c?: number }
  | { t: 'place_report'; id: number; c?: number }
  /** 管理员：所有地点的留言总览（tab = all 全部 / pending 待审核 / img 带图的；key 只看某个地点；before = 翻页）；审核（ok = 通过 / 驳回删除）；删某条留言作者的全部留言和评论（id = 那条留言） */
  | { t: 'place_admin'; tab: 'all' | 'pending' | 'img'; key?: string; before?: number }
  | { t: 'place_review'; id: number; ok: boolean }
  | { t: 'place_del_by'; id: number }
  | { t: 'fish_cancel' }
  | { t: 'fishdex_get' }
  /** 校园跑：单人计时 / 先开一场候场（再邀请好友）/ 邀请好友 / 接受 / 拒绝 / 房主开始 / 退出 / 读取我的成绩 */
  /** 好友位置：是否对好友隐藏我的位置 */
  | { t: 'loc_hide'; on: boolean }
  /** 组队：邀请好友（队长）/ 接受 / 拒绝 / 退出 / 请人离开（队长）/ 传送到队友身旁 / 读取队伍；坐上队友的车 / 下车 */
  | { t: 'party_invite'; uid: number }
  | { t: 'party_accept'; pid: number }
  | { t: 'party_decline'; pid: number }
  | { t: 'party_leave' }
  | { t: 'party_kick'; uid: number }
  | { t: 'party_tp'; uid: number }
  | { t: 'party_get' }
  | { t: 'pax_join'; uid: number }
  | { t: 'pax_leave' }
  | { t: 'run_solo' }
  | { t: 'run_new' }
  | { t: 'run_invite'; uid: number }
  | { t: 'run_accept'; rid: number }
  | { t: 'run_decline'; rid: number }
  | { t: 'run_start' }
  | { t: 'run_leave' }
  | { t: 'run_get' }
  /** 每日任务：读取今天的任务和进度 */
  | { t: 'quest_get' }
  /** 称号：读取我的称号；佩戴（id 为空字符串 = 不戴） */
  | { t: 'title_get' }
  | { t: 'title_set'; id: string }
  /** 精灵：读取全部 / 领初始精灵 / 在队伍与精灵背包之间移动 / 调整队伍顺序 / 取昵称（空 = 恢复原名）/ 放生 */
  | { t: 'mon_get' }
  | { t: 'mon_starter'; sp: string }
  | { t: 'mon_move'; id: string; to: 'sq' | 'bx' }
  | { t: 'mon_order'; ids: string[] }
  | { t: 'mon_nick'; id: string; name: string }
  | { t: 'mon_free'; id: string }
  /** 学 / 换技能：move 必须是服务器下发的 learnable 里的；drop = -1 放空槽，>= 0 替换该下标 */
  | { t: 'mon_replace'; id: string; move: string; drop: number }
  /** 和训练家 NPC 切磋：id 见 shared/trainers.ts */
  | { t: 'trainer_battle'; id: string }
  /** 野外遭遇：迎战 / 走开；战斗行动（bid 与回合号必须是服务器当前的；捕捉的倍率由服务器按背包里的道具定） */
  /** 手拉手：邀请好友 / 接受（uid = 邀请我的人）/ 拒绝 / 松手 */
  | { t: 'hand_invite'; uid: number }
  | { t: 'hand_accept'; uid: number }
  | { t: 'hand_decline'; uid: number }
  | { t: 'hand_end' }
  /** 定点传送：传到一个预设地点（服务器校验状态与冷却，并在目标附近找能站的位置） */
  | { t: 'tp_go'; id: string }
  /** 宿舍：要我的宿舍信息 / 选楼栋 / 点「宿舍」按钮回家（传到自己宿舍楼门口并进屋）/ 在自己宿舍楼门口按 E 进屋 / 出屋 / 切换空调 / 上床睡觉或起床 / 宝箱存取 */
  | { t: 'dorm_get' }
  | { t: 'dorm_bind'; b: string }
  | { t: 'dorm_go' }
  | { t: 'dorm_enter' }
  | { t: 'dorm_leave' }
  | { t: 'dorm_ac' }
  | { t: 'dorm_sleep'; on: boolean }
  | { t: 'dorm_chest'; op: 'put' | 'take'; id: string; n: number }
  /** 浴缸放鱼 / 取回（只有房主在自己宿舍里能用） */
  | { t: 'dorm_bath'; op: 'put' | 'take'; id: string; n: number }
  /** 装修：place = 从背包摆一件（d = 家具物品 id）/ move = 挪动或转向已摆的第 i 件 / pick = 收回第 i 件 / reset = 一键还原（全部收回背包、房间摆回刚住进来的样子）/ undo = 撤回刚才的一键还原 */
  /** 给 TA 的宿舍点赞 / 取消赞；设置我的宿舍要不要在资料卡上展示 */
  | { t: 'dorm_like'; uid: number }
  /** 买 / 换墙纸（kind = w）和地板（kind = f）：i = 样式下标；扩建房间 */
  | { t: 'dorm_skin'; kind: 'w' | 'f'; i: number; op: 'buy' | 'use' }
  | { t: 'dorm_expand' }
  | { t: 'dorm_pub'; on: boolean }
  | { t: 'dorm_lay'; op: 'place' | 'move' | 'pick' | 'dye' | 'reset' | 'undo'; d?: string; i?: number; x?: number; y?: number; r?: number; /** 染色：色号 1..12，0 = 染回原色 */ c?: number }
  /** 宿舍做客：邀请好友来我的宿舍（我得在自己宿舍里）/ 敲好友宿舍的门（好友得在宿舍里）/ 回应别人的邀请或敲门 / 房主改门牌 / 在宿舍里报自己的位置（屋里的坐标，像素） */
  /** 切换世界：public = 公共世界，solo = 个人世界；remember = 下次登录也默认进这个世界 */
  | { t: 'world_set'; kind: 'public' | 'solo'; /** 记住这次的选择，下次登录就进这个世界（默认记） */ remember?: boolean }
  /** 好友世界：房主邀请好友一起玩 / 好友申请加入房主的世界 / 回应别人的邀请或申请 / 房主请人出去 / 设置（不接受好友申请加入我的个人世界） */
  | { t: 'world_invite'; uid: number }
  | { t: 'world_knock'; uid: number }
  | { t: 'world_reply'; uid: number; accept: boolean }
  | { t: 'world_kick'; uid: number }
  | { t: 'world_opts'; noAsk: boolean }
  | { t: 'dorm_invite'; uid: number }
  | { t: 'dorm_knock'; uid: number }
  | { t: 'dorm_reply'; uid: number; accept: boolean }
  | { t: 'dorm_title'; text: string }
  /** 把好感 ≥ 200 的小猫接回宿舍养（on=true）/ 送回校园（on=false） */
  | { t: 'dorm_cat'; id: number; on: boolean }
  | { t: 'room_move'; x: number; y: number; flags: number }
  /** 好感度满值时收服一只校园小猫为精灵 / 和一只校园小猫「老吴对战」 */
  | { t: 'cat_tame'; id: number }
  | { t: 'cat_battle'; id: number }
  | { t: 'mon_go'; accept: boolean }
  | { t: 'mon_act'; bid: string; turn: number; a: { t: 'move'; i: number } | { t: 'ball' } | { t: 'swap'; i: number } | { t: 'run' } }
  /** 身份恢复：新浏览器里输入备份码解出的 token，在 hello 之前发；服务器只回资料，不建立会话 */
  | { t: 'restore'; token: string };

export type ServerMsg =
  | { t: 'welcome'; id: number; uid: number; x: number; y: number; online: number }
  /** ttl = 这个玩家佩戴的称号 id（服务器认定的，没戴就没有这个字段） */
  | { t: 'spawn'; id: number; uid: number; x: number; y: number; flags: number; p: PublicProfile; ttl?: string; /** 手持物（没拿就没有这个字段） */ held?: number; /** 节日装扮编号（没戴就没有这个字段） */ fz?: number; /** 正在保持的持续型表情（躺下 / 坐地）的编号 */ pose?: number }
  | { t: 'despawn'; id: number }
  /** ch 不写 = world；party 的话客户端用不同颜色的气泡。broadcast = 系统广播（如钓鱼全服播报），客户端弹金色横幅、不进普通气泡 */
  | { t: 'chat'; pid: number; uid: number; from: string; hue: number; text: string; ts: number; /** 记录编号（管理员撤回用） */ mid?: number; ch?: ChannelId; /** 广播类型（广播时用，横幅配色）：鱼稀有度 / 纪录 */ tone?: 'epic' | 'legendary' | 'mythic' | 'record' }
  /** 我现在有哪些频道和各自的状态：登录、组队 / 退队、切世界、ch_set 之后都会发。world / near / sys 永远在；party 只在有队伍时才有 */
  | { t: 'channels'; items: ChannelState[] }
  /** 频道操作失败的提示（如「先把这个频道打开」「你还没有队伍」） */
  | { t: 'ch_result'; ok: boolean; msg: string }
  /** 管理员撤回了这几条公屏消息（按记录编号） */
  | { t: 'chat_recall'; mids: number[] }
  | { t: 'sys'; text: string; ts: number }
  | { t: 'online'; n: number }
  | { t: 'correct'; x: number; y: number }
  | { t: 'kick'; reason: string }
  | { t: 'error'; msg: string }
  | { t: 'board'; items: BoardItem[] }
  | { t: 'board_new'; item: BoardItem }
  | { t: 'board_result'; ok: boolean; msg: string }
  | { t: 'board_del'; ids: number[] }
  /** 公告列表（新的在前）。newId 只在"刚发布了新公告"时带上：在线的玩家据此提示，而不是每次改动都弹窗 */
  | { t: 'notices'; items: Notice[]; newId?: number }
  /** 「关于」页的致谢（null = 用游戏自带的默认）：进来时发一次，站长改了就广播 */
  | { t: 'about_thanks'; thanks: string[] | null }
  /** 好友面板的全部数据：好友（含在线/未读/最近一条）、待我处理的申请、我屏蔽的人 */
  | { t: 'social'; friends: FriendInfo[]; incoming: PersonInfo[]; blocked: PersonInfo[] }
  | { t: 'presence'; uid: number; online: boolean }
  /** 好友上线提示（只发给这位玩家的好友；name 已经是我给 TA 的备注或 TA 的名字；刚下线又很快回来的不发） */
  | { t: 'friend_on'; uid: number; name: string }
  | { t: 'dm'; msg: DmMsg }
  | { t: 'dm_history'; with: number; items: DmMsg[]; more: boolean }
  | { t: 'social_result'; ok: boolean; msg: string }
  /** 别人给我的提示（收到好友申请、申请被通过） */
  | { t: 'social_note'; text: string }
  | { t: 'whois'; uid: number; info: PersonInfo | null; relation: 'none' | 'self' | 'friend' | 'sent' | 'incoming' | 'blocked'; /** TA 的宿舍（没有宿舍、或 TA 选了不展示就没有） */ dorm?: DormCard }
  /** 某间宿舍的赞数变了（我点赞 / 取消之后）：uid = 房主，n = 现在的赞数，liked = 我现在有没有赞 */
  | { t: 'dorm_likes'; uid: number; n: number; liked: boolean; /** 结果提示（成功或失败的原因） */ msg?: string }
  | { t: 'chat_history'; items: ChatHistoryItem[] }
  | { t: 'admin'; ok: boolean; msg?: string; token?: string; /** 登录成功时：站长还是协管员 */ role?: AdminRole }
  /** 整个背包（物品 id → 数量）；gain 带上"这次新得到的东西"，客户端据此提示 */
  | { t: 'inv'; items: Inv; gain?: Gain[] }
  /** 各只小猫对我的好感度（猫编号 → 点数） */
  | { t: 'cats'; aff: Record<string, number>; /** 我送过猫窝的小猫编号 */ beds?: number[]; /** 每只猫"今天的状态"（连续探望天数、今天是否探望/抱过/收过回礼、是否喂到过最爱）；只发有内容的 */ info?: Record<string, CatInfo>; /** 今天已收到几份回礼 / 累计收到几份 */ gifts?: { today: number; total: number } }
  /** 校园币余额；gain = 这次刚得到的数量 */
  | { t: 'coins'; n: number; gain?: number }
  | { t: 'shop_result'; ok: boolean; msg: string }
  /** 我的钓鱼装备栏（'' = 自动） */
  | { t: 'equip'; rod: string; bait: string; tackle: string[]; target: string }
  /** 开盲盒的结果：币、物品、盲盒限定鱼（带尺寸）、重复的东西折成的币（dup）、保底进度（pity / 保底次数 need） */
  | { t: 'box_result'; id: string; ok: boolean; msg?: string; coins?: number; items?: Gain[]; fish?: { id: string; cm: number; kg: number; isNew: boolean }; dup?: number; gem?: boolean; pity?: number; need?: number; /** 一次开了几个（批量开；缺省 1） */ n?: number; /** 批量里开出几个珍品 */ gems?: number; /** 批量开出的鱼（单开时用 fish） */ fishes?: { id: string; cm: number; kg: number; isNew: boolean }[] }
  | { t: 'craft_result'; ok: boolean; msg: string }
  /** 装备图鉴：拥有过的竿 / 配件、用过的饵、开过的盲盒、保底、已领的册页和神话首奖 */
  | { t: 'geardex'; gd: GearLog }
  | { t: 'bundle_result'; ok: boolean; msg: string; id: string }
  /** 钓鱼等级：xp 总经验、lv 等级、into / need 本级进度、rt 两个路线槽、rel 放生次数、wk 周委托全勤周数、today 今天已算过的基础经验（软上限）；up = 刚升级（from → to，奖励） */
  | { t: 'fx'; xp: number; lv: number; into: number; need: number; rt: string[]; rel: number; wk: number; today: number; up?: { from: number; to: number; coins: number; items: Gain[] } }
  /** 委托：本周三个 + 今日一个；allDone = 三个周委托都完成了；allClaimed = 全勤奖励已领 */
  | { t: 'wq'; week: number; list: CommView[]; daily: CommView; allDone: boolean; allClaimed: boolean }
  | { t: 'wq_result'; ok: boolean; msg: string; id: string }
  | { t: 'release_result'; ok: boolean; msg: string; id: string; coins?: number; xp?: number; rel?: number }
  /** 翻垃圾桶的结果：翻出了什么（id、treasure = 是不是好东西）、今天还能翻几次 */
  | { t: 'bin_result'; ok: boolean; msg: string; id?: string; treasure?: boolean; left?: number }
  | ({ t: 'hall' } & HallData)
  /** 交易：有人邀请我 / 我发出了邀请在等对方 / 交易进行中的双方报价 / 交易结束（成交或取消） */
  | { t: 'trade_invite'; tid: number; uid: number; name: string }
  | { t: 'trade_wait'; tid: number; name: string }
  | { t: 'trade_state'; tid: number; with: { uid: number; name: string }; me: TradeSide; they: TradeSide }
  | { t: 'trade_end'; tid: number; ok: boolean; msg: string }
  /** 交易里的一条提示（报价不合法、邀请被拒之类，不结束交易） */
  | { t: 'trade_note'; msg: string }
  | { t: 'wall_posts'; items: WallPost[]; more: boolean; append?: boolean; /** 管理员：待审核的帖子数 */ pending?: number; /** 这页是按什么排的、是不是待审核栏、热度排序的下一页偏移和排名时间 */ sort?: WallSort; tab?: 'pub' | 'pending'; next?: number; at?: number }
  /** 管理员：有新帖等着审核 */
  | { t: 'wall_pending'; n: number }
  | { t: 'wall_thread'; post: WallPost; comments: WallComment[] }
  | { t: 'wall_result'; ok: boolean; msg: string }
  /** 地点留言板：上传券（POST 到 url，网页根目录下的相对地址，body = packPlaceImg 的包；返回 JSON { ok, img?, msg? }）；一页留言；一条留言和评论；操作结果；管理员总览 */
  | { t: 'place_up_ticket'; key: string; ticket: string; url: string }
  | { t: 'place_posts'; key: string; name: string; items: PlacePost[]; more: boolean; append?: boolean; sort: WallSort; at: number; next?: number; /** 这个地点已发布的留言总数 */ total: number }
  | { t: 'place_thread'; post: PlacePost; comments: PlaceComment[] }
  | { t: 'place_result'; ok: boolean; msg: string }
  | { t: 'place_admin_list'; tab: 'all' | 'pending' | 'img'; key?: string; items: PlacePost[]; more: boolean; append?: boolean; /** 待审核的留言数 */ pending: number; /** 全部留言数（含待审核）、图片总数 */ total: number; images: number; /** 有留言的地点（key、名字、条数），做筛选用 */ places: { key: string; name: string; n: number }[] }
  | { t: 'place_pending'; n: number }
  | { t: 'cat_result'; id: number; kind: 'pet' | 'feed' | 'hug'; r: CatResult }
  /** 服务器当前时间（毫秒时间戳）：进来时发一次，之后每 30 秒一次；客户端据此校准游戏时钟，让全服时间一致 */
  | { t: 'time'; now: number }
  /** 跟随/取名的结果提示 */
  | { t: 'cat_msg'; ok: boolean; msg: string }
  /** 喂水禽的结果；left = 今天还能喂几次 */
  | { t: 'bird_result'; id: number; ok: boolean; msg: string; gifts: Gain[]; left?: number }
  /** 我给小猫取的专属名字（只发给我自己） */
  | { t: 'cat_nicks'; nicks: Record<string, string> }
  /** 谁带着哪只猫：整份（猫编号 → 玩家编号）/ 一只猫变了（pid 0 = 回家了） */
  | { t: 'cat_follows'; map: Record<string, number> }
  | { t: 'cat_follow'; id: number; pid: number }
  | { t: 'ride_result'; ok: boolean; msg?: string }
  /** 坐下结果：成功时 x/y 是座位上的位置（服务器已经把玩家放到那里） */
  | { t: 'sit_result'; ok: boolean; msg?: string; x?: number; y?: number }
  /**
   * 钓鱼状态：wait 抛竿成功在等鱼（x/y = 浮漂位置）；bite 鱼咬钩了，赶紧收竿；
   * catch 钓到了（id 鱼/物品、cm 尺寸、isNew 图鉴新种类、record 新纪录、junk 是杂物）；miss 没钓到（msg 说明）；idle 收线/被打断
   */
  | { t: 'fish_state'; s: 'idle' | 'wait' | 'bite' | 'fight' | 'catch' | 'miss'; msg?: string; x?: number; y?: number; id?: string; cm?: number; kg?: number; isNew?: boolean; record?: boolean; junk?: boolean; perfect?: boolean; /** fight：拉鱼小游戏的参数（鱼是什么要等拉上来才知道） */ seed?: number; diff?: number; move?: 'smooth' | 'mixed' | 'dart'; /** fight：配件给的拉鱼加成、神话鱼的皇冠 / 中途发力 */ bar?: number; sink?: number; cling?: number; drop?: number; burst?: boolean; crown?: boolean; /** bite：声呐浮标告诉你是什么鱼（只发图鉴里已有的） */ sonar?: string; /** catch：双钓（钓到两条）、顺带钓上来的盲盒、河蚌里的珍珠、神话鱼首次的奖励 */ twin?: boolean; box?: string; pearl?: boolean; first?: boolean; /** catch：钓鱼经验（分项）和升级后的等级 */ xp?: { total: number; base: number; perfect: number; isNew: number; capped?: boolean }; lv?: number }
  | RunMsg
  | PartyMsg
  /** 留在原地的共享单车：整份列表（进来时）/ 新停下一辆 / 一辆没了（被骑走或超时消失） */
  | { t: 'bike_drops'; list: DroppedBike[] }
  | { t: 'bike_drop'; bike: DroppedBike }
  | { t: 'bike_gone'; id: number }
  /** 管理员控制台：在线玩家 / 全部小猫 / 操作结果；小猫名字（管理员改过名的覆盖值，所有人都会收到） */
  /** 敏感词过滤的当前状态（管理员面板用） */
  /** 我现在在哪个世界（进入/切换/成员变化时发）：kind、主人、世界里有几个人、登录默认进哪个 */
  | { t: 'world_state'; kind: 'public' | 'solo' | 'group'; owner: number; ownerName?: string; size: number; dflt: 'public' | 'solo'; /** 不接受好友申请加入我的个人世界 */ noAsk?: boolean; /** 好友世界的成员（房主在前不保证，客户端按 owner 找） */ members?: { uid: number; name: string }[]; /** 管理员隐身观察中（别人看不到我、我不能发言） */ ghost?: boolean }
  /** 有人邀请我去 TA 的好友世界（kind = invite）/ 想加入我的世界（kind = knock）：30 秒内回应 */
  | { t: 'world_ask'; uid: number; name: string; kind: 'invite' | 'knock' }
  | { t: 'world_result'; ok: boolean; msg: string }
  | { t: 'adm_filter'; f: AdminFilter }
  /** 管理员：公屏记录 / 私聊会话列表或聊天内容 / 玩家详情 / 封禁名单 / 操作记录 */
  | { t: 'adm_chatlog'; items: AdminChatItem[]; more: boolean }
  | { t: 'adm_dmlog'; uid: number; name: string; peers?: AdminDmPeer[]; peer?: number; peerName?: string; items?: AdminDm[]; more?: boolean }
  | { t: 'adm_info'; info: AdminInfo }
  /** 重发身份备份码的结果：只发给操作的站长，只这一次（服务器不保存） */
  | { t: 'adm_code'; uid: number; name: string; code: string }
  /** 找人的结果（q 是搜的什么，界面用它丢掉过期的结果） */
  | { t: 'adm_hits'; q: string; items: AdminHit[]; /** 还有更多没列出来 */ more: boolean }
  | { t: 'adm_dossier'; d: AdminDossier }
  /** 管理员：举报列表 / 未处理的举报条数（有新举报时、刷新玩家列表时发）/ 所有世界 */
  | { t: 'adm_reports'; items: ReportEntry[]; more: boolean; open: number; append?: boolean }
  | { t: 'rep_n'; n: number }
  | { t: 'adm_worlds'; items: AdminWorld[]; mine: string }
  /** 举报的结果（成功 / 重复 / 太快） */
  | { t: 'report_result'; ok: boolean; msg: string }
  | { t: 'adm_bans'; items: BanEntry[] }
  | { t: 'adm_audit'; items: AuditEntry[]; more: boolean }
  /** 资料里有不适合的内容：服务器给出（改过的）资料，客户端换上；登录时老昵称命中新词也会走这条 */
  | { t: 'profile_fix'; profile: Profile }
  | { t: 'adm_players'; items: AdminPlayer[]; online: number; total: number; locked: boolean; /** 公屏进出提示是否开着 */ announce: boolean }
  | { t: 'adm_cats'; items: AdminCat[] }
  /** 某位玩家和各只小猫的关系：好感度、专属名字 */
  | { t: 'adm_pcats'; uid: number; name: string; items: { id: number; name: string; aff: number; level: number; nick?: string; following: boolean }[] }
  | { t: 'adm_result'; ok: boolean; msg: string }
  | { t: 'cat_names'; names: Record<string, string> }
  /** 在线好友的大致位置（按我的视角算好）；hidden = 我是否对好友隐藏了自己的位置 */
  | { t: 'locs'; hidden: boolean; items: FriendLoc[] }
  /** 钓鱼图鉴：鱼 id → 钓到几条、最大尺寸 */
  | { t: 'fishdex'; log: Record<string, FishLog> }
  /** 有人（pid = 玩家编号，包括我自己）做了表情 */
  | { t: 'emote'; pid: number; e: number }
  /** 持续型表情结束了（走动 / 再点一次 / 被传走）：pid 站起来。老客户端不认识这条会忽略 */
  | { t: 'emote_end'; pid: number }
  | { t: 'held'; pid: number; h: number }
  /** 别人的节日装扮变了（c = 编号，0 = 脱下） */
  | { t: 'fz'; pid: number; c: number }
  /** 自己的节日装扮：own = 已获得的编号，on = 戴着的；news = 刚获得的（用来弹提示）；gift = 刚领到的节日礼物 */
  | { t: 'fz_state'; own: number[]; on: number; news?: number[]; gift?: { id: string; n: number }[] }
  /** 全部成就解锁记录（成就 id → 解锁时间）；new = 这次刚解锁的（客户端据此弹提示） */
  | { t: 'ach'; unlocked: Record<string, number>; new?: string[] }
  /** 今天的任务进度；full = 累计做完全部任务的天数；fresh = 这次刚完成的任务（客户端据此弹提示） */
  | { t: 'quests'; list: QuestState[]; full: number; fresh?: string[] }
  /** 我的称号：已获得（称号 id → 时间）与正在佩戴的；new = 这次刚得到的（客户端据此弹提示） */
  | { t: 'titles'; own: Record<string, number>; sel: string; new?: string[] }
  /** 我的精灵：出战队伍、精灵背包、图鉴、是否领过初始精灵；starters = 可选的初始精灵（只在没领过时有用） */
  | { t: 'mon_data'; sq: Mon[]; bx: Mon[]; dex: Record<string, DexEntry>; starter: boolean; starters: string[]; /** 已经收服过的校园猫编号 */ tamed: number[]; /** 服务端算好的可学技能（精灵 id → 技能 id，按等级排序）；没有就不显示更换入口 */ learnable?: Record<string, string[]> }
  | { t: 'mon_result'; ok: boolean; msg: string }
  | { t: 'tp_result'; ok: boolean; msg: string }
  /** 我的宿舍：楼栋（没绑定 = 没有）、今天还能不能改楼栋、空调、宝箱；options = 能选的楼栋（按社区分组） */
  | { t: 'dorm_data'; /** 门牌（房主起的名字，没起过就没有） */ title?: string; b?: string; canChange: boolean; ac: number; ch: Record<string, number>; /** 浴缸里养的鱼（只有房主收到） */ bt?: Record<string, number>; /** 浴缸概览（闪光用） */ bv?: BathView; /** 家具摆放（装修过才有；没有 = 默认布局） */ lay?: Placed[]; /** 1 = 不在资料卡上展示 */ hid?: boolean; /** 房间级别（1 中屋 / 2 大屋，没有 = 小屋）、墙纸地板（w、f 正在用的样式；ow、of 已拥有的样式，按位记） */ rm?: 1 | 2; sk?: { w?: number; f?: number; ow?: number; of?: number }; /** 我的宿舍收到的赞数 */ likes?: number; /** 养在宿舍的小猫编号 */ dc?: number[]; /** true = 刚做过一键还原、还能撤回 */ ru?: boolean; options: { group: string; names: string[] }[] }
  /** 可以进屋了（x、y = 我在宿舍楼门口的位置，像素）/ 宿舍操作的结果 */
  | { t: 'dorm_in'; x: number; y: number }
  /** 服务器把人从宿舍里带走了（传送、队友传送、被管理员传走…）：客户端要离开室内、留在新位置 */
  | { t: 'dorm_out'; /** 为什么被带出来（房主离开了…）；没有就是自己传走的 */ msg?: string }
  /** 有人邀请我去 TA 的宿舍（kind = invite），或有人想来我的宿舍（kind = knock）；30 秒内回应 */
  | { t: 'dorm_ask'; uid: number; name: string; kind: 'invite' | 'knock'; title?: string }
  /** 我进了好友的宿舍：房主、门牌（房主起的名字，可能为空）、空调、房主是不是在睡觉、屋里已经有的人 */
  | { t: 'dorm_visit'; host: number; hostName: string; title: string; ac: number; sleeping: boolean; bv?: BathView; lay?: Placed[]; rm?: 1 | 2; sk?: { w?: number; f?: number }; /** 这间宿舍的赞数、我有没有赞过 */ likes?: number; liked?: boolean; /** 房主养在宿舍的小猫编号（访客只能看） */ dc?: number[]; roster: RoomWho[] }
  /** 屋里有人进来 / 出去 / 动了；屋里的状态变了（空调、门牌、房主睡觉） */
  | { t: 'room_join'; w: RoomWho }
  | { t: 'room_leave'; id: number }
  | { t: 'room_pos'; id: number; x: number; y: number; flags: number }
  | { t: 'room_state'; ac: number; title: string; sleeping: boolean; bv?: BathView; sk?: { w?: number; f?: number } }
  | { t: 'dorm_result'; ok: boolean; msg: string; /** 睡太久，服务器让你起床了 */ wake?: boolean }
  /** 手拉手：有人想牵我的手 / 全部牵着手的一对（玩家编号，l = 牵手的人，f = 被牵的人；画连线用）/ 我自己的状态（role = 我是牵的人/被牵的人/没有；pid、name = 对方）/ 操作结果 */
  | { t: 'hand_invite'; uid: number; name: string }
  | { t: 'hand_pairs'; list: { l: number; f: number }[] }
  | { t: 'hand_me'; role: 'lead' | 'follow' | 'none'; pid: number; name: string; /** 被牵的人站在队头的哪一侧（+1 / −1） */ side?: 1 | -1; msg?: string }
  | { t: 'hand_result'; ok: boolean; msg: string }
  /** 草丛里有动静：遇到了哪只（ms 之内不答复算走开）/ 提示已失效 */
  | { t: 'mon_enc'; sp: string; lv: number; sh?: 1; zone: string; ms: number }
  | { t: 'mon_enc_end' }
  /** 战斗状态（结算后的权威状态 + 这一回合发生的事件，客户端按事件播放动画）；foe 只含对手公开的信息 */
  | { t: 'mon_bt'; bid: string; turn: number; phase: 'choose' | 'swap' | 'over'; result?: 'win' | 'lose' | 'caught' | 'fled'; lead: number; sq: Mon[]; foe: { sp: string; lv: number; hp: number; max: number; sh?: 1 }; ev: BEvent[]; ball: number; zone: string; /** 对手是校园小猫（友谊赛）：猫编号与名字 */ cat?: { id: number; name: string }; /** 训练家对战：训练家信息与对方队伍（按上场顺序） */ trainer?: { id: string; name: string; squad?: { sp: string; lv: number; hp: number; max: number; sh?: 1 }[] } }
  | { t: 'restored'; ok: boolean; profile?: Profile; msg?: string };

/** token：客户端随机生成，只用来"记住你"。16–64 位字母数字/横线/下划线 */
export const validToken = (t: unknown): t is string => typeof t === 'string' && /^[A-Za-z0-9_-]{16,64}$/.test(t);
