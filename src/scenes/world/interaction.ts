/**
 * 按 E 能做什么（原 WorldScene.updateInteraction）：
 *  - gatherInteraction：从场景里收集"离我最近的东西"（几何查询，有副作用的只有 JustDown 读键和记 nearBuilding）；
 *  - decideInteraction（interaction-rules.ts）：**纯函数**，按固定的优先级从这些候选里挑出这一帧的提示文字和（按了键才有的）动作；
 *  - runAct：执行动作。
 * 优先级（从高到低）：坐队友的车 > 校园跑 > 钓鱼中 > 坐着 > 骑车 > 钓鱼沉浸 > 水禽 > 小猫 > 建筑门口 > 彩蛋区 > 队友单车 > 共享单车 > 垃圾桶 > 长椅 > 校园跑起点 > 湖边抛竿 > 路人。
 */
import Phaser from 'phaser';
import type { BuildingOut } from '@/shared/world-format';
import type { Cat } from '@/entities/Cat';
import type { Npc } from '@/entities/Npc';
import type { Seat } from '@/shared/seats';
import type { FishLockState } from '@/systems/fishlock';
import { TILE } from '@/core/const';
import { CAT_REACH } from '@/shared/cats';
import { PAX_NEAR, PAX_REACH } from '@/shared/party';
import { nearestSeat, SIT_REACH } from '@/shared/seats';
import { nearestBin } from '@/shared/trash';
import { castTarget } from '@/shared/fishing';
import { pickBait, pickRod } from '@/shared/economy';
import { itemDef } from '@/shared/items';
import { BIRD_FEED_ITEM } from '@/shared/waterfowl';
import { inStartZone } from '@/shared/run';
import { eggAdvance } from '@/world/egg';
import { sfx } from '@/audio/sfx';
import { decideInteraction, type Act, type CastInfo, type FishPhase, type InteractInput } from './interaction-rules';
import { fishLockState, stopFishing } from './fishing';
import { openCat } from './cats';
import { dismount, mount } from './entities';
import { playEgg } from './effects';
import { sitDown, standUp } from './actions';
import { enterInterior } from './transitions';
import type { WorldScene } from '../WorldScene';

/** 从场景里收集这一帧的候选（只在需要时才做重的查询） */
export function gatherInteraction(sc: WorldScene): InteractInput {
  const p = sc.player, k = sc.keys, online = sc.net.status === 'online';
  const readPress = () => Phaser.Input.Keyboard.JustDown(k.e) || Phaser.Input.Keyboard.JustDown(k.space) || sc.touchPress;
  const base = { paxPid: sc.paxPid, runActive: sc.runUi.active, fishPhase: sc.fishPhase as FishPhase, sitting: p.sitting, riding: p.riding, online };
  const none = { near: null, home: false, cat: null, bird: null, baitN: 0, egg: null, mateBike: null, mateFar: null, bike: false, bin: -1, binLeft: sc.binLeft, seat: null, inStart: false, npc: null, fishSpot: false, mateNear: false };
  const noLock: FishLockState = { phase: 'idle', cardOpen: false, catching: false };
  const noCast: CastInfo = { state: 'ok', baitN: 0 };
  const early = { ...base, ...none, lock: noLock, cast: noCast };
  if (sc.paxPid) return { ...early, press: readPress() };
  if (sc.runUi.active || sc.fishPhase === 'fight') return { ...early, press: false };
  if (sc.fishPhase !== 'idle' || p.sitting) return { ...early, press: readPress() };
  if (p.riding) {
    const mm = sc.partyUi.mates; let mateNear = false;
    for (const r of sc.remotes.values()) if (r.riding && mm.has(r.uid) && Math.hypot(r.x - p.x, r.y - p.y) < PAX_REACH) mateNear = true;
    return { ...early, mateNear, press: readPress() };
  }
  const tx = p.x / TILE, ty = p.y / TILE;
  let near: BuildingOut | null = null;
  for (const b of sc.wf.buildings) for (const d of b.doors) {
    if (tx >= d.x - 0.5 && tx <= d.x + d.w + 0.5 && ty >= d.y - 0.3 && ty <= d.y + d.h) near = b;
  }
  sc.nearBuilding = near;
  let cat: Cat | null = null, cd = CAT_REACH;
  for (const c of sc.cats) { if (!c.interactive) continue; const dd = c.distTo(p.x, p.y); if (dd < cd) { cd = dd; cat = c; } } // 被别人带走、藏起来的猫选不中
  const seat = nearestSeat(sc.seats, p.x, p.y, SIT_REACH);
  const bin = online ? nearestBin(sc.bins, p.x, p.y) : -1; // 站在垃圾桶旁：按 E 翻一翻
  const fishSpot = sc.water && online ? castTarget(sc.water.at, p.x, p.y, p.facing) : null; // 站在岸边、面朝湖水
  const mates = sc.partyUi.mates;
  let mateBike: import('@/entities/RemotePlayer').RemotePlayer | null = null, mbd = PAX_REACH; // 正在骑车的队友（后座空着就能坐上去，满座由服务器拒绝）
  let mateFar: import('@/entities/RemotePlayer').RemotePlayer | null = null, mfd = PAX_NEAR; // 队友的车就在附近但还够不着：提示再走近点
  for (const r of sc.remotes.values()) { if (!r.riding || !mates.has(r.uid)) continue; const d = Math.hypot(r.x - p.x, r.y - p.y); if (d < mbd) { mbd = d; mateBike = r; } else if (d < mfd) { mfd = d; mateFar = r; } }
  const nearBike = (b: { x: number; y: number }) => Math.abs(b.x - p.x) <= 26 && Math.abs(b.y - p.y) <= 16;
  const bike = sc.bikeSpots.find(nearBike) ?? [...sc.droppedBikes.values()].find(nearBike);
  let npc: Npc | null = null, nd = 26;
  for (const n of sc.npcs) { const dd = Math.hypot(n.x - p.x, n.y - p.y); if (dd < nd) { nd = dd; npc = n; } }
  const egg = (sc.wf.interacts ?? []).find((i) => p.x >= i.x && p.x <= i.x + i.w && p.y >= i.y && p.y <= i.y + i.h);
  const press = readPress();
  // 钓鱼沉浸：站在能抛竿的岸边（有竿有饵）时，抛竿优先于猫、单车、垃圾桶、长椅、NPC、校园跑起点
  const inv = sc.backpackUi.inv, eq = sc.backpackUi.equip, rod = pickRod(inv, eq), bait = pickBait(inv, eq);
  const lock: FishLockState = { ...fishLockState(sc), castable: !!fishSpot && !!rod && !!bait && !(bait === 'bait_name' && !eq.target) };
  const cast: CastInfo = !rod ? { state: 'norod' } : !bait ? { state: 'nobait' } : bait === 'bait_name' && !eq.target ? { state: 'needtarget' } : { state: 'ok', rodName: itemDef(rod.id)?.name, baitName: itemDef(bait)?.name, baitN: inv[bait] };
  const b = !near && !egg && !p.riding ? sc.lakeBirds?.nearest(p.x, p.y) ?? null : null;
  const nb = near as BuildingOut | null;
  return {
    ...base, press, mateNear: false, lock, cast, fishSpot: !!fishSpot,
    near: nb ? { ref: nb, name: nb.name, interior: !!nb.interior, desc: nb.desc } : null,
    home: !!nb && nb.name === sc.dormUi.building && online, // 自己绑定的宿舍楼：门口按 E 回宿舍
    cat: cat ? { ref: cat, label: (cat as Cat).label, dist: cd } : null,
    bird: b ? { id: b.def.id, label: b.label } : null, baitN: inv[BIRD_FEED_ITEM] ?? 0,
    egg: egg ? { ref: egg, hint: egg.hint, action: egg.action } : null,
    mateBike: mateBike ? { uid: (mateBike as { uid: number }).uid, name: (mateBike as { info: { name: string } }).info.name } : null,
    mateFar: mateFar ? { name: (mateFar as { info: { name: string } }).info.name } : null,
    bike: !!bike, bin, binLeft: sc.binLeft, seat: seat ? { ref: seat } : null, inStart: online && inStartZone(p.x, p.y), npc: npc ? { ref: npc } : null,
  };
}

/** 执行动作（原 updateInteraction 里按了 E 之后的那些分支，副作用和顺序不变） */
export function runAct(sc: WorldScene, a: Act) {
  switch (a.t) {
    case 'pax_leave': sc.net.paxLeave(); break;
    case 'fish_reel': sc.net.fishReel(); sfx('reel'); break;
    case 'fish_cancel': sc.net.fishCancel(); stopFishing(sc); sfx('lock'); break;
    case 'stand': standUp(sc); break;
    case 'dismount': dismount(sc); break;
    case 'mount': mount(sc); break;
    case 'bird_feed': sc.net.birdFeed(a.id); break;
    case 'cast': sc.net.fishCast(); break;
    case 'open_cat': openCat(sc, a.ref as Cat); break;
    case 'dorm_enter': sc.net.dormEnter(); break;
    case 'enter_interior': enterInterior(sc, a.ref as BuildingOut); break;
    case 'dialog': sc.hud.openDialog(a.title, a.text); break;
    case 'panel': if (a.which === 'board') sc.boardUi.open(); else if (a.which === 'shop') sc.shopUi.open(); else if (a.which === 'fishshop') sc.shopUi.open('stall'); else sc.wallUi.open(); break;
    case 'egg': {
      const egg = a.ref as NonNullable<WorldScene['wf']['interacts']>[number];
      const st = sc.egg.get(egg.id) ?? sc.egg.set(egg.id, { step: 0 }).get(egg.id)!;
      if (!st.busy) { // 动画播放中不响应，避免文字状态和动画对不上
        const r = eggAdvance(st.step, egg.texts.length);
        st.step = r.step;
        const orig = sc.wf.labels?.find((l) => l.id === egg.id)?.text ?? '';
        playEgg(sc, st, r.index >= 0 ? egg.texts[r.index] : orig, r.final);
      }
      break;
    }
    case 'pax_join': sc.net.paxJoin(a.uid); break;
    case 'bin': sc.net.binSearch(a.idx); break;
    case 'sit': sitDown(sc, a.ref as Seat); break;
    case 'run_open': sc.runUi.open(); break;
    case 'talk': {
      const npc = a.ref as Npc, p = sc.player;
      const dx = p.x - npc.x, dy = p.y - npc.y;
      npc.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      npc.sprite.setFrame(`c${npc.look}_${npc.facing}_0`);
      npc.pause(2.5);
      if (npc.trainer) { openTrainerAsk(sc, npc); break; }
      sc.hud.openDialog(npc.name, npc.lines);
      break;
    }
  }
}

/** 训练家对话：先问要不要切磋；确认后向服务器请求开战 */
function openTrainerAsk(sc: WorldScene, npc: Npc) {
  const t = npc.trainer!;
  sc.hud.openDialog(t.name, [t.before]);
  // 对话底部追加两个按钮（复用 hud 的 dialog 容器）
  const foot = document.getElementById('dialog-foot'); if (!foot) return;
  foot.replaceChildren();
  const yes = document.createElement('button'); yes.className = 'btn primary'; yes.type = 'button'; yes.textContent = '切磋';
  const no = document.createElement('button'); no.className = 'btn'; no.type = 'button'; no.textContent = '下次吧';
  yes.addEventListener('click', (e) => { e.stopPropagation(); sc.hud.closeDialog(); sc.net.trainerBattle(t.id); });
  no.addEventListener('click', (e) => { e.stopPropagation(); sc.hud.closeDialog(); });
  foot.append(yes, no);
}

export function updateInteraction(sc: WorldScene) {
  const d = decideInteraction(gatherInteraction(sc));
  if (d.hint !== undefined) sc.hud.hint(d.hint);
  if (d.act) runAct(sc, d.act);
}
