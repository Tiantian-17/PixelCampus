/**
 * 生成农场的地块状态素材。
 *
 *   npx tsx tools/art/gen-farm-assets.ts
 *
 * 每块地两层：
 *   - 土壤层 32×32（未翻的草地 / 翻好的深色土）——正好铺满一块地，靠 1px 软边形成 4×4 格子
 *   - 作物层 32×40（透明底，底边贴地块底边）——向上长只占用格子之间 8px 的空隙，横向不越界压到隔壁地
 *
 * 作物不再用「物品图标放大 3 倍」（3px 的大颗粒和场景 1px 的像素密度对不上，成熟时还会横向溢出），
 * 改成 1:1 手绘：嫩芽 4 阶段 / 8 种成熟作物，全部限制在 32×40 内。
 * 颜色全部采样自手绘底图 farm-source.png（橄榄绿草、红棕土），避免出现刺眼的补丁。
 *
 * 产物落在 data/art/farm-scene/states/（入库，可逐块替换）：
 *   state_grass.png         未翻的草地（不透明）
 *   state_tilled.png        翻好的深色土 + 犁沟（不透明）
 *   state_sprout0..3.png    四阶段嫩芽（透明底）
 *   state_mature_<作物>.png 8 种成熟作物
 * 编译链见 tools/art/farm-tiles.ts。
 */
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../paths.ts';
import { Img, Rng, hex, hash2 } from './px.ts';
import { CROPS } from '../../src/shared/farming.ts';

const DIR = join(ROOT, 'data', 'art', 'farm-scene');
const STATES = join(DIR, 'states');
/** 土壤 tile：32×32 = 一块地（2×2 格） */
const S = 32;
/** 作物图：32 宽（不越界）× 40 高（向上占用格子间的 8px 空隙） */
const CW = 32, CH = 40;
const CROP_IDS = CROPS.map((c) => c.id.replace(/^crop_/, ''));

/** 调色板：全部取自底图采样 */
const C = {
  grassA: '#68834a', grassB: '#759255', grassC: '#5b743f', blade: '#8da85e', bladeLit: '#9cb86a',
  soilA: '#6e5033', soilB: '#7d5c3c', soilC: '#5f4429', furrow: '#4a3320', furrowLit: '#8f6a44',
  stem: '#4a7f31', leaf: '#5f9b3b', leafDark: '#3f7029', leafLit: '#8cbf55',
  shadow: '#2e2214',
};

async function savePng(img: Img, path: string) {
  await sharp(Buffer.from(img.data.buffer), { raw: { width: img.w, height: img.h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(path);
}

const px = (c: string, a = 255) => hex(c, a);

/** 底色抖动：1px 随机点混 2×2 小块，出的是硬边像素颗粒；用平滑噪声会糊成迷彩布 */
function ditherFill(i: Img, a: string, b: string, c: string, seed: number) {
  for (let y = 0; y < i.h; y++) for (let x = 0; x < i.w; x++) {
    const h = hash2(x, y, seed) * 0.6 + hash2(x >> 1, y >> 1, seed + 1) * 0.4;
    i.set(x, y, px(h < 0.42 ? a : h < 0.78 ? b : c));
  }
  return i;
}

/** 未翻的草地：不铺底色、不画边框——只在格子中间点几笔深一点的草叶和踩痕，
 *  底图草地直接透上来，16 块排在一起也看不出方块；田的形状交给底图上的田埂。 */
function grass(): Img {
  const i = new Img(S, S);
  const rng = new Rng(4107);
  for (let k = 0; k < 54; k++) { // 稀疏深色草叶
    const x = 3 + rng.int(S - 6), y = 4 + rng.int(S - 8);
    const len = 1 + rng.int(3), dir = rng.chance(0.5) ? 1 : -1;
    const col = px(rng.chance(0.55) ? C.grassC : C.grassA, 150);
    for (let j = 0; j < len; j++) i.set(x + dir * j, y - j, col);
  }
  for (let k = 0; k < 12; k++) { // 踩出来的亮草尖
    i.set(4 + rng.int(S - 8), 4 + rng.int(S - 8), px(rng.chance(0.5) ? C.bladeLit : C.blade, 120));
  }
  // 边缘再淡一层：最外一圈全透、第二圈只留零散像素，避免出现 32px 的方格边
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y), di = (y * S + x) * 4;
    if (d === 0) i.data[di + 3] = 0;
    else if (d === 1 && hash2(x, y, 71) < 0.6) i.data[di + 3] = 0;
  }
  return i;
}

/** 翻好的深色土：颗粒抖动底 + 2 道断开的浅沟 + 碎土块。
 *  边缘不画整条硬描边（16 块排在一起会像贴上去的方砖）：最外圈随机断开让底下的草透上来，
 *  再让几撮草叶从边上压进土里。v = 0/1/2 三张略有差异的图，按地块散开用。 */
function tilled(v = 0): Img {
  const i = ditherFill(new Img(S, S), C.soilA, C.soilB, C.soilC, 7 + v * 29);
  const rng = new Rng(33 + v * 17);
  for (let k = 0; k < 26; k++) { // 干土粒：提亮一点，别整块死沉
    i.set(2 + rng.int(S - 4), 2 + rng.int(S - 4), px(C.furrowLit, 70));
  }
  for (let y0 = 4 + v; y0 < S - 2; y0 += 11) { // 2 道浅沟，每 11px 一断（断口每张图错开），别连成"木地板"
    for (let x = 1; x < S - 1; x++) {
      if (hash2(Math.floor(x / 9), y0, 17 + v) < 0.18) continue;
      i.set(x, y0, px(C.furrow, 110));
    }
  }
  for (let k = 0; k < 20; k++) { // 碎土块
    const x = 2 + rng.int(S - 6), y = 2 + rng.int(S - 5);
    i.rect(x, y, 2 + (rng.chance(0.3) ? 1 : 0), 1, px(rng.chance(0.5) ? C.furrowLit : C.furrow, 90));
  }
  // 边缘：最外一圈随机断开（草透上来），第二圈零星透一点；直接改 alpha，绕开 set 的混合
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.min(x, y, S - 1 - x, S - 1 - y), di = (y * S + x) * 4;
    if (d > 1) continue;
    const h = hash2(x, y, 61 + v * 7);
    if (d === 0) i.data[di + 3] = Math.round(i.data[di + 3] * (h < 0.34 ? 0.35 : 0.72 + h * 0.28));
    else if (h > 0.6) i.data[di + 3] = Math.round(i.data[di + 3] * 0.82);
  }
  // 草叶从地块边缘长进来
  for (let k = 0; k < 16; k++) {
    const side = rng.int(4), along = 2 + rng.int(S - 4);
    const [x, y, dx, dy] = side === 0 ? [along, 0, 0, 1] : side === 1 ? [along, S - 1, 0, -1] : side === 2 ? [0, along, 1, 0] : [S - 1, along, -1, 0];
    const len = 2 + rng.int(3), col = px(rng.chance(0.5) ? C.grassB : C.blade, 190);
    for (let j = 0; j < len; j++) i.set(x + dx * j + (dy && j > 1 ? (j % 2 ? 1 : -1) : 0), y + dy * j, col);
  }
  return i;
}

// ------------------------------------------------------------ 作物画法（1:1，限制在 32×40 内）
const CX = CW / 2, GROUND = CH - 2; // 中线 16，地面 38

function shadow(i: Img, rx = 11) { i.ellipse(CX, GROUND, rx, 2, px(C.shadow, 90)); }

/** 一片朝 dir(-1/1) 伸出的叶子：根部粗、梢部收成尖，上面 1px 高光、下面 1px 暗边 */
function leaf(i: Img, x: number, y: number, dir: 1 | -1, len: number, rise = 0.35) {
  for (let k = 0; k < len; k++) {
    const xx = x + dir * k, yy = y - Math.round(k * rise);
    i.set(xx, yy, px(k >= len - 2 ? C.leafDark : C.leaf));
    i.set(xx, yy + 1, px(C.leafDark));
    if (k < 2) i.set(xx, yy - 1, px(C.leafLit));
  }
}

/** 嫩芽 4 阶段：茎越高、叶层越多；叶子左右交替，避免长成对称的「X」 */
function sprout(stage: number): Img {
  const i = new Img(CW, CH);
  const h = [6, 12, 19, 27][stage];
  const top = GROUND - h;
  shadow(i, 5 + stage * 2);
  for (let y = top; y < GROUND; y++) { // 茎：2px 主体 + 右侧 1px 暗边（stage 1 起变粗，别细得看不见）
    i.set(CX - 1, y, px(C.stem));
    i.set(CX, y, px(C.stem));
    if (stage >= 1) i.set(CX + 1, y, px(C.leafDark));
  }
  i.set(CX - 1, top, px(C.leafLit));     // 顶尖一点亮
  if (stage === 0) {                     // 刚破土：两片子叶，一大一小
    leaf(i, CX - 1, GROUND - 4, -1, 6);
    leaf(i, CX, GROUND - 3, 1, 5);
    return i;
  }
  const levels = stage + 1;              // 2 / 3 / 4 层
  const gap = Math.max(4, Math.round(h / (levels + 1)));
  for (let k = 0; k < levels; k++) {
    const y = GROUND - 4 - k * gap;
    const len = Math.min(11, 6 + k);
    const dir: 1 | -1 = k % 2 === 0 ? -1 : 1;         // 左右交替
    leaf(i, CX - 1 + (dir > 0 ? 1 : 0), y, dir, len);
    leaf(i, CX - 1 + (dir > 0 ? 0 : 1), y + 2, dir > 0 ? -1 : 1, Math.max(3, len - 4), 0.5); // 对侧小叶
  }
  if (stage >= 2) { leaf(i, CX, top + 4, -1, 3, 0.6); leaf(i, CX, top + 4, 1, 3, 0.6); } // 顶芽
  return i;
}

/** 实心椭圆 + 可选高光（成熟作物共用） */
function blob(i: Img, cx: number, cy: number, rx: number, ry: number, c: string, lit?: string) {
  i.ellipse(cx, cy, rx, ry, px(c));
  if (lit) { i.ellipse(cx - rx * 0.35, cy - ry * 0.4, rx * 0.42, ry * 0.35, px(lit)); }
}

/** 8 种成熟作物：各自的轮廓一眼能认出来，都在 32×40 之内 */
function mature(id: string): Img {
  const i = new Img(CW, CH);
  shadow(i, id === 'watermelon' || id === 'pumpkin' ? 13 : 10);
  switch (id) {
    case 'cabbage': { // 小白菜：一层层抱起来的绿叶，底部白色菜帮
      blob(i, CX, GROUND - 9, 12, 8, '#4d8534', '#689f42');
      blob(i, CX, GROUND - 11, 9, 7, '#63a23c', '#84c055');
      blob(i, CX, GROUND - 13, 5, 4, '#7cb84c', '#a2d06b');
      i.rect(CX - 1, GROUND - 5, 2, 4, px('#d9e3b4')); // 菜帮
      i.set(CX - 2, GROUND - 4, px('#b9c795')); i.set(CX + 1, GROUND - 4, px('#b9c795'));
      break;
    }
    case 'tomato': { // 番茄：矮丛上挂两个红果，顶上带萼片
      blob(i, CX, GROUND - 15, 12, 7, '#3f7029', '#528a37');
      for (const [fx, fy, r] of [[9, GROUND - 7, 4], [21, GROUND - 12, 5]] as const) {
        blob(i, fx, fy, r, r, '#c53a2e', '#e8695a');
        i.rect(fx - 2, fy - r, 4, 1, px('#3f7029')); // 萼片
        i.set(fx, fy - r - 1, px('#4a7f31'));
      }
      break;
    }
    case 'chili': { // 辣椒：丛里垂着 3 个细长红椒
      blob(i, CX, GROUND - 16, 12, 7, '#3f7029', '#528a37');
      for (const x of [CX - 6, CX, CX + 6]) {
        i.rect(x, GROUND - 14, 3, 2, px('#3f7029'));
        for (let k = 0; k < 9; k++) { const w = k > 5 ? 2 : 3; i.rect(x + (k > 5 ? 1 : 0), GROUND - 12 + k, w, 1, px(k > 6 ? '#8f2a22' : '#c53a2e')); }
      }
      break;
    }
    case 'watermelon': { // 西瓜：横卧的大椭圆 + 深色条纹
      blob(i, CX, GROUND - 9, 13, 9, '#2f6b34', '#3f8543');
      for (let x = 3; x < CW - 3; x += 5) {
        for (let y = 0; y < CH; y++) if (i.alpha(x, y) && i.get(x, y)[1] > 60) i.set(x, y, px('#79a848'));
      }
      i.rect(CX - 1, GROUND - 20, 3, 3, px('#5b4630')); // 瓜蒂
      break;
    }
    case 'pumpkin': { // 南瓜：橙色带竖棱，扁圆
      blob(i, CX, GROUND - 8, 13, 8, '#cf6f1c', '#e89438');
      for (const x of [CX - 7, CX - 2, CX + 3, CX + 7]) for (let y = 0; y < CH; y++) {
        const c = i.get(x, y); if (c[3] && c[0] > 150) i.set(x, y, px('#a85413'));
      }
      i.rect(CX - 1, GROUND - 18, 3, 4, px('#6b4a2a'));
      break;
    }
    case 'carrot': { // 胡萝卜：缨子 + 露出土面的橙色根
      for (const [dx, dir] of [[-3, -1], [0, 0], [3, 1]] as const) {
        for (let k = 0; k < 9; k++) i.set(CX + dx + Math.round(k * 0.5) * dir, GROUND - 10 - k, px(k > 6 ? C.leafLit : C.leaf));
        i.set(CX + dx, GROUND - 11, px(C.leafDark));
      }
      for (let k = 0; k < 9; k++) { const w = 12 - k; i.rect(CX - Math.floor(w / 2), GROUND - 9 + k, w, 1, px(k > 5 ? '#a85413' : '#d4711f')); }
      i.rect(CX - 6, GROUND - 9, 2, 3, px('#ec9a49'));
      break;
    }
    case 'wheat': { // 冬小麦：4 根麦秆 + 金黄麦穗
      for (const [x, h] of [[6, 22], [13, 27], [20, 25], [26, 20]] as const) {
        i.vline(x, GROUND - h, h, px('#b39a52'));
        for (let k = 0; k < 8; k++) {
          const y = GROUND - h + k;
          i.set(x - 1, y, px(k % 2 ? '#c9a34a' : '#a8853c'));
          i.set(x + 1, y, px(k % 2 ? '#d8b45c' : '#b08c3e'));
        }
        leaf(i, x, GROUND - 6, x < CX ? -1 : 1, 5, 0.4);
      }
      break;
    }
    case 'napa': { // 大白菜：竖长的浅绿菜球 + 深色叶脉
      blob(i, CX, GROUND - 11, 10, 11, '#a9c37f', '#c4d79a');
      for (const x of [CX - 6, CX - 2, CX + 2, CX + 6]) { i.vline(x, GROUND - 19, 14, px('#8aa568', 180)); }
      i.rect(CX - 3, GROUND - 4, 6, 4, px('#e6ecc8'));
      break;
    }
    default: {
      const icon = CROPS.find((c) => c.id === `crop_${id}`);
      i.ellipse(CX, GROUND - 6, 9, 7, px('#6b8f45')); // 兜底：一丛绿叶
      if (icon) i.rect(CX - 2, GROUND - 10, 4, 3, px('#8cbf55'));
    }
  }
  return i;
}

async function main() {
  mkdirSync(STATES, { recursive: true });
  const stateDefs: [string, () => Img][] = [
    ['state_grass', grass],
    ['state_tilled', () => tilled(0)],
    ['state_tilled_b', () => tilled(1)],
    ['state_tilled_c', () => tilled(2)],
    ['state_sprout0', () => sprout(0)],
    ['state_sprout1', () => sprout(1)],
    ['state_sprout2', () => sprout(2)],
    ['state_sprout3', () => sprout(3)],
    ...CROP_IDS.map((id) => [`state_mature_${id}`, () => mature(id)] as [string, () => Img]),
  ];
  await Promise.all(stateDefs.map(([key, make]) => savePng(make(), join(STATES, `${key}.png`))));
  console.log(`生成完成：${stateDefs.length} 个状态 tile（土壤 ${S}×${S}，作物 ${CW}×${CH}）`);
}

await main();
