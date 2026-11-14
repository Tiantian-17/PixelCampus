/**
 * 农场室内底图：直接用手绘原图 data/art/farm-scene/farm-source.png（1536×1024）缩到 480×320（30×20 格）。
 * 原图右下角带 AI 生成水印，先拿左边同一片深色树丛盖掉，再缩图——比程序化画的木屋/树好看得多。
 *
 * 耕地：原图上是 6 块带犁沟的田。运行时会用状态 tile 盖出 16 块地，所以底图这里要变成普通草地。
 * 不能涂纯色矩形（会留下明显的绿色块、还切断小路），也不能贴别的草地补丁（会带进树/石头/小路碎片），
 * 这里改成：从周围一圈真实草地采样调色板，按 1px 抖动 + 短草叶笔触 + 零星小花重画，边界做锯齿融进原图。
 */
import sharp from 'sharp';
import { join } from 'node:path';
import { ROOT } from '../paths.ts';
import { Img, Rng, hash2, hex, type RGBA } from './px.ts';
import { FARM_PLOTS } from '../../src/shared/farming.ts';

/** 要盖掉的旧田范围（480×320）：原图 6 块带犁沟的田正好从 y=88 开始，
 *  所以只重画 88..248 这块，上面 72..88 的真草地/土路原样保留，不会多出一条补丁边 */
const FIELD = { x: 184, y: 88, w: 152, h: 160 };

type RGB = [number, number, number];

/** 把耕地区域重画成草地：调色板取自紧邻的四周，保证和手绘草地没有色差 */
function paintLawn(img: Img) {
  const ring: { lum: number; c: RGB }[] = [];
  for (let y = FIELD.y - 14; y < FIELD.y + FIELD.h + 14; y++) {
    for (let x = FIELD.x - 14; x < FIELD.x + FIELD.w + 14; x++) {
      if (x >= FIELD.x && x < FIELD.x + FIELD.w && y >= FIELD.y && y < FIELD.y + FIELD.h) continue; // 只取外圈
      if (x < 0 || y < 0 || x >= img.w || y >= img.h) continue;
      const c = img.get(x, y);
      if (c[3] === 0 || c[1] <= c[0] + 6 || c[1] <= c[2] + 16 || c[1] <= 90) continue; // 只要草绿
      ring.push({ lum: c[0] * 0.3 + c[1] * 0.6 + c[2] * 0.1, c: [c[0], c[1], c[2]] });
    }
  }
  ring.sort((a, b) => a.lum - b.lum);
  const pick = (q: number): RGBA => {
    const c = ring[Math.min(ring.length - 1, Math.floor(q * ring.length))]?.c ?? [108, 160, 42];
    return [c[0], c[1], c[2], 255]; // 必须带 alpha，否则 Img.set 会按半透明混合出一片白
  };
  const pal = [pick(0.1), pick(0.42), pick(0.72), pick(0.94)]; // 暗 / 中 / 亮 / 高光

  const edgeKeep = (x: number, y: number) => {
    const d = Math.min(x, y, FIELD.w - 1 - x, FIELD.h - 1 - y);
    if (d >= 2 || hash2(x, y, 9) >= 0.45) return false;
    const c = img.get(FIELD.x + x, FIELD.y + y);
    // 只保留本来就长草的地方；原图这里是旧田的土，保留会留下褐色麻点
    return c[1] > c[0] + 6 && c[1] > c[2] + 16 && c[1] > 90;
  };

  // 底色：1px 抖动 + 2×2 小块，出硬边像素颗粒（用平滑噪声会糊成迷彩）
  for (let y = 0; y < FIELD.h; y++) for (let x = 0; x < FIELD.w; x++) {
    if (edgeKeep(x, y)) continue;
    const h = hash2(x, y, 5) * 0.55 + hash2(x >> 1, y >> 1, 6) * 0.45;
    img.set(FIELD.x + x, FIELD.y + y, pal[h < 0.3 ? 0 : h < 0.68 ? 1 : h < 0.9 ? 2 : 3]);
  }
  const rng = new Rng(20261116);
  // 短草叶：3~7px、略微上翘，和原图的笔触呼应
  for (let k = 0; k < 460; k++) {
    const bx = FIELD.x + 2 + rng.int(FIELD.w - 8), by = FIELD.y + 2 + rng.int(FIELD.h - 8);
    const len = 3 + rng.int(5), dir = rng.chance(0.5) ? 1 : -1;
    const col = rng.chance(0.35) ? pal[3] : pal[2];
    for (let j = 0; j < len; j++) img.set(bx + dir * j, by - Math.floor(j / 3), col);
  }
  // 深色碎叶：压住抖动、做出层次
  for (let k = 0; k < 320; k++) {
    const bx = FIELD.x + 1 + rng.int(FIELD.w - 4), by = FIELD.y + 1 + rng.int(FIELD.h - 4);
    img.set(bx, by, pal[0]); img.set(bx + 1, by, pal[0]);
  }
  // 零星小花（原图草地上也有白/黄点）
  for (let k = 0; k < 16; k++) {
    const bx = FIELD.x + 4 + rng.int(FIELD.w - 10), by = FIELD.y + 4 + rng.int(FIELD.h - 10);
    const col = hex(rng.chance(0.5) ? '#f2f0d8' : '#f0d26a');
    img.set(bx, by, col); img.set(bx + 1, by, col); img.set(bx, by - 1, col);
    img.set(bx, by + 1, pal[0]);
  }
}

/**
 * 田埂：4×4 块地之间 8px 的空隙 + 田块上下沿各一道，画成压实的土埂（上亮下暗、带缺口和草叶）。
 * 颜色取自原图的土路，和手绘底图是一套笔触；未翻的地块本身几乎是透明的，靠这道埂才看得出田的形状。
 */
function paintRidges(img: Img) {
  const T = 16;
  const xs = [...new Set(FARM_PLOTS.map((p) => p.x))].sort((a, b) => a - b).map((v) => Math.round(v * T));
  const ys = [...new Set(FARM_PLOTS.map((p) => p.y))].sort((a, b) => a - b).map((v) => Math.round(v * T));
  const pw = Math.round((FARM_PLOTS[0]?.w ?? 2) * T), ph = Math.round((FARM_PLOTS[0]?.h ?? 2) * T);
  const left = xs[0], right = xs[xs.length - 1] + pw, top = ys[0], bottom = ys[ys.length - 1] + ph;
  const lit = hex('#cfa257'), mid = hex('#ab8443'), dark = hex('#8a6a33'), shadow = hex('#6b4f24', 170);
  const tuftA = hex('#7fb03c'), tuftB = hex('#93c44a');

  // 竖埂：2~4px 宽的抖动土带（不用单像素直线，免得像画了条亮线），右侧压 1px 影子，随机断开
  const vRidge = (gx: number, seed: number) => {
    for (let y = top + 3; y < bottom - 3; y++) {
      if (hash2(gx, y, seed) < 0.06) continue;
      const w = hash2(gx, y, seed + 1) < 0.22 ? 2 : hash2(gx, y, seed + 1) > 0.84 ? 4 : 3;
      const x0 = gx - Math.floor(w / 2);
      for (let k = 0; k < w; k++) {
        const h = hash2(x0 + k, y, seed + 5);
        img.set(x0 + k, y, h < 0.3 ? dark : h < 0.75 ? mid : lit);
      }
      if (hash2(gx, y, seed + 2) < 0.55) img.set(x0 + w, y, shadow);
    }
  };
  // 横埂：同一套抖动土带，影子压在下沿
  const hRidge = (gy: number, from: number, to: number, seed: number) => {
    for (let x = from + 3; x < to - 3; x++) {
      if (hash2(x, gy, seed) < 0.06) continue;
      const w = hash2(x, gy, seed + 1) < 0.22 ? 2 : hash2(x, gy, seed + 1) > 0.84 ? 4 : 3;
      const y0 = gy - Math.floor(w / 2);
      for (let k = 0; k < w; k++) {
        const h = hash2(x, y0 + k, seed + 5);
        img.set(x, y0 + k, h < 0.3 ? dark : h < 0.75 ? mid : lit);
      }
      if (hash2(x, gy, seed + 2) < 0.55) img.set(x, y0 + w, shadow);
    }
  };
  const vcs = xs.slice(0, -1).map((x, k) => Math.round((x + pw + xs[k + 1]) / 2));
  const hcs = ys.slice(0, -1).map((y, k) => Math.round((y + ph + ys[k + 1]) / 2));
  vcs.forEach((gx, k) => vRidge(gx, 100 + k * 7));
  hcs.forEach((gy, k) => hRidge(gy, left, right, 200 + k * 7));
  hRidge(top - 3, left, right, 300); // 田块上沿
  hRidge(bottom + 3, left, right, 320); // 田块下沿

  // 埂上冒出来的草：压掉土埂的「直线感」，顺便和周围的草接上
  const rng = new Rng(20261123);
  for (let k = 0; k < 110; k++) {
    const onV = rng.chance(0.55);
    const x = onV ? vcs[rng.int(vcs.length)] + (rng.chance(0.5) ? -2 : 2) : left + 4 + rng.int(right - left - 8);
    const y = onV ? top + 4 + rng.int(bottom - top - 8) : hcs[rng.int(hcs.length)] + (rng.chance(0.5) ? -2 : 2);
    const len = 1 + rng.int(3), dir = rng.chance(0.5) ? 1 : -1;
    const col = rng.chance(0.55) ? tuftA : tuftB;
    for (let j = 0; j < len; j++) img.set(x + dir * j, y - j, col);
  }
}

export async function buildFarmBg(): Promise<Img> {
  const src = join(ROOT, 'data', 'art', 'farm-scene', 'farm-source.png');
  const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const buf = new Uint8Array(data); // 复制一份再改，别动 sharp 的 buffer
  const at = (x: number, y: number) => (y * W + x) * 4;
  // 抹掉右下角水印：把左边一块同样质地的树丛整块搬过来
  const pw = Math.min(240, Math.floor(W * 0.16)), ph = Math.min(120, Math.floor(H * 0.12));
  const sx = W - pw * 2 - 6, sy = H - ph, dx = W - pw - 6;
  for (let y = 0; y < ph; y++) for (let x = 0; x < pw; x++) {
    const a = at(sx + x, sy + y), b = at(dx + x, sy + y);
    buf[b] = buf[a]; buf[b + 1] = buf[a + 1]; buf[b + 2] = buf[a + 2]; buf[b + 3] = buf[a + 3];
  }

  const out = await sharp(Buffer.from(buf.buffer), { raw: { width: W, height: H, channels: 4 } })
    .resize(480, 320, { kernel: 'nearest' })
    .raw().toBuffer({ resolveWithObject: true });
  const img = new Img(out.info.width, out.info.height);
  img.data.set(out.data);
  paintLawn(img);
  paintRidges(img);
  return img;
}
