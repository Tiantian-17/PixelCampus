/** 行人、钓具老板、校园小猫、共享单车的生成与每帧更新；上 / 下车。 */
import { Npc } from '@/entities/Npc';
import { TILE } from '@/core/const';
import { inPlaza } from '@/shared/plaza';
import { Cat } from '@/entities/Cat';
import { commClaimable } from '@/ui/commissionsView';
import { fishData } from '@/ui/fishData';
import { sfx } from '@/audio/sfx';
import { allCats } from '@/shared/cats';
import { gateBikes } from '@/shared/bikes';
import type { WorldScene } from '../WorldScene';
import { TRAINERS } from '@/shared/trainers';

const CHAT = [
  '早八真的太难了……', '去图书馆怎么走？沿着中轴线一直往北就是。', '精工湖边的垂柳春天最好看。', '食堂的红烧肉去晚就没了。',
  '今天的作业你写完了吗？', '听说东边的田径场晚上有人夜跑。', '南门的校石是新生合影的必去打卡点。', '银杏黄了的时候，中轴广场特别好看。',
  '我在找一教，是往西北边走吗？', '下课啦！先回宿舍还是去吃饭？',
];
/** 钓具老板的人物外观编号（preset look，取余） */
const KEEPER_LOOK = 5;

export function spawnNpcs(sc: WorldScene) {
  const pts = sc.wf.npcSpawns.filter(([tx, ty]) => !inPlaza(tx, ty, 2)); // 图书馆广场留给商店和校园墙，不放行人
  const n = Math.min(Math.round(40 * Math.sqrt(pts.length / 160)) + ((sc.wf.scale ?? 1) > 1 ? 60 : 0), pts.length);
  for (let i = 0; i < n; i++) {
    const [tx, ty] = pts[Math.floor(sc.rand() * pts.length)];
    const look = Math.floor(sc.rand() * (sc.cache.json.get('charsMeta') as { count: number }).count);
    const l1 = CHAT[Math.floor(sc.rand() * CHAT.length)];
    const l2 = CHAT[Math.floor(sc.rand() * CHAT.length)];
    sc.npcs.push(new Npc(sc, tx * TILE, ty * TILE, look, '同学', [l1, l2], true, 'down'));
  }
}

/** 训练家 NPC：按 shared/trainers.ts 的坐标放置，常驻不游走 */
export function spawnTrainers(sc: WorldScene) {
  const count = (sc.cache.json.get('charsMeta') as { count: number }).count;
  for (const t of TRAINERS) {
    const n = new Npc(sc, t.tx * TILE, t.ty * TILE, Math.min(t.look, count - 1), t.name, [t.before], false, 'down');
    n.trainer = t;
    sc.trainers.set(t.id, n);
    sc.npcs.push(n);
  }
}

/** 钓具老板：站在摊子右边（摊子是地图里的 fishStall 道具），不游走；没有摊子的世界不生成 */
export function spawnKeeper(sc: WorldScene) {
  const o = sc.wf.objects.find((x) => x.k === 'fishStall'); if (!o) return;
  const count = (sc.cache.json.get('charsMeta') as { count: number }).count;
  const n = new Npc(sc, o.x + 62, o.y - 3, KEEPER_LOOK % count, '钓具老板', ['来啦？钓鱼的人，装备和耐心一样要紧。'], false, 'down');
  sc.keeper = n;
  const st = { fontFamily: 'ArkPixel, monospace', fontSize: '12px', color: '#ffe9a0', stroke: '#2e1a10', strokeThickness: 3 };
  sc.keeperTag = sc.add.text(n.x, n.y - 44, '钓具老板', st).setOrigin(0.5, 1).setDepth(n.y + 2000);
  sc.keeperMark = sc.add.text(n.x, n.y - 58, '！', { ...st, fontSize: '18px', color: '#ffd35a' }).setOrigin(0.5, 1).setDepth(n.y + 2001).setVisible(false);
}

/** 每帧：钓具老板静止 / 头顶的「！」在有可领的委托奖励时上下跳（奖励在「任务」面板的钓鱼页领） */
export function updateKeeper(sc: WorldScene, dt: number, now: number) {
  const k = sc.keeper; if (!k) return;
  k.update(dt, sc.world, sc.rand);
  const can = commClaimable(fishData.wq); // 有可领的委托奖励：头顶冒「！」（去「任务」面板的钓鱼页领）
  sc.keeperMark?.setVisible(can).setY(k.y - 58 + Math.sin(now / 220) * 2);
}

/** 校园小猫：家和毛色、名字由 shared/cats 按固定种子从行人出生点里挑（服务器和所有玩家一致） */
export function spawnCats(sc: WorldScene) {
  for (const d of allCats(sc.wf.npcSpawns)) sc.cats.push(new Cat(sc, d));
  Cat.peers = sc.cats;
}

/** 车架旁停几辆共享单车（按车架坐标确定，所有玩家看到的一样）；这些位置也是上车点 */
export function buildBikes(sc: WorldScene) {
  const m = sc.cache.json.get('bikesMeta') as { ax: number; ay: number };
  const fr = sc.textures.getFrame('bikes', 'bike_parked_r');
  for (const o of sc.wf.objects) {
    if (o.k !== 'bikeRack') continue;
    const h = Math.abs(Math.imul(Math.round(o.x), 73856093) ^ Math.imul(Math.round(o.y), 19349663)) % 10;
    const n = h < 4 ? 0 : h < 8 ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const bx = o.x + (n === 2 ? (i ? 9 : -9) : 0), by = o.y + 7, flip = (h + i) % 2 === 1;
      sc.bikeSpots.push({ x: bx, y: by });
      sc.stream.add({ x: bx - m.ax, y: by - m.ay, w: fr.width, h: fr.height, make: () => sc.add.image(bx, by, 'bikes', flip ? 'bike_parked_l' : 'bike_parked_r').setOrigin(m.ax / fr.width, m.ay / fr.height).setDepth(by) });
    }
  }
  for (const g of gateBikes()) { // 南门里侧整齐停放的 20 辆
    sc.bikeSpots.push({ x: g.x, y: g.y });
    sc.stream.add({ x: g.x - m.ax, y: g.y - m.ay, w: fr.width, h: fr.height, make: () => sc.add.image(g.x, g.y, 'bikes', g.flip ? 'bike_parked_l' : 'bike_parked_r').setOrigin(m.ax / fr.width, m.ay / fr.height).setDepth(g.y) });
  }
}

/** 留在原地的单车：和停车架旁的车一样的画法，但由服务器按编号增删 */
export function addDropped(sc: WorldScene, b: { id: number; x: number; y: number; flip: boolean }) {
  if (sc.droppedBikes.has(b.id)) return;
  const m = sc.cache.json.get('bikesMeta') as { ax: number; ay: number }, fr = sc.textures.getFrame('bikes', 'bike_parked_r');
  const img = sc.add.image(b.x, b.y, 'bikes', b.flip ? 'bike_parked_l' : 'bike_parked_r').setOrigin(m.ax / fr.width, m.ay / fr.height).setDepth(b.y);
  sc.droppedBikes.set(b.id, { x: b.x, y: b.y, img });
}

export function clearDropped(sc: WorldScene) { for (const d of sc.droppedBikes.values()) d.img.destroy(); sc.droppedBikes.clear(); }

export function mount(sc: WorldScene) {
  sc.player.setRiding(true); sc.net.ride(true); sfx('bell');
  sc.hud.banner('🚲 共享单车', '扫码成功！方向键骑行，按 E 锁车');
}

export function dismount(sc: WorldScene) {
  sc.player.setRiding(false); sc.net.ride(false); sfx('lock');
  sc.hud.banner('🚲 已锁车', '骑行结束，感谢使用');
}

/** 每帧：视野附近的行人、小猫（含被带着走的）、精工湖水禽 */
export function updateCreatures(sc: WorldScene, dt: number) {
      { const c = sc.cameras.main, rx = c.width / c.zoom / 2 + 900, ry = c.height / c.zoom / 2 + 900; // 远处的行人、小猫不更新
        for (const n of sc.npcs) { if (Math.abs(n.x - c.midPoint.x) > rx || Math.abs(n.y - c.midPoint.y) > ry) continue; n.update(dt, sc.world, sc.rand); }
        const visitor = { x: sc.player.x, y: sc.player.y, fast: sc.player.riding || sc.runNow, still: !sc.player.moving && !sc.player.riding, sitting: sc.player.sitting, fishing: sc.fishPhase !== 'idle' };
        const home = sc.dormUi?.data?.dc;
        for (const cat of sc.cats) {
          if (home?.includes(cat.def.id)) { cat.setAway(true); continue; } // 我把它接回宿舍养了：校园里这只猫对我来说"回家了"（对别的同学照常在原地）
          const pid = sc.catWith.get(cat.def.id);
          if (pid) { // 正被某个玩家带着走：跟着他（自己，或视野里的别的玩家）；他不在视野里就先藏起来
            const who = pid === sc.net.selfId ? sc.player : sc.remotes.get(pid);
            if (who) cat.update(dt, sc.world, visitor, sc.catAff[cat.def.id] ?? 0, { x: who.x, y: who.y }); else cat.setAway(true);
            continue;
          }
          if (Math.abs(cat.x - c.midPoint.x) > rx || Math.abs(cat.y - c.midPoint.y) > ry) continue;
          cat.update(dt, sc.world, visitor, sc.catAff[cat.def.id] ?? 0, null);
        } }
      { const c = sc.cameras.main; sc.lakeBirds?.update(dt, { x: sc.player.x, y: sc.player.y, fast: sc.player.riding || sc.runNow, fishing: sc.fishPhase !== 'idle' }, { x: c.midPoint.x, y: c.midPoint.y, rx: c.width / c.zoom / 2 + 700, ry: c.height / c.zoom / 2 + 700 }); } // 精工湖的水禽
}
