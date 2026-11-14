/**
 * 世界编译器：data/campus 蓝图 -> public/assets/generated/{ground/*.png, atlas-*.png/json, world.json, minimap.png}
 * 用法：npm run assets:world
 */
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Img, Rng, hash2, vnoise, type RGBA } from '../art/px.ts';
import { PAL } from '../art/palette.ts';
import * as N from '../art/nature.ts';
import * as P from '../art/props.ts';
import * as PZ from '../art/plaza.ts';
import { renderWing, type WingSpec } from '../art/buildings.ts';
import { pack, packPagesOrdered, type PackItem } from '../art/pack.ts';
import { CACHE, ROOT } from '../paths.ts';
import { scaleTerrain, scaleBuildings, scalePois } from './scale.ts';
import { MaterialMap, MID, MATS, TILE, paintShapes, renderRegion, waterDistance } from './terrain.ts';
import { loadTerrain, loadBuildings, loadPois, loadGeo, loadManual, loadBaked, bpCategory } from './blueprint-load.ts';
import { manualSpriteKey, rowPoints, expandField, fenceCells, type ManualFile } from '../../src/shared/manual.ts';
import type { Species, Scatter, BuildingDef, WingDef, Shape } from '../../src/shared/blueprint.ts';
import type { WorldFile, BuildingOut, ObjOut } from '../../src/shared/world-format.ts';
import { SEASONS } from '../../src/shared/season.ts';
import { PLAZA, PLAZA_BUILDINGS } from '../../src/shared/plaza.ts';
import { applySeason } from './seasons.ts';

const t0 = Date.now();
const log = (...a: unknown[]) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

// ---- 放大与区域（原型用）：SCALE=2 REGION=x0,y0,x1,y1（按原 5m/格坐标）OUT=generated-s2
const geo = loadGeo();
const S = Number(process.env.SCALE ?? geo.world.scale ?? 1);
const OUT = process.env.OUT ?? 'generated';
const OUTDIR = join(ROOT, 'public', 'assets', OUT);
const REGION0 = process.env.REGION ? (process.env.REGION.split(',').map(Number) as [number, number, number, number]) : null;
const REGION = REGION0 ? REGION0.map((v) => v * S) as [number, number, number, number] : null;
const inRegion = (x: number, y: number, pad = 0) => !REGION || (x >= REGION[0] - pad && x <= REGION[2] + pad && y >= REGION[1] - pad && y <= REGION[3] + pad);
const PAR_DEFAULT: [number, number] = (geo.parallax?.perFloor ?? [0, 0]).map((v: number) => v * S) as [number, number];
/** 斜视角偏移（每层）：按量到的屋顶中心 x 选区域 */
function parFor(b: BuildingDef, roofCx: number): [number, number] {
  if (b.par) return b.par;
  let p = PAR_DEFAULT;
  for (const r of geo.parallax?.regions ?? []) if (roofCx >= r.xMin * S) p = r.perFloor.map((v: number) => v * S) as [number, number];
  return p;
}
const TW: number = geo.world.widthTiles * S, TH: number = geo.world.heightTiles * S;
/**
 * 手动层按顺序叠加：先是 data/campus/baked.json 里已经部署过的各层（每次部署后由 tools/editor/bake.ts 并入），最后是 manual.json（编辑器里正在改的）。
 * 每一层的语义和单独一层时完全一样：地面先画、建筑按 id 替换/新建/删除、物件先擦除再摆。
 */
const bakedLayers = loadBaked();
const layers = [...bakedLayers, loadManual()];
/** 蓝图里已有的图形/围栏被手动层"去掉/原位修改"（按各层顺序：后面的层覆盖前面的）；返回处理后的地形 */
function applyBp(t: ReturnType<typeof loadTerrain>, ls: ManualFile[]) {
  const hide = new Set<string>(), edit = new Map<string, Record<string, unknown>>();
  for (const l of ls) {
    for (const id of l.bp?.hide ?? []) { hide.add(id); edit.delete(id); }
    for (const [id, e] of Object.entries(l.bp?.edit ?? {})) { edit.set(id, e); hide.delete(id); }
  }
  if (!hide.size && !edit.size) return t;
  const pick = <T extends { bp?: string }>(o: T): T | null => (o.bp && hide.has(o.bp) ? null : o.bp && edit.has(o.bp) ? ({ ...o, ...edit.get(o.bp) } as T) : o);
  return { ...t, shapes: t.shapes.map(pick).filter((x): x is NonNullable<typeof x> => !!x), scatter: t.scatter.map(pick).filter((x): x is NonNullable<typeof x> => !!x) };
}
const terrainRaw = loadTerrain();
const terrain = scaleTerrain(applyBp(terrainRaw, layers), S);
type LayerBuilding = NonNullable<(typeof layers)[number]['buildings']>[number];
/** 手动层里改过的建筑（地图编辑器）：同 id = 整栋替换（脚印坐标，不再做斜视角换算）、新 id = 新建筑、delete = 删掉 */
function applyManualBuildings(list0: BuildingDef[]): BuildingDef[] {
  let list = list0;
  for (const layer of layers) list = applyLayerBuildings(list, layer.buildings ?? []);
  return list;
}
function applyLayerBuildings(list: BuildingDef[], entries: LayerBuilding[]): BuildingDef[] {
  const m = new Map(entries.map((b) => [b.id, b]));
  const toDef = (e: LayerBuilding, base?: BuildingDef): BuildingDef => ({
    id: e.id, name: e.name, kind: e.kind as BuildingDef['kind'], desc: e.desc ?? base?.desc, sign: e.sign, fixed: e.fixed, roofTone: e.roofTone ?? base?.roofTone, interior: e.interior !== undefined ? (e.interior || undefined) : base?.interior, // 手动层里写了 interior（空字符串 = 明确不要室内）就用它
    style: (e.wings[0]?.style ?? base?.style ?? 'brick') as BuildingDef['style'], f: base?.f ?? e.wings[0]?.f ?? 4, ground: true,
    wings: e.wings.map((w) => ({ ...w, style: w.style as WingDef['style'] })),
  });
  const out: BuildingDef[] = [];
  for (const b of list) { const e = m.get(b.id); if (!e) { out.push(b); continue; } m.delete(b.id); if (!e.delete) out.push(toDef(e, b)); }
  for (const e of m.values()) if (!e.delete) out.push(toDef(e));
  return out;
}
const buildingsAll = scaleBuildings(applyManualBuildings(loadBuildings()), S);
const buildings = REGION ? buildingsAll.filter((b) => b.wings.some((w) => w.x + w.w >= REGION[0] - 12 && w.x <= REGION[2] + 12 && w.y + w.d >= REGION[1] - 12 && w.y <= REGION[3] + 24)) : buildingsAll;
const pois = scalePois(loadPois(), S);
mkdirSync(join(OUTDIR, 'ground'), { recursive: true });
console.log(`SCALE=${S} OUT=${OUT} 世界 ${TW}×${TH} 格${REGION ? `，区域 ${REGION.join(',')}` : ''}，建筑 ${buildings.length}/${buildingsAll.length}`);

// ------------------------------------------------------------ 1. 材质缓冲
const mm = new MaterialMap(TW, TH);
paintShapes(mm, terrain.shapes);
// 手动层的地面：盖在所有蓝图地面之上（地图编辑器里涂的；坐标是原 5 m 格，×S）
for (const layer of layers) paintShapes(mm, scaleTerrain({ shapes: [...layer.shapes, ...(layer.fields ?? []).flatMap((f) => expandField(f).shapes.map((sh) => ({ id: '', ...sh })) as typeof layer.shapes)].map(({ id: _id, note: _n, ...sh }) => sh as Shape), scatter: [], blocks: [], bounds: terrain.bounds }, S).shapes);
log('材质缓冲完成', mm.w, 'x', mm.h);

// ------------------------------------------------------------ 2. 建筑翼体
const buildingSprites: PackItem[] = [];
const buildingsOut: BuildingOut[] = [];
const footprints: { x: number; y: number; w: number; d: number; poly?: [number, number][] }[] = [];
const wingInfos: { kind: string; x: number; y: number; w: number; d: number; rot: boolean; door: [number, number] | null }[] = [];
let bSeed = 1;
/** 给地图编辑器用的建筑数据（解析后的脚印、层数、风格…，放大后的世界格单位）：写到 .cache/editor-buildings.json，不进游戏 */
const editorOut: Record<string, unknown>[] = [];
/** 默认屋面色：宿舍多为灰/蓝灰，教学楼灰/红褐，服务设施蓝/绿灰；同一栋楼固定一色 */
function defaultRoofTone(b: BuildingDef): number {
  const h = [...b.id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % 100;
  const table: Record<string, number[]> = { dorm: [0, 0, 0, 1, 4], teaching: [0, 0, 2, 2, 1], lab: [1, 3, 0], library: [0], service: [1, 3, 1], canteen: [2, 0], admin: [0, 2], sport: [1], culture: [2, 0], misc: [0], };
  const t = table[b.kind] ?? [0];
  return t[h % t.length];
}
/** 建筑 id → 室内 id（data/campus/interior-links.json）：在手动层 / baked 层之后套用，编辑器改建筑不会丢这个对应 */
const INTERIOR_LINKS: Record<string, string> = (() => { const f = join(ROOT, 'data', 'campus', 'interior-links.json'); if (!existsSync(f)) return {}; return Object.fromEntries(Object.entries(JSON.parse(readFileSync(f, 'utf8')) as Record<string, string>).filter(([k]) => !k.startsWith('_'))); })();
const OPEN_INTERIORS = new Set<string>();
{ const dir = join(ROOT, 'data', 'interiors'); if (existsSync(dir)) for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) { const j = JSON.parse(readFileSync(join(dir, f), 'utf8')); if (j.open && j.id) OPEN_INTERIORS.add(j.id); } }
for (const b of buildings) {
  // 室内系统暂停开发：默认不暴露入口。设置 INTERIORS=1 可开启（室内场景尚未通过验收）。
  // 室内：INTERIORS=1 时按旧规则全开；否则只开放 data/interiors/*.json 里写了 "open": true 的那几间（目前试点：42 号楼 → 数学建模协会 214）
  const interior = process.env.INTERIORS === '1' ? (b.interior ?? (b.kind === 'teaching' ? 'classroom' : b.kind === 'canteen' ? 'canteen' : undefined)) : ((INTERIOR_LINKS[b.id] ?? b.interior) && OPEN_INTERIORS.has((INTERIOR_LINKS[b.id] ?? b.interior)!) ? (INTERIOR_LINKS[b.id] ?? b.interior) : undefined);
  const editorSpecs: Record<string, unknown>[] = [];
  editorOut.push({ id: b.id, name: b.name, kind: b.kind, sign: b.sign, desc: b.desc, fixed: b.fixed, interior: b.interior, wings: editorSpecs });
  const out: BuildingOut = { id: b.id, name: b.name, kind: b.kind, desc: b.desc, interior, wings: [], doors: [], bbox: { x: 1e9, y: 1e9, w: 0, h: 0 } };
  let x1 = -1e9, y1 = -1e9;
  b.wings.forEach((w0: WingDef, i: number) => {
    // 正向翼体边缘吸附到整格：图像边缘与碰撞格严格重合（斜向翼体保持原值）
    const w: WingDef = { ...w0 };
    if (!b.ground) { // 量自屋顶 → 脚印（斜视角修正，见 geo.json parallax）
      const f = w0.f ?? b.f ?? 4;
      const par = parFor(b, w0.x + w0.w / 2);
      w.x = w0.x - par[0] * f; w.y = w0.y - par[1] * f;
    }
    if (!w0.rot) {
      const x0 = Math.round(w.x), x1 = Math.max(x0 + 2, Math.round(w.x + w0.w)), y0 = Math.round(w.y), y1 = Math.max(y0 + 2, Math.round(w.y + w0.d));
      const ox = w.x;
      w.x = x0; w.w = x1 - x0; w.y = y0; w.d = y1 - y0;
      if (w0.door) w.door = { ...w0.door, tx: Math.max(0, Math.min(w0.door.tx + (ox - x0), w.w - w0.door.tw)) };
    }
    editorSpecs.push({ x: w.x, y: w.y, w: w.w, d: w.d, f: w.f ?? b.f ?? 4, style: w.style ?? b.style ?? 'brick', roof: w.roof, windows: w.windows, door: w.door, colonnade: w.colonnade, rot: w.rot, roofTone: w.roofTone ?? b.roofTone ?? defaultRoofTone(b) });
    wingInfos.push({ kind: b.kind, x: w.x, y: w.y, w: w.w, d: w.d, rot: !!w0.rot, door: w.door ? [w.x + w.door.tx, w.x + w.door.tx + w.door.tw] : null });
    const spec: WingSpec = {
      x: w.x, y: w.y, w: w.w, d: w.d, f: w.f ?? b.f ?? 4, style: w.style ?? b.style ?? 'brick', roof: w.roof, seed: bSeed++,
      windows: w.windows, door: w.door, colonnade: w.colonnade, rot: w.rot, roofTone: w.roofTone ?? b.roofTone ?? defaultRoofTone(b),
      detail: S > 1 ? 1 : 0, dorm: b.kind === 'dorm', kind: b.kind,
    };
    const sp = renderWing(spec);
    sp.slices.forEach((sl, j) => {
      const k = `b_${b.id}_${i}_${j}`;
      buildingSprites.push({ key: k, img: sl.img });
      out.wings.push({ k, x: sl.px, y: sl.py, base: sl.baseY, block: sp.block, f: spec.f, poly: sp.poly });
    });
    footprints.push({ ...sp.block, poly: sp.poly });
    if (sp.door) out.doors.push({ x: sp.door.tx, y: sp.door.ty, w: sp.door.tw, h: 1.5 });
    out.bbox.x = Math.min(out.bbox.x, w.x); out.bbox.y = Math.min(out.bbox.y, w.y);
    x1 = Math.max(x1, w.x + w.w); y1 = Math.max(y1, w.y + w.d);
  });
  out.bbox.w = x1 - out.bbox.x; out.bbox.h = y1 - out.bbox.y;
  buildingsOut.push(out);
}
log('建筑翼体', buildingSprites.length);
if (!REGION) mkdirSync(CACHE, { recursive: true }); // 全新克隆（CI）里还没有 .cache 目录
if (!REGION) writeFileSync(join(CACHE, 'editor-buildings.json'), JSON.stringify({ scale: S, buildings: editorOut }));
if (!REGION) { // 给地图编辑器用的蓝图条目（原 5 m 格坐标）：只含编辑器能改的几类，已被前面各层去掉的不列，被前面各层改过的用改后的
  const base = applyBp(terrainRaw, bakedLayers);
  const items: { id: string; cat: string; e: unknown }[] = [];
  for (const e of [...base.shapes, ...base.scatter] as { bp?: string; kind: string; prop?: string }[]) { const cat = e.bp ? bpCategory(e.bp, e) : null; if (cat) { const { bp: _bp, ...rest } = e; items.push({ id: e.bp!, cat, e: rest }); } }
  writeFileSync(join(CACHE, 'editor-blueprint.json'), JSON.stringify({ scale: S, items }));
}

// ------------------------------------------------------------ 3. 精灵库（植物 + 小品）
const propSprites: PackItem[] = [];
const anchors: Record<string, { ax: number; ay: number; block?: { x: number; y: number; w: number; h: number } }> = {};
const add = (key: string, s: N.Sprite) => { propSprites.push({ key, img: s.img }); anchors[key] = { ax: s.ax, ay: s.ay, block: s.block }; };
const VARIANTS: Record<Species, number> = { oak: 4, oakS: 3, oakL: 3, poplar: 3, ginkgo: 3, maple: 3, blossom: 3, pine: 3, willow: 2, bush: 4 };
/** 生成全部道具/树木精灵到 propSprites/anchors：每个季节换一次色板后各生成一遍（精灵尺寸不随季节变，所以图集布局相同） */
function genProps() {
  propSprites.length = 0;
  for (let i = 1; i <= VARIANTS.oak; i++) add(`oak_${i}`, N.oak(i, 1));
  for (let i = 1; i <= VARIANTS.oakS; i++) add(`oakS_${i}`, N.oak(10 + i, 0));
  for (let i = 1; i <= VARIANTS.oakL; i++) add(`oakL_${i}`, N.oak(20 + i, 2));
  for (let i = 1; i <= VARIANTS.poplar; i++) add(`poplar_${i}`, N.poplar(i, i % 2));
  for (let i = 1; i <= VARIANTS.ginkgo; i++) add(`ginkgo_${i}`, N.ginkgo(i));
  for (let i = 1; i <= VARIANTS.maple; i++) add(`maple_${i}`, N.maple(i));
  for (let i = 1; i <= VARIANTS.blossom; i++) add(`blossom_${i}`, N.blossom(i));
  for (let i = 1; i <= VARIANTS.pine; i++) add(`pine_${i}`, N.pine(i, i === 3));
  for (let i = 1; i <= VARIANTS.willow; i++) add(`willow_${i}`, N.willow(i));
  for (let i = 1; i <= VARIANTS.bush; i++) add(`bush_${i}`, N.bush(i));
  add('lamp', P.lamp()); add('bench', P.bench()); add('stone', P.rock()); add('sign', P.sign()); add('bin', P.bin());
  for (let i = 1; i <= 3; i++) add(`flowerbed_${i}`, P.flowerbed(i));
  for (let i = 1; i <= 3; i++) add(`rockS_${i}`, P.rockS(i));
  add('bleacher', P.bleacher()); add('pergola', P.pergola()); add('floodlight', P.floodlight()); add('dockPost', P.dockPost());
  for (let i = 0; i < 3; i++) add(`parasolTable_${i}`, P.parasolTable(i));
  add('fenceH', P.fenceIron()); add('fenceV', P.fenceIronV()); add('wallV', P.wallV()); add('gatePlaque', P.gatePlaque()); add('mottoStone', P.mottoStone());
  add('lampGold', P.lampGold()); add('wallH', P.wallH()); add('pier', P.pier()); add('nameStone', P.nameStone()); add('bollard', P.bollard()); add('boulder', P.boulder()); add('flagpole', P.flagpole()); add('railV', P.railV());
  P.flagFrames().forEach((im, i) => add(`flag_${i}`, { img: im, ax: 0, ay: 0 })); add('pavilion', P.pavilion()); add('bikeRack', P.bikeRack()); add('noticeBoard', P.noticeBoard()); add('messageBoard', P.messageBoard()); add('shop', PZ.shop()); add('campusWall', PZ.campusWall()); add('fishStall', PZ.fishStall()); add('hollowTree', N.hollowTree());
  add('stadium', P.stadium(S)); add('fountain', P.fountain()); add('monument', P.monument()); add('goal', P.goal()); add('hoop', P.hoop()); add('gateSign', P.gateSign());
  for (let i = 0; i < 7; i++) add(`car_${i}`, P.car(i));
  for (let i = 1; i <= 3; i++) { add(`reed_${i}`, P.reed(i)); add(`lily_${i}`, P.lily(i)); }
}
genProps();

// ------------------------------------------------------------ 4. 放置：树 / 小品
type Placed = { key: string; x: number; y: number }; // x,y = 脚点世界 tile
const placed: Placed[] = [];
const lamps: [number, number, number?][] = [];
const anims: WorldFile['anims'] = [];
const grid = new Map<string, Placed[]>();
const cellKey = (x: number, y: number) => `${Math.floor(x / 3)},${Math.floor(y / 3)}`;
function tooClose(x: number, y: number, r: number) {
  const cx = Math.floor(x / 3), cy = Math.floor(y / 3);
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) for (const p of grid.get(`${cx + i},${cy + j}`) ?? []) if ((p.x - x) ** 2 + (p.y - y) ** 2 < r * r) return true;
  return false;
}
/** 门前保留区：任何摆件/树木都不得压在门前（门宽 ±0.6，门线以南 2 格） */
const doorZones = buildingsOut.flatMap((b) => b.doors.map((d) => ({ x0: d.x - 0.6, x1: d.x + d.w + 0.6, y0: d.y - 0.3, y1: Math.ceil(d.y) + 2 })));
let droppedByDoor = 0;
function addPlaced(key: string, x: number, y: number) {
  if (!/^(fence|wall|pier|stadium)/.test(key) && doorZones.some((z) => x > z.x0 && x < z.x1 && y > z.y0 && y < z.y1)) { droppedByDoor++; return null as unknown as Placed; }
  const p = { key, x, y }; placed.push(p);
  const ck = cellKey(x, y); (grid.get(ck) ?? grid.set(ck, []).get(ck)!).push(p);
  return p;
}
const propKey = (prop: string) => prop === 'rockS' ? `rockS_${1 + rng.int(3)}` : prop === 'parasolTable' ? `parasolTable_${rng.int(3)}` : prop === 'flowerbed' ? `flowerbed_${1 + rng.int(3)}` : prop === 'car' ? `car_${rng.int(7)}` : prop === 'reed' ? `reed_${1 + rng.int(3)}` : prop === 'lily' ? `lily_${1 + rng.int(3)}` : prop;
const labels: WorldFile['labels'] = [];
const interacts: NonNullable<WorldFile['interacts']> = [];
const SOFT = new Set(['grass', 'forest', 'lawn', 'dirt', 'sand']);
const ROADISH = new Set(['asphalt', 'path', 'stone', 'paver', 'zebraH', 'zebraV', 'plaza', 'plazaDark', 'plazaWarm', 'steps']);
function nearRoad(x: number, y: number, r = 1.7) {
  for (let a = 0; a < 8; a++) { const m = mm.tile(x + Math.cos(a * Math.PI / 4) * r, y + Math.sin(a * Math.PI / 4) * r); if (ROADISH.has(m)) return true; }
  return ROADISH.has(mm.tile(x, y));
}
const ROWOK = new Set(['grass', 'forest', 'lawn', 'dirt', 'sand', 'path', 'stone', 'paver', 'plaza', 'plazaDark', 'plazaWarm']);
function inBuilding(x: number, y: number, pad = 0.6) {
  for (const f of footprints) {
    if (!(x > f.x - pad && x < f.x + f.w + pad && y > f.y - pad && y < f.y + f.d + 1.4)) continue;
    if (!f.poly) return true;
    if (pointInPoly(x, y, f.poly) || pointInPoly(x, y - 1.2, f.poly) || pointInPoly(x, y + 0.8, f.poly)) return true;
  }
  return false;
}
function pointInPoly(x: number, y: number, poly: [number, number][]) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const rng = new Rng(20261031);
const pickVariant = (sp: Species) => `${sp}_${1 + rng.int(VARIANTS[sp])}`;
const SPACING: Record<Species, number> = { oak: 2.6, oakS: 2.0, oakL: 3.4, poplar: 1.2, ginkgo: 2.6, maple: 2.6, blossom: 2.6, pine: 1.6, willow: 3.2, bush: 1.3 };
function tryPlace(sp: Species, x: number, y: number, allowHard: boolean, gap = SPACING[sp]) {
  const m = mm.tile(x, y);
  if (!(allowHard ? ROWOK : SOFT).has(m)) return false;
  if (inBuilding(x, y)) return false;
  if (tooClose(x, y, gap)) return false;
  return addPlaced(pickVariant(sp), x, y) !== null;
}
for (const s of (terrain.scatter as Scatter[]).filter((e) => (e.minS ?? 1) <= S && S <= (e.maxS ?? 99))) {
  if (s.kind === 'row') {
    const gap = Math.min(SPACING[s.species], s.spacing * 0.7);
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const [ax, ay] = s.pts[i], [bx, by] = s.pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.floor(len / s.spacing));
      for (let k = 0; k <= n; k++) {
        const t = k / n, j = s.jitter ?? 0;
        tryPlace(s.species, ax + (bx - ax) * t + rng.range(-j, j) * 0.4, ay + (by - ay) * t + rng.range(-j, j) * 0.4, true, gap);
      }
    }
  } else if (s.kind === 'cluster') {
    const xs = s.poly.map((p) => p[0]), ys = s.poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const area = (x1 - x0) * (y1 - y0);
    const tries = Math.ceil((area * s.density) / 100) * 4;
    const entries = Object.entries(s.species) as [Species, number][];
    const total = entries.reduce((a, [, w]) => a + w, 0);
    let want = Math.ceil((area * s.density) / 100 * 0.6);
    for (let i = 0; i < tries && want > 0; i++) {
      const x = rng.range(x0, x1), y = rng.range(y0, y1);
      if (!pointInPoly(x, y, s.poly)) continue;
      let r = rng.next() * total, sp = entries[0][0];
      for (const [k, w] of entries) { if ((r -= w) <= 0) { sp = k; break; } }
      if (tryPlace(sp, x, y, false)) want--;
    }
  } else if (s.kind === 'prop') {
    for (let i = 0; i + 1 < s.pts.length; i++) {
      const [ax, ay] = s.pts[i], [bx, by] = s.pts[i + 1];
      const len = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(len / s.spacing));
      for (let k = 0; k <= n; k++) {
        const t = k / n, x = ax + (bx - ax) * t, y = ay + (by - ay) * t;
        addPlaced(propKey(s.prop), x, y); if (s.prop === 'lamp') lamps.push([x, y]); if (s.prop === 'lampGold') lamps.push([x, y, 54]);
      }
    }
  } else if (s.kind === 'at') {
    const key = s.species ? pickVariant(s.species) : propKey(s.prop!);
    addPlaced(key, s.x, s.y); if (s.prop === 'lamp') lamps.push([s.x, s.y]); if (s.prop === 'lampGold') lamps.push([s.x, s.y, 54]);
    if (s.prop === 'flagpole') { // 旗：3 帧循环，左上角贴在杆顶右侧
      const fx = Math.round(s.x * TILE) + 1, fy = Math.round(s.y * TILE) - 106;
      anims.push({ frames: ['flag_0', 'flag_1', 'flag_2'], x: fx, y: fy, ms: 220, depth: Math.round(s.y * TILE) + 1 });
    }
  } else if (s.kind === 'ring') {
    const per = 2 * Math.PI * Math.sqrt((s.rx * s.rx + s.ry * s.ry) / 2), n = Math.max(6, Math.round(per / s.spacing));
    for (let k = 0; k < n; k++) { const t = (2 * Math.PI * k) / n; addPlaced(propKey(s.prop), s.cx + s.rx * Math.cos(t), s.cy + s.ry * Math.sin(t)); }
  } else if (s.kind === 'label') {
    labels.push({ text: s.text, x: s.x, y: s.y, size: s.size ?? 12, color: s.color, stroke: s.stroke, id: s.id, ...(s.ds ? { ds: s.ds } : {}) });
  } else if (s.kind === 'interact') {
    interacts.push({ id: s.id, x: s.rect[0] * TILE, y: s.rect[1] * TILE, w: s.rect[2] * TILE, h: s.rect[3] * TILE, hint: s.hint, texts: s.texts ?? [], action: s.action });
  } else if (s.kind === 'fence') {
    for (const cell of fenceCells(s.pts, s.piers ?? 4, !!s.wall)) {
      const m = mm.tile(cell.px, cell.py);
      if (!s.force && (ROADISH.has(m) || m === 'water' || m === 'lineY')) continue; // 遇到路面自动留口
      if (inBuilding(cell.px, cell.py, 0.3)) continue;
      for (const it of cell.items) addPlaced(it.k, it.x, it.y);
    }
  } else if (s.kind === 'cars') {
    const [rx, ry, rw, rh] = s.rect; const occ = s.occupancy ?? 0.6;
    for (let cy = ry + 1.6, row = 0; cy < ry + rh - 0.3; cy += 2.5, row++) for (let cx = rx + 0.7, col = 0; cx < rx + rw - 0.4; cx += 1.15, col++) {
      if (col % 7 === 6) continue; // 每 6 辆留一条人行通道
      if (!rng.chance(occ)) continue;
      const x = cx + rng.range(-0.06, 0.06), y = cy + 1.2;
      if (mm.tile(x, y - 0.6) !== 'asphalt' || mm.tile(x, y) !== 'asphalt') continue;
      addPlaced(propKey('car'), x, y);
    }
  } else if (s.kind === 'grove') {
    const xs = s.poly.map((p) => p[0]), ys = s.poly.map((p) => p[1]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const entries = Object.entries(s.species) as [Species, number][];
    const total = entries.reduce((a, [, w]) => a + w, 0);
    for (let gy = y0; gy < y1; gy += s.spacing) for (let gx = x0; gx < x1; gx += s.spacing) {
      const x = gx + rng.range(-0.45, 0.45) * s.spacing, y = gy + rng.range(-0.45, 0.45) * s.spacing;
      if (!pointInPoly(x, y, s.poly)) continue;
      if (vnoise(x * 16, y * 16, 150, 4242) < (s.threshold ?? 0.5) && !rng.chance(0.08)) continue;
      if (nearRoad(x, y)) continue;
      let r = rng.next() * total, sp = entries[0][0];
      for (const [k, w] of entries) { if ((r -= w) <= 0) { sp = k; break; } }
      tryPlace(sp, x, y, false, SPACING[sp] * 0.95);
    }
  }
}

// ---- 自动景观 A（建筑南立面前的绿篱）：用户要求少放灌木，已取消
/** 这些名字不挂门牌（门卫室、配套小房间等） */
const SIGNLESS = /门卫|岗亭|立柱|配套用房|值班室|平台|车库/;
// ---- 自动景观 C：门头招牌 + 食堂/浴室/超市门前铺装、遮阳伞桌椅 + 各楼门旁花坛
{
  const soft = new Set(['grass', 'forest', 'lawn', 'dirt', 'sand']);
  const walk = new Set(['grass', 'lawn', 'dirt', 'sand', 'path', 'stone', 'paver', 'plaza', 'plazaWarm', 'plazaDark', 'forest']);
  const kindOf = new Map(buildings.map((b) => [b.id, b]));
  const apron: { x0: number; y0: number; x1: number; y1: number }[] = [];
  for (const bo of buildingsOut) {
    const def = kindOf.get(bo.id)!; const d = bo.doors[0]; if (!d) continue;
    const cx = d.x + d.w / 2, dy = Math.ceil(d.y);
    const plate = SIGNLESS.test(def.name) || def.kind === 'misc' ? undefined : def.name; // 门牌写全名（第二公共教学楼、四社区A楼…），不再用简称
    if (plate) labels.push({ text: plate.length > 9 ? `${plate.slice(0, Math.ceil(plate.length / 2))}\n${plate.slice(Math.ceil(plate.length / 2))}` : plate, x: cx, y: d.y - (plate.length > 9 ? 2.5 : 2.05), size: 10, color: '#fbf3dc', stroke: '#1d3646', plate: true });
    const eat = def.kind === 'canteen' || def.id.includes('market') || def.id.includes('muslim');
    const bath = def.id.includes('bath');
    if (eat || bath) apron.push({ x0: d.x - (eat ? 4.5 : 2.5), y0: dy, x1: d.x + d.w + (eat ? 4.5 : 2.5), y1: dy + (eat ? 6 : 3.5) });
    if (eat) {
      let k = 0;
      for (const [ox, oy] of [[-6.2, 3.7], [6.2, 3.7], [-11.5, 4.4], [11.5, 4.4]] as const) {
        const x = cx + ox, y = dy + oy;
        if (!walk.has(mm.tile(x, y)) || inBuilding(x, y, 0.4)) continue;
        if (addPlaced(propKey('parasolTable'), x, y)) k++;
      }
      addPlaced('bin', cx + d.w / 2 + 1.6, dy + 1.1);
    }
    if (bath) { addPlaced('bin', cx + 3.2, dy + 1.1); addPlaced('bench', cx - 4.4, dy + 1.6); }
    // 门旁花坛（草地上才放）
    if (!eat && !bath && ['dorm', 'teaching', 'lab', 'admin', 'culture', 'service'].includes(def.kind)) for (const sd of [-1, 1]) {
      const x = cx + sd * (d.w / 2 + 4.1), y = dy + 0.55;
      if (soft.has(mm.tile(x, y)) && soft.has(mm.tile(x - sd, y)) && !inBuilding(x, y, 0.4)) addPlaced(`flowerbed_${1 + rng.int(3)}`, x, y);
    }
  }
  // 门前铺装：只覆盖草地/土地，不碰道路
  const saved: Shape[] = [];
  for (const a of apron) for (let ty = Math.floor(a.y0); ty < Math.ceil(a.y1); ty++) for (let tx = Math.floor(a.x0); tx < Math.ceil(a.x1); tx++) if (soft.has(mm.tile(tx, ty))) saved.push({ kind: 'rect', mat: 'plazaWarm', x: tx, y: ty, w: 1, h: 1 });
  paintShapes(mm, saved);
}
// ---- 自动景观 D：每个楼门两侧的自行车架（放大后门前更空，补上；S=1 已有手摆的）
if (S > 1) {
  const walkOk = new Set(['grass', 'lawn', 'dirt', 'sand', 'path', 'stone', 'paver', 'plaza', 'plazaWarm', 'plazaDark', 'forest']);
  const kindOf2 = new Map(buildings.map((b) => [b.id, b]));
  for (const bo of buildingsOut) {
    const k = kindOf2.get(bo.id)!.kind; if (!['dorm', 'teaching', 'lab', 'admin', 'service', 'canteen'].includes(k)) continue;
    const d = bo.doors[0]; if (!d) continue; const cx = d.x + d.w / 2, dy = Math.ceil(d.y);
    for (const sd of [-1, 1]) for (const off of [8, 15]) {
      const x = cx + sd * off, y = dy + 1.1;
      if (walkOk.has(mm.tile(x, y)) && !inBuilding(x, y, 0.4) && !tooClose(x, y, 1.8)) addPlaced('bikeRack', x, y);
    }
  }
}
// 到最近"非目标材质"格的距离（两遍倒角，≤60）：自动景观按"深度"布置
function depthMap(pred: (m: string) => boolean) {
  const dep = new Uint8Array(TW * TH);
  for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) dep[y * TW + x] = pred(mm.tile(x, y)) ? 60 : 0;
  const id = (x: number, y: number) => y * TW + x;
  for (let y = 1; y < TH - 1; y++) for (let x = 1; x < TW - 1; x++) { const i = id(x, y); if (!dep[i]) continue; dep[i] = Math.min(dep[i], dep[id(x - 1, y)] + 1, dep[id(x, y - 1)] + 1, dep[id(x - 1, y - 1)] + 1, dep[id(x + 1, y - 1)] + 1); }
  for (let y = TH - 2; y > 0; y--) for (let x = TW - 2; x > 0; x--) { const i = id(x, y); if (!dep[i]) continue; dep[i] = Math.min(dep[i], dep[id(x + 1, y)] + 1, dep[id(x, y + 1)] + 1, dep[id(x + 1, y + 1)] + 1, dep[id(x - 1, y + 1)] + 1); }
  const depAt = (x: number, y: number) => { const tx = Math.floor(x), ty = Math.floor(y); return tx < 1 || ty < 1 || tx >= TW - 1 || ty >= TH - 1 ? 0 : dep[id(tx, ty)]; };
  return { depAt };
}
// ---- 自动景观 E：大广场布置（放大后广场面积 ×4，按"距广场边缘的深度"自动布置灯/椅/树池/花坛/垃圾桶）
if (S > 1) {
  const PL = new Set(['plaza', 'plazaWarm', 'stone']);
  const { depAt } = depthMap((m) => PL.has(m));
  const pits: Shape[] = [];
  const lat = (period: number, ox: number, oy: number, minDepth: number, put: (x: number, y: number) => void) => {
    for (let gy = oy; gy < TH; gy += period) for (let gx = ox; gx < TW; gx += period) if (depAt(gx, gy) >= minDepth && !inBuilding(gx, gy, 0.5)) put(gx + 0.5, gy + 0.5);
  };
  const TREES: Species[] = ['ginkgo', 'maple', 'blossom', 'oakS'];
  let nL = 0, nB = 0, nT = 0, nF = 0, nBin = 0;
  lat(12, 6, 6, 2, (x, y) => { if (tooClose(x, y, 3)) return; if (addPlaced('lampGold', x, y)) { lamps.push([x, y, 54]); nL++;
      for (const sd of [-1, 1]) if (depAt(x + sd * 2.4, y + 0.6) >= 2 && addPlaced('bench', x + sd * 2.4, y + 0.9)) nB++; } });
  lat(14, 13, 13, 5, (x, y) => { if (tooClose(x, y, 4)) return; const sp = TREES[Math.floor(hash2(Math.floor(x), Math.floor(y), 99) * TREES.length)];
    if (addPlaced(pickVariant(sp), x, y)) { nT++; pits.push({ kind: 'rect', mat: 'plazaDark', x: Math.floor(x) - 1, y: Math.floor(y) - 1, w: 3, h: 3 }); } });
  lat(16, 3, 9, 4, (x, y) => { if (!tooClose(x, y, 2.5) && addPlaced(`flowerbed_${1 + rng.int(3)}`, x, y)) nF++; });
  lat(18, 9, 3, 3, (x, y) => { if (!tooClose(x, y, 2) && addPlaced('bin', x, y)) nBin++; });
  // 休憩区：廊架 + 两套遮阳伞桌椅（每 ~40 格一处，只放在较宽的广场内部）
  let nP = 0;
  lat(40, 22, 22, 4, (x, y) => { if (tooClose(x, y, 7)) return; if (addPlaced('pergola', x, y)) { nP++; for (const sd of [-1, 1]) addPlaced(propKey('parasolTable'), x + sd * 5.5, y + 0.6); } });
  log(`  休憩廊架 ${nP}`);
  // 窄广场/步道广场（深度 2~4）放不下大树池：每 9 格一棵小树 + 3×3 树池
  let nTn = 0;
  lat(9, 4, 4, 2, (x, y) => { if (depAt(x, y) >= 5 || tooClose(x, y, 4.5)) return; const sp: Species = hash2(Math.floor(x), Math.floor(y), 7) < 0.5 ? 'ginkgo' : 'oakS';
    if (addPlaced(pickVariant(sp), x, y)) { nTn++; pits.push({ kind: 'rect', mat: 'plazaDark', x: Math.floor(x) - 1, y: Math.floor(y) - 1, w: 3, h: 3 }); } });
  log(`  窄广场树池 ${nTn}`);
  paintShapes(mm, pits);
  log(`广场自动布置：金灯 ${nL}、长椅 ${nB}、树池 ${nT}、花坛 ${nF}、垃圾桶 ${nBin}`);
}
// ---- 自动景观 B：湖岸芦苇与水面睡莲
{
  const lr = new Rng(515);
  for (let ty = 40 * S; ty < 140 * S; ty++) for (let tx = 140 * S; tx < 225 * S; tx++) {
    const m = mm.tile(tx, ty);
    if (m === 'grass' || m === 'forest') {
      const wet = mm.tile(tx + 1, ty) === 'water' || mm.tile(tx - 1, ty) === 'water' || mm.tile(tx, ty + 1) === 'water' || mm.tile(tx, ty - 1) === 'water';
      if (wet && lr.chance(0.32) && !inBuilding(tx, ty)) addPlaced(`reed_${1 + lr.int(3)}`, tx + 0.2 + lr.next() * 0.6, ty + 0.95);
      if (S > 1 && wet && lr.chance(0.07) && !inBuilding(tx, ty)) addPlaced(`rockS_${1 + lr.int(3)}`, tx + 0.5, ty + 0.9);
    } else if (m === 'water') {
      let deep = true;
      for (const [dx, dy] of [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2]]) if (mm.tile(tx + dx, ty + dy) !== 'water') { deep = false; break; }
      if (deep && lr.chance(0.012 / (S * S))) addPlaced(`lily_${1 + lr.int(3)}`, tx + 0.5, ty + 0.7);
    }
  }
}
// ---- 图书馆正前方的大广场清空（用户要求）：路灯、公告牌、花坛、草丛、垃圾桶、长椅全部去掉，留给商店和校园墙；树留着
{
  const ZX0 = PLAZA.x0, ZX1 = PLAZA.x1, ZY0 = PLAZA.y0, ZY1 = PLAZA.y1;
  const FURNITURE = /^(bench|bin|lamp|lampGold|flowerbed_\d|bush_\d|noticeBoard|messageBoard|parasolTable_\d|bollard|sign)$/;
  const TREE = /^(oak|oakS|oakL|poplar|ginkgo|maple|blossom|pine|willow)_/;
  const inRect = (p: Placed, x0: number, y0: number, x1: number, y1: number) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1;
  const dead = new Set<Placed>();
  for (const p of placed) {
    if (FURNITURE.test(p.key) && inRect(p, ZX0, ZY0, ZX1, ZY1)) dead.add(p);
    // 两座大建筑的脚印和门前一圈不留树
    else if (TREE.test(p.key) && PLAZA_BUILDINGS.some((b) => inRect(p, b.x - b.w / 2 - 2, b.y - b.d - 3, b.x + b.w / 2 + 2, b.y + 6))) dead.add(p);
  }
  // 2026-11-02 再清一遍：广场里（含周边 3 格内的树）只留国旗杆和两座大建筑，其余摆件、树全部去掉
  const KEEP = /^(flagpole|shop|campusWall)$/;
  for (const p of placed) {
    if (dead.has(p) || KEEP.test(p.key)) continue;
    if (inRect(p, ZX0, ZY0, ZX1, ZY1) || (TREE.test(p.key) && inRect(p, ZX0 - 3, ZY0 - 3, ZX1 + 3, ZY1 + 3))) dead.add(p);
  }
  const gone = new Set([...dead].filter((p) => p.key === 'lamp' || p.key === 'lampGold').map((p) => `${p.x},${p.y}`));
  for (let i = placed.length - 1; i >= 0; i--) if (dead.has(placed[i])) placed.splice(i, 1);
  for (let i = lamps.length - 1; i >= 0; i--) if (gone.has(`${lamps[i][0]},${lamps[i][1]}`)) lamps.splice(i, 1);
  log(`图书馆广场清空：移除 ${dead.size} 个路灯/座椅/花坛/垃圾桶/草丛/树`);
}
// ---- 清理：灌木全部去掉（NO_BUSH）、路灯变稀、道路中间不放树/灯/草丛/花坛（用户要求）
{
  const TREE = /^(oak|oakS|oakL|poplar|ginkgo|maple|blossom|pine|willow)_/;
  const ASPHALTY = new Set(['asphalt', 'zebraH', 'zebraV', 'line', 'lineY']);
  const WAYS = new Set(['asphalt', 'zebraH', 'zebraV', 'line', 'lineY', 'path', 'paver', 'steps']);
  const { depAt: wayDepth } = depthMap((m) => WAYS.has(m));
  const isLamp = (k: string) => k === 'lamp' || k === 'lampGold';
  const dead = new Set<Placed>();
  const stat = { bush: 0, onRoad: 0, lamp: 0 };
  // 1) 灌木：2026-11-02 起暂时全部去掉（用户要求"去掉草丛建模，保持绿地"）；想恢复就把 NO_BUSH 改成 false（回到只留 ~10%，确定性抽样）
  const NO_BUSH = true;
  for (const p of placed) if (p.key.startsWith('bush_') && (NO_BUSH || hash2(Math.floor(p.x * 8), Math.floor(p.y * 8), 321) > 0.1)) { dead.add(p); stat.bush++; }
  // 2) 道路中间：沥青路面上一律不放；路面/铺装步道上离路缘 ≥2 格（真正的路中间）也不放
  for (const p of placed) {
    if (dead.has(p) || !(TREE.test(p.key) || isLamp(p.key) || p.key.startsWith('bush_') || p.key.startsWith('flowerbed_'))) continue;
    const m = mm.tile(p.x, p.y);
    if ((!isLamp(p.key) && ASPHALTY.has(m)) || wayDepth(p.x, p.y) >= 2) { dead.add(p); stat.onRoad++; } // 路灯允许站在路缘那一格
  }
  // 3) 路灯变稀：先留金灯（广场），再按最小间距挑选，其余去掉
  const lampObjs = placed.filter((p) => isLamp(p.key) && !dead.has(p)).sort((a, b) => (a.key === 'lampGold' ? 0 : 1) - (b.key === 'lampGold' ? 0 : 1) || a.y - b.y || a.x - b.x);
  const kept: Placed[] = [];
  for (const l of lampObjs) {
    const gap = l.key === 'lampGold' ? 22 : 18;
    if (kept.some((k) => Math.hypot(k.x - l.x, k.y - l.y) < gap)) { dead.add(l); stat.lamp++; } else kept.push(l);
  }
  const gone = new Set([...dead].filter((p) => isLamp(p.key)).map((p) => `${p.x},${p.y}`));
  for (let i = placed.length - 1; i >= 0; i--) if (dead.has(placed[i])) placed.splice(i, 1);
  for (let i = lamps.length - 1; i >= 0; i--) if (gone.has(`${lamps[i][0]},${lamps[i][1]}`)) lamps.splice(i, 1);
  log(`清理：灌木 -${stat.bush}，道路中间 -${stat.onRoad}，路灯去重 -${stat.lamp}（剩 ${lamps.length} 盏）`);
}
// ---- 手动层的物件：最后处理，不受上面任何自动清理影响——先擦除，再按用户摆的位置放（用户说了算）
{
  const TREEK = /^(oak|oakS|oakL|poplar|ginkgo|maple|blossom|pine|willow|bush)_/;
  const PROTECT = /^(shop|campusWall)$/;
  const isLampK = (k: string) => k === 'lamp' || k === 'lampGold';
  let added = 0, removed = 0;
  const putW = (key: string, x: number, y: number, k = key) => { // x,y = 世界格
    if (!anchors[key]) { console.warn(`手动层：没有这个物件 ${k}`); return; }
    const p = { key, x, y }; placed.push(p); const ck = cellKey(x, y); (grid.get(ck) ?? grid.set(ck, []).get(ck)!).push(p);
    if (k === 'lamp') lamps.push([x, y]); if (k === 'lampGold') lamps.push([x, y, 54]);
    added++;
  };
  const put = (k: string, ux: number, uy: number) => putW(manualSpriteKey(k, ux, uy), ux * S, uy * S, k);
  const putFence = (pts: [number, number][], piers: number, wall: boolean, force: boolean) => { // 手动围栏：和蓝图 fence 同一算法（路口自动留口、楼里不放），横向的墙用 wallH
    for (const cell of fenceCells(pts.map(([x, y]) => [x * S, y * S] as [number, number]), piers, wall, true)) {
      const m = mm.tile(cell.px, cell.py);
      if (!force && (ROADISH.has(m) || m === 'water' || m === 'lineY')) continue;
      if (inBuilding(cell.px, cell.py, 0.3)) continue;
      for (const it of cell.items) putW(it.k, it.x, it.y);
    }
  };
  for (const layer of layers) { // 每一层：先擦除（也会擦掉前面各层摆的），再摆自己的
    const dead = new Set<Placed>();
    for (const e of layer.erase) {
      const [rx, ry, rw, rh] = e.rect.map((v) => v * S);
      for (const p of placed) {
        if (PROTECT.test(p.key) || p.x < rx || p.x > rx + rw || p.y < ry || p.y > ry + rh) continue;
        const tree = TREEK.test(p.key);
        if (e.what === 'all' || (e.what === 'trees' && tree) || (e.what === 'props' && !tree)) dead.add(p);
      }
    }
    const gone = new Set([...dead].filter((p) => isLampK(p.key)).map((p) => `${p.x},${p.y}`));
    for (let i = placed.length - 1; i >= 0; i--) if (dead.has(placed[i])) placed.splice(i, 1);
    for (let i = lamps.length - 1; i >= 0; i--) if (gone.has(`${lamps[i][0]},${lamps[i][1]}`)) lamps.splice(i, 1);
    removed += dead.size;
    for (const o of layer.objects) put(o.k, o.x, o.y);
    for (const r of layer.rows) for (const [x, y] of rowPoints(r.pts, r.spacing)) put(r.k, x, y);
    for (const f of layer.fences ?? []) putFence(f.pts, f.piers ?? 4, !!f.wall, !!f.force);
    for (const fd of layer.fields ?? []) { const ex = expandField(fd); for (const o of ex.objects) put(o.k, o.x, o.y); for (const f of ex.fences) putFence(f.pts, f.piers ?? 4, !!f.wall, !!f.force); }
  }
  const cnt = (f: (l: (typeof layers)[number]) => number) => layers.reduce((a, l) => a + f(l), 0);
  if (cnt((l) => l.shapes.length + l.objects.length + l.rows.length + l.erase.length + (l.fences?.length ?? 0) + (l.fields?.length ?? 0) + (l.bp?.hide.length ?? 0) + Object.keys(l.bp?.edit ?? {}).length)) log(`手动层（${layers.length} 层）：地面 ${cnt((l) => l.shapes.length)} 块，运动场 ${cnt((l) => l.fields?.length ?? 0)} 个，围栏 ${cnt((l) => l.fences?.length ?? 0)} 条，蓝图去掉 ${cnt((l) => l.bp?.hide.length ?? 0)}/改 ${cnt((l) => Object.keys(l.bp?.edit ?? {}).length)} 项，擦除 ${cnt((l) => l.erase.length)} 处（去掉 ${removed} 个物件），新放 ${added} 个物件`);
}
log('放置对象', placed.length, droppedByDoor ? `（门前保留区挡掉 ${droppedByDoor} 个）` : '');

// ------------------------------------------------------------ 5. 碰撞
const rows: Uint8Array[] = Array.from({ length: TH }, () => new Uint8Array(TW));
const B = terrain.bounds;
for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) {
  let blocked = x < B.x || y < B.y || x >= B.x + B.w || y >= B.y + B.h;
  if (!blocked) {
    let water = 0;
    for (const [dx, dy] of [[0.5, 0.5], [0.15, 0.15], [0.85, 0.15], [0.15, 0.85], [0.85, 0.85]]) if (mm.tile(x + dx - 0.5, y + dy - 0.5) === 'water') water++;
    if (water >= 3) blocked = true;
    const m = mm.tile(x, y);
    if (m === 'roof') blocked = true;
  }
  rows[y][x] = blocked ? 1 : 0;
}
const blockRect = (x: number, y: number, w: number, h: number) => {
  for (let j = Math.floor(y); j < Math.ceil(y + h); j++) for (let i = Math.floor(x); i < Math.ceil(x + w); i++) if (i >= 0 && j >= 0 && i < TW && j < TH) rows[j][i] = 1;
};
for (const f of footprints) {
  if (!f.poly) { blockRect(f.x, f.y, f.w, f.d); continue; }
  for (let j = Math.floor(f.y) - 1; j <= Math.ceil(f.y + f.d) + 1; j++) for (let i = Math.floor(f.x) - 1; i <= Math.ceil(f.x + f.w) + 1; i++) {
    if (pointInPoly(i + 0.5, j + 0.5, f.poly) || pointInPoly(i + 0.2, j + 0.2, f.poly) || pointInPoly(i + 0.8, j + 0.8, f.poly) || pointInPoly(i + 0.8, j + 0.2, f.poly) || pointInPoly(i + 0.2, j + 0.8, f.poly))
      if (i >= 0 && j >= 0 && i < TW && j < TH) rows[j][i] = 1;
  }
}
for (const b of terrain.blocks) blockRect(b.x, b.y, b.w, b.h);
/** 树木、路灯、灌木、花坛不再阻挡行走（用户要求：别总是被它们卡住）；树冠本来就是"走到后面"的遮挡效果 */
const WALK_THROUGH = /^(oak|oakS|oakL|poplar|ginkgo|maple|blossom|pine|willow|bush|lamp|flowerbed|noticeBoard|messageBoard)/;
for (const p of placed) {
  const a = anchors[p.key]; if (!a?.block || WALK_THROUGH.test(p.key)) continue;
  blockRect(p.x + a.block.x / TILE, p.y + a.block.y / TILE, a.block.w / TILE, a.block.h / TILE);
}
if (REGION) for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) if (x < REGION[0] || x >= REGION[2] || y < REGION[1] || y >= REGION[3]) rows[y][x] = 1;
log('碰撞完成');
// 水面格（钓鱼用）：按行记成 [y, x0, x1) 的连续段，体积很小
const waterRuns: [number, number, number][] = [];
for (let y = 0; y < TH; y++) { let x = 0; while (x < TW) { if (mm.tile(x, y) === 'water') { let x1 = x; while (x1 < TW && mm.tile(x1, y) === 'water') x1++; waterRuns.push([y, x, x1]); x = x1; } else x++; } }
// 草地格（精灵遭遇用）：草/草坪/林地的格子记成位图（每格 1 位，按行优先），base64 后只有几十 KB。道路、广场、建筑、水面都不算
const grassBytes = new Uint8Array(Math.ceil((TW * TH) / 8));
for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) { const m = mm.tile(x, y); if (m === 'grass' || m === 'lawn' || m === 'forest') { const i = y * TW + x; grassBytes[i >> 3] |= 1 << (i & 7); } }
const grass = Buffer.from(grassBytes).toString('base64');

// ------------------------------------------------------------ 6. 地面块（四个季节各一套）+ 各季节的道具图集
const CH = 1024, cols = Math.ceil(mm.w / CH), crow = Math.ceil(mm.h / CH);
const srcHash = createHash('md5').update(readFileSync(new URL('./terrain.ts', import.meta.url))).update(readFileSync(new URL('./seasons.ts', import.meta.url))).update(readFileSync(new URL('../art/palette.ts', import.meta.url))).digest('hex');
const hashFile = join(CACHE, OUT === 'generated' ? 'chunk-hashes.json' : `chunk-hashes-${OUT}.json`);
const hashes: Record<string, string> = existsSync(hashFile) ? JSON.parse(readFileSync(hashFile, 'utf8')) : {};
const waterChunks: string[] = [], chunkList: string[] = [];
const FRAMES = 4;
// 季节无关的材质缓冲摘要：水面动画帧只和地形有关，不用每个季节重画
for (const season of SEASONS) {
  applySeason(season);
  mkdirSync(join(OUTDIR, 'ground', season), { recursive: true });
  for (let cy = 0; cy < crow; cy++) for (let cx = 0; cx < cols; cx++) {
    const x0 = cx * CH, y0 = cy * CH, w = Math.min(CH, mm.w - x0), h = Math.min(CH, mm.h - y0);
    if (REGION && (x0 + w <= REGION[0] * TILE || x0 >= REGION[2] * TILE || y0 + h <= REGION[1] * TILE || y0 >= REGION[3] * TILE)) continue;
    const key = `${cx}_${cy}`;
    if (season === SEASONS[0]) chunkList.push(key);
    const pad = 14;
    const sub = new Uint8Array((w + pad * 2) * (h + pad * 2));
    for (let y = -pad; y < h + pad; y++) for (let x = -pad; x < w + pad; x++) sub[(y + pad) * (w + pad * 2) + x + pad] = mm.at(x0 + x, y0 + y);
    const hh = createHash('md5').update(sub).update(srcHash).digest('hex');
    const hasWater = sub.includes(MID.water);
    if (hasWater && season === SEASONS[0]) waterChunks.push(key);
    const file = join(OUTDIR, 'ground', season, `c_${key}.png`), hk = `${season}:${key}`;
    const waterOk = !hasWater || season !== SEASONS[0] || existsSync(join(OUTDIR, 'ground', `w1_${key}.png`));
    if (hashes[hk] === hh && existsSync(file) && waterOk) continue;
    const wd = hasWater ? waterDistance(mm, x0, y0, w, h, 14) : undefined;
    const img = renderRegion({ mm, wd, frame: 0, seed: 7 }, x0, y0, w, h);
    await img.save(file);
    if (hasWater && season === SEASONS[0]) {
      for (let f = 1; f < FRAMES; f++) {
        const full = renderRegion({ mm, wd, frame: f, seed: 7 }, x0, y0, w, h, false);
        const ov = new Img(w, h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mm.at(x0 + x, y0 + y) === MID.water) ov.set(x, y, full.get(x, y));
        await ov.save(join(OUTDIR, 'ground', `w${f}_${key}.png`));
      }
    }
    hashes[hk] = hh;
    log('地面块', hk);
  }
}
mkdirSync(CACHE, { recursive: true });
writeFileSync(hashFile, JSON.stringify(hashes));

// ------------------------------------------------------------ 7. 图集 + 小地图 + world.json
// 建筑图集按"离出生点由近到远"分成很多小页（每页 ≤1024 高），客户端启动时只下载出生点附近用到的页，其余按需加载（世界里走到哪、加载哪页）
const spawn0 = pois.find((p) => p.kind === 'spawn'), spX = (spawn0?.x ?? TW / 2) * TILE, spY = (spawn0?.y ?? TH / 2) * TILE;
const wingPos = new Map<string, { x: number; y: number }>();
for (const bo of buildingsOut) for (const w of bo.wings) wingPos.set(w.k, { x: w.x, y: w.y });
const spriteDist = (it: PackItem) => { const p = wingPos.get(it.key)!; return Math.hypot(p.x + it.img.w / 2 - spX, p.y + it.img.h / 2 - spY); };
const bPages = packPagesOrdered([...buildingSprites].sort((a, b) => spriteDist(a) - spriteDist(b)), 2048, 1024);
for (let i = 0; i < bPages.length; i++) { await bPages[i].img.save(join(OUTDIR, `atlas-buildings-${i}.png`)); writeFileSync(join(OUTDIR, `atlas-buildings-${i}.json`), JSON.stringify(bPages[i].json)); }
const pageOf: Record<string, number> = Object.assign({}, ...bPages.map((p) => p.pageOf));
const spriteSize = new Map(buildingSprites.map((it) => [it.key, it.img] as const));
for (const bo of buildingsOut) for (const w of bo.wings) { w.pg = pageOf[w.k]; const im = spriteSize.get(w.k)!; w.w = im.w; w.h = im.h; }
// 道具图集：每个季节一张（树叶/灌木换色），帧名与布局完全相同，所以共用一份 json
const propsJson = new Map<string, string>();
for (const season of SEASONS) {
  applySeason(season); genProps();
  const pAtlas = pack(propSprites, 1024 + (S > 1 ? 1024 : 0));
  await pAtlas.img.save(join(OUTDIR, `atlas-props-${season}.png`));
  propsJson.set(season, JSON.stringify(pAtlas.json));
}
if (new Set(propsJson.values()).size !== 1) throw new Error('各季节的道具图集布局不一致（精灵尺寸随季节变了？）');
writeFileSync(join(OUTDIR, 'atlas-props.json'), propsJson.get(SEASONS[0])!);
applySeason('spring');

// 小地图：每 tile 2px
const MS = 3, mini = new Img(TW * MS, TH * MS);
const matCol: Record<string, RGBA> = {
  grass: PAL.grass[2], forest: PAL.grass[0], lawn: PAL.grass[1], dirt: PAL.dirt[2], sand: PAL.dirt[3], path: PAL.stone[3], stone: PAL.stone[3], paver: PAL.paver[2],
  asphalt: PAL.asphalt[1], water: PAL.water[2], rubber: [103, 143, 159, 255] as RGBA, boardwalk: PAL.wood[2], track: PAL.track[1], pitch: PAL.pitch[1], courtBlue: PAL.courtBlue[0], courtGreen: PAL.courtGreen[0], courtRed: PAL.courtRed[0],
  roof: PAL.white[3], plaza: PAL.plaza[2], plazaDark: PAL.plaza[1], plazaWarm: PAL.plazaWarm[2], steps: PAL.steps[3], bedPink: PAL.blossom[2], bedPurple: PAL.blossom[0], bedYellow: PAL.ginkgo[3], line: PAL.line, lineY: PAL.markY, zebraH: PAL.markW, zebraV: PAL.markW,
};
for (let y = 0; y < TH; y++) for (let x = 0; x < TW; x++) mini.rect(x * MS, y * MS, MS, MS, matCol[mm.tile(x, y)] ?? PAL.grass[2]);
for (const p of placed) if (/oak|ginkgo|blossom|willow|pine|poplar/.test(p.key)) mini.rect(Math.floor(p.x * MS) - 1, Math.floor(p.y * MS) - 2, 2, 2, PAL.leaf[1]);
for (const f of footprints) mini.rect(Math.floor(f.x * MS), Math.floor(f.y * MS), Math.ceil(f.w * MS), Math.ceil(f.d * MS), PAL.brick[2]);
await mini.save(join(OUTDIR, 'minimap.png'));

// 行人出生点：路面/广场/铺装上的可走格，稀疏采样
const walkRng = new Rng(77);
const npcSpawns: [number, number][] = [];
for (let tries = 0; tries < 200000 && npcSpawns.length < 160 * S * S; tries++) {
  const tx = B.x + 2 + walkRng.int(B.w - 4), ty = B.y + 2 + walkRng.int(B.h - 4);
  const m = mm.tile(tx, ty);
  if ((m === 'path' || m === 'stone' || m === 'paver' || m === 'lawn' || m === 'plaza' || m === 'plazaWarm' || m === 'plazaDark') && rows[ty][tx] === 0 && rows[ty][tx + 1] === 0 && rows[ty + 1]?.[tx] === 0) npcSpawns.push([tx + 0.5, ty + 0.9]);
}
// 校验用：已覆盖的"路面/建筑"掩膜（每 tile 4px），供 tools/analysis/road_gap.py 对比卫星图找漏路（仅 S=1）
{ // 以原 5 m/格 为单位（每格 4px）输出，与 S 无关
  const SC = 4, cw = Math.round(TW / S), ch = Math.round(TH / S), cov = new Img(cw * SC, ch * SC);
  const ROADLIKE = new Set(['asphalt', 'path', 'stone', 'paver', 'dirt', 'sand', 'zebraH', 'zebraV', 'lineY', 'line', 'plaza', 'plazaDark', 'plazaWarm', 'steps']);
  for (let y = 0; y < ch * SC; y++) for (let x = 0; x < cw * SC; x++) {
    const px = Math.floor((x + 0.5) * (TILE * S / SC)), py = Math.floor((y + 0.5) * (TILE * S / SC));
    if (ROADLIKE.has(MATS[mm.at(px, py)])) cov.set(x, y, [255, 255, 255, 255]);
  }
  for (const f of footprints) {
    const x0 = Math.floor((f.x / S - 0.5) * SC), y0 = Math.floor((f.y / S - 0.5) * SC), x1 = Math.ceil(((f.x + f.w) / S + 0.5) * SC), y1 = Math.ceil(((f.y + f.d) / S + 0.5) * SC);
    cov.rect(x0, y0, x1 - x0, y1 - y0, [0, 0, 255, 255]);
  }
  await cov.save(join(CACHE, 'coverage.png'));
}
const objs: ObjOut[] = placed.filter((p) => inRegion(p.x, p.y, 16)).map((p) => ({ k: p.key, x: Math.round(p.x * TILE), y: Math.round(p.y * TILE), ax: anchors[p.key].ax, ay: anchors[p.key].ay }));
const spawnPoi = pois.find((p) => p.kind === 'spawn');
const world: WorldFile = {
  version: 2, tile: TILE, width: TW, height: TH,
  chunk: { px: CH, cols, rows: crow },
  water: { frames: FRAMES, chunks: waterChunks },
  collision: rows.map((r) => Array.from(r).join('')),
  buildings: buildingsOut, objects: objs, lamps: lamps.filter((l) => inRegion(l[0], l[1], 8)), pois: pois.filter((p) => inRegion(p.x, p.y, 20)),
  waterRuns, grass,
  spawn: { x: spawnPoi?.x ?? TW / 2, y: spawnPoi?.y ?? TH / 2 },
  npcSpawns: npcSpawns.filter((n) => inRegion(n[0], n[1])), labels: labels.filter((l) => inRegion(l.x, l.y, 8)), interacts, anims: anims.filter((a) => inRegion(a.x / TILE, a.y / TILE, 8)),
  scale: S, chunks: chunkList,
  atlases: { buildings: 'atlas-buildings', props: 'atlas-props', buildingPages: bPages.length },
};
writeFileSync(join(OUTDIR, 'world.json'), JSON.stringify(world));
log('完成：', `建筑 ${buildingsOut.length}，对象 ${objs.length}，地面块 ${cols * crow}`);
