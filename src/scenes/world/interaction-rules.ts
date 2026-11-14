/**
 * 按 E 能做什么——**纯规则**：给定这一帧收集到的候选（离我最近的猫 / 门 / 单车…），按固定优先级挑出提示文字和（按了键才有的）动作。
 * 不依赖 Phaser，可以直接单测（tests/world-interaction.test.ts）。收集候选和执行动作在 interaction.ts。
 * 优先级（从高到低）：坐队友的车 > 校园跑 > 钓鱼中 > 坐着 > 骑车 > 钓鱼沉浸 > 水禽 > 小猫 > 建筑门口 > 彩蛋区 > 队友单车 > 共享单车 > 垃圾桶 > 长椅 > 校园跑起点 > 湖边抛竿 > 路人。
 */
import { fishingBlocksInteract, fishingPrefersCast, type FishLockState } from '@/systems/fishlock';
import { CAT_REACH } from '@/shared/cats';

export type FishPhase = 'idle' | 'wait' | 'bite' | 'fight';
/** 湖边抛竿的条件：没竿 / 没饵 / 指名饵没指定鱼 / 可以抛 */
export interface CastInfo { state: 'norod' | 'nobait' | 'needtarget' | 'ok'; rodName?: string; baitName?: string; baitN?: number }
export function castHint(c: CastInfo): string {
  if (c.state === 'norod') return '这里可以钓鱼（需要鱼竿：每天登录会送）';
  if (c.state === 'nobait') return '鱼饵用完了（明天登录、做每日任务会送，商店也有卖）';
  if (c.state === 'needtarget') return '指名饵要先在背包的装备栏里指定一种鱼';
  return `E  抛竿钓鱼（${c.rodName}，${c.baitName} ×${c.baitN}）`;
}

export type Act =
  | { t: 'pax_leave' } | { t: 'fish_reel' } | { t: 'fish_cancel' } | { t: 'stand' } | { t: 'dismount' } | { t: 'mount' }
  | { t: 'bird_feed'; id: number } | { t: 'cast' } | { t: 'open_cat'; ref: unknown }
  | { t: 'dorm_enter' } | { t: 'enter_interior'; ref: unknown } | { t: 'dialog'; title: string; text: string | string[] }
  | { t: 'panel'; which: 'board' | 'shop' | 'fishshop' | 'wall' | 'portal' } | { t: 'egg'; ref: unknown }
  | { t: 'pax_join'; uid: number } | { t: 'bin'; idx: number } | { t: 'sit'; ref: unknown } | { t: 'run_open' } | { t: 'talk'; ref: unknown };
/** hint：undefined = 这一帧不动提示；null = 清掉提示；string = 显示这句。act 只有按了 E / 空格 / 触屏互动才有 */
export interface Decision { hint: string | null | undefined; act?: Act }

export interface InteractInput {
  press: boolean;
  paxPid: number; runActive: boolean; fishPhase: FishPhase; sitting: boolean; riding: boolean; mateNear: boolean;
  online: boolean;
  /** 钓鱼沉浸状态（含 castable：站在能抛竿的岸边且有竿有饵） */
  lock: FishLockState; cast: CastInfo; fishSpot: boolean;
  /** 站在哪栋楼的门口；home = 那是我绑定的宿舍楼（在线时按 E 回宿舍） */
  near: { ref: unknown; name: string; interior: boolean; desc?: string } | null; home: boolean;
  cat: { ref: unknown; label: string; dist: number } | null;
  bird: { id: number; label: string } | null; baitN: number;
  egg: { ref: unknown; hint: string; action?: string } | null;
  mateBike: { uid: number; name: string } | null; mateFar: { name: string } | null;
  bike: boolean; bin: number; binLeft: number; seat: { ref: unknown } | null; inStart: boolean;
  npc: { ref: unknown } | null;
}

export function decideInteraction(i: InteractInput): Decision {
  const act = (a: Act): Act | undefined => (i.press ? a : undefined);
  if (i.paxPid) return { hint: 'E  下车', act: act({ t: 'pax_leave' }) }; // 坐在队友车后座：只能下车
  if (i.runActive) return { hint: '校园跑进行中：沿跑道按顺序跑（点屏幕上的「放弃」退出）' };
  if (i.fishPhase === 'fight') return { hint: undefined };
  if (i.fishPhase !== 'idle') { // 正在钓鱼：等鱼时按 E 收线放弃，咬钩时按 E 提竿
    const bite = i.fishPhase === 'bite';
    return { hint: bite ? 'E  提竿！！' : 'E  收线（等鱼咬钩…）', act: act(bite ? { t: 'fish_reel' } : { t: 'fish_cancel' }) };
  }
  if (i.sitting) return { hint: 'E  起身　X  表情', act: act({ t: 'stand' }) }; // 坐着：只能起身（或做表情）
  if (i.riding) return { hint: i.mateNear ? 'E  锁车下车（想坐队友的后座，要先下车）' : 'E  锁车下车', act: act({ t: 'dismount' }) }; // 骑车时只有一件事可做
  const cast = (): Decision => ({ hint: castHint(i.cast), act: i.cast.state === 'ok' ? act({ t: 'cast' }) : undefined });
  // 钓鱼沉浸：结算卡片 / 鱼飞出水面时，只剩"再抛一竿"
  if (fishingBlocksInteract(i.lock)) return i.fishSpot ? cast() : { hint: null };
  const near = i.near, egg = i.egg, cat = i.cat;
  // 精工湖的水禽：游到岸边、够得着时，E 优先喂它（建筑门口和彩蛋区仍然优先）
  const bird = !near && !egg && !i.riding ? i.bird : null;
  if (bird) {
    if (!i.online) return { hint: `「${bird.label}」游到了岸边（连上服务器才能喂）` };
    if (i.baitN <= 0) return { hint: `「${bird.label}」游到了岸边：鱼饵用完了（明天登录会送，商店也有卖）` };
    return { hint: `E  喂「${bird.label}」（鱼饵 ×${i.baitN}）`, act: act({ t: 'bird_feed', id: bird.id }) };
  }
  if (fishingPrefersCast(i.lock) && !near && !egg) return cast();
  // 站在猫身边按 E 一定能和它玩：猫排在彩蛋区、队友单车前面；站在建筑门口时，猫够近（< 0.75 个够得着的距离）才抢占提示
  if (cat && !i.riding && (!near || cat.dist < CAT_REACH * 0.75)) return { hint: `E  和「${cat.label}」玩`, act: act({ t: 'open_cat', ref: cat.ref }) };
  if (near) {
    const hint = i.home ? `E  回宿舍（${near.name}）` : `E  ${near.interior ? '进入' : '查看'}：${near.name}`;
    if (i.home) return { hint, act: act({ t: 'dorm_enter' }) };
    if (near.interior) return { hint, act: act({ t: 'enter_interior', ref: near.ref }) };
    return { hint, act: act({ t: 'dialog', title: near.name, text: near.desc ?? `${near.name}。内部暂未开放。` }) };
  }
  if (egg) {
    const a = egg.action;
    return { hint: egg.hint, act: act(a === 'board' || a === 'shop' || a === 'fishshop' || a === 'wall' || a === 'portal' ? { t: 'panel', which: a } : { t: 'egg', ref: egg.ref }) };
  }
  if (i.mateBike) return { hint: `E  坐上 ${i.mateBike.name} 的车后座`, act: act({ t: 'pax_join', uid: i.mateBike.uid }) };
  if (i.mateFar && !cat && !i.bike && !i.seat && !i.fishSpot) return { hint: `${i.mateFar.name} 在骑车：走近他的车，按 E 坐后座` };
  if (i.bike) return { hint: 'E  扫码骑行：共享单车', act: act({ t: 'mount' }) };
  if (i.bin >= 0) return { hint: `E  翻垃圾桶${i.binLeft >= 0 ? `（今天还能翻 ${i.binLeft} 次）` : ''}`, act: act({ t: 'bin', idx: i.bin }) };
  if (i.seat) return { hint: 'E  坐下', act: act({ t: 'sit', ref: i.seat.ref }) };
  if (i.online && i.inStart) return { hint: 'E  校园跑：东区田径场', act: act({ t: 'run_open' }) };
  if (i.fishSpot) return cast();
  if (i.npc) return { hint: 'E  和同学聊聊', act: act({ t: 'talk', ref: i.npc.ref }) };
  return { hint: null };
}
