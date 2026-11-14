/**
 * 训练家 NPC 的定义（客户端与服务器共用）：固定队伍、台词、奖励、位置。
 * 第一批只做图书馆学长；其余两个在数据里预留。
 */
import type { Content, Mon, Rng } from './mons';
import { maxHp, newMon, typeMult } from './mons';
import { foeOf, type Battle } from './battle';

export interface TrainerLine { sp: string; lv: number }
export interface TrainerDef {
  id: string;
  name: string;
  /** 位置描述（给人看） */
  place: string;
  /** 地图坐标（原 5 m/格的蓝图坐标，和 data/campus 一致） */
  tx: number; ty: number;
  /** 造型（预置外观编号，见 char-rig 的 PRESET_LOOKS） */
  look: number;
  squad: readonly TrainerLine[];
  before: string;
  afterWin: string;
  afterLose: string;
  again: string;
  reward: { coins: number; items?: readonly { id: string; n: number }[] };
  /** 训练家对战后的冷却（毫秒） */
  cooldownMs?: number;
}

/** 三个训练家（第一批只开放 t1，其余按 spec 预留） */
export const TRAINERS: readonly TrainerDef[] = [
  {
    id: 't1', name: '图书馆学长', place: '图书馆正门前台阶旁', tx: 181, ty: 190, look: 2,
    squad: [{ sp: 'o08', lv: 8 }, { sp: 'o03', lv: 10 }],
    before: '来切磋一下？我最近在练超能力系。',
    afterWin: '不错不错，你比我想的强多了。',
    afterLose: '再练练吧，图书馆前面随时等你。',
    again: '又来了？那就再打一场。',
    reward: { coins: 300 },
    cooldownMs: 30000,
  },
  {
    id: 't2', name: '操场体育生', place: '东操场看台边', tx: 311, ty: 78, look: 4,
    squad: [{ sp: 'o05', lv: 14 }, { sp: 'o06', lv: 15 }, { sp: 'o08', lv: 16 }],
    before: '热身完了？那就来一场！',
    afterWin: '服了，你这队配得可以。',
    afterLose: '体能还是不够啊，回去再练。',
    again: '还想再试试？来吧。',
    reward: { coins: 500, items: [{ id: 'mon_ball', n: 5 }] },
    cooldownMs: 30000,
  },
  {
    id: 't3', name: '湖畔钓客', place: '精工湖南岸', tx: 196, ty: 128, look: 8,
    squad: [{ sp: 'o02', lv: 20 }, { sp: 'o09', lv: 21 }, { sp: 'o07', lv: 22 }],
    before: '钓鱼不如钓对手，来不来？',
    afterWin: '好家伙，鱼没钓到，倒被你钓走了。',
    afterLose: '回去补补课吧，我继续钓鱼了。',
    again: '又来钓鱼了？还是来打架的？',
    reward: { coins: 800, items: [{ id: 'rod_carbon', n: 1 }] },
    cooldownMs: 30000,
  },
];

export const trainerOf = (id: string): TrainerDef | undefined => TRAINERS.find((t) => t.id === id);

/** 按定义生成队伍（id 形如 t1-f0） */
export function trainerSquad(ct: Content, t: TrainerDef, rnd: Rng, now: number, prefix = ''): Mon[] {
  return t.squad.map((s, i) => newMon(ct, s.sp, s.lv, rnd, `${prefix}${t.id}-f${i}`, now));
}

// ------------------------------------------------------------------ AI
/** 招式对当前对手的克制倍率（取招式的属性对对手属性） */
const bestMoveIndex = (ct: Content, b: Battle, mon: Mon): number => {
  const foe = foeOf(b);
  const foeTypes = ct.species.get(foe.sp)?.types ?? [];
  let best = 0, bestMult = -1;
  mon.mv.forEach((x, i) => {
    const mv = ct.moves.get(x.id); if (!mv) return;
    const m = typeMult(ct.elements, mv.type, foeTypes);
    if (m > bestMult) { bestMult = m; best = i; }
  });
  return best;
};

/**
 * 训练家 AI 出招：60% 概率选对当前对手最克制的招，否则随机。
 * 只用注入的 rnd，保证相同种子结果一致。
 */
export function aiChooseMove(ct: Content, b: Battle, mon: Mon, rnd: Rng): number {
  if (!mon.mv.length) return 0;
  if (rnd() < 0.6) {
    const best = bestMoveIndex(ct, b, mon);
    const mv = ct.moves.get(mon.mv[best]?.id ?? '');
    if (mv && typeMult(ct.elements, mv.type, ct.species.get(foeOf(b).sp)?.types ?? []) >= 2) return best;
  }
  return Math.floor(rnd() * mon.mv.length);
}

/**
 * 训练家换人：当前精灵血量 < 25%、队里还有活的、且连续 2 回合没换人 → 30% 换人。
 * 返回要换上的下标（-1 = 不换）。
 */
export function aiWantsSwap(ct: Content, b: Battle, turnsSinceSwap: number, rnd: Rng): number {
  const cur = foeOf(b);
  const frac = cur.hp / Math.max(1, maxHp(ct, cur));
  if (frac >= 0.25 || turnsSinceSwap < 2) return -1;
  const alive = b.foeSquad.map((m, i) => (m.hp > 0 && i !== b.foeLead ? i : -1)).filter((i) => i >= 0);
  if (!alive.length) return -1;
  if (rnd() >= 0.3) return -1;
  return alive[Math.floor(rnd() * alive.length)];
}
