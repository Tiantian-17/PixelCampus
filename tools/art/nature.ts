/**
 * 植物精灵生成：阔叶树、杨树、银杏、樱花、松柏、柳树、灌木、花丛。
 * 尺度约定（与 docs/map/SCALE.md 一致）：16px = 1 tile；成年阔叶树冠宽约 3 tile、总高约 3.5 tile，
 * 人物 16×32，所以人站在树旁大约到树干中段 —— 与星露谷比例一致。
 */
import { Img, Rng, hash2, vnoise, shade, mix, hex, type RGBA } from './px.ts';
import { PAL } from './palette.ts';

export interface Sprite {
  img: Img;
  /** 脚点（落地点）在图内的像素坐标，深度排序与碰撞都以它为准 */
  ax: number;
  ay: number;
  /** 阻挡脚印（相对脚点，像素）。无则不阻挡 */
  block?: { x: number; y: number; w: number; h: number };
}

interface Blob { cx: number; cy: number; r: number; ry?: number }

/** 季节特效（由 tools/world/seasons.ts 在生成每个季节的图集前设置）：holes = 落叶树冠的"镂空"比例（冬天枝头稀疏） */
export const SEASON_FX = { holes: 0 };
/** 红枫的配色（随季节变化，原地修改） */
export const MAPLE_RAMP: RGBA[] = ['#8a3a14', '#b8501c', '#d86a24', '#ec8a30', '#f8ae4a', '#fcd078'].map((s) => hex2(s));

const BAYER = [[0, 2], [3, 1]];

/** 把若干圆团合成一个带光影的树冠，ramp 由暗到亮 */
function paintCanopy(w: number, h: number, blobs: Blob[], ramp: RGBA[], seed: number, opts: { outline?: RGBA; light?: [number, number]; speckle?: number; holes?: number } = {}): Img {
  const img = new Img(w, h);
  const L = opts.light ?? [-0.55, -0.75];
  const ln = Math.hypot(L[0], L[1], 0.5);
  const lx = L[0] / ln, ly = L[1] / ln, lz = 0.5 / ln;
  const owner = new Int16Array(w * h).fill(-1);
  const lum = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let best = -1, bestZ = -1, bestL = 0;
    for (let i = 0; i < blobs.length; i++) {
      const b = blobs[i];
      const rx = b.r, ry = b.ry ?? b.r;
      const dx = (x + 0.5 - b.cx) / rx, dy = (y + 0.5 - b.cy) / ry;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const hz = Math.sqrt(1 - d2);
      const z = hz + i * 0.0001 + (b.cy / h) * 0.35; // 偏下(靠前)的团压在上面
      if (z > bestZ) { bestZ = z; best = i; bestL = Math.max(0, dx * lx + dy * ly + hz * lz); }
    }
    if (best >= 0) { owner[y * w + x] = best; lum[y * w + x] = bestL; }
  }
  // 冬天落叶树：成片镂空，只剩零星挂雪的枝叶团
  const holes = opts.holes ?? SEASON_FX.holes;
  if (holes > 0) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (owner[y * w + x] >= 0 && vnoise(x + seed * 3, y, 3, seed + 41) < holes) owner[y * w + x] = -1;
  const n = ramp.length - 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const o = owner[y * w + x];
    if (o < 0) continue;
    let v = lum[y * w + x];
    v += (vnoise(x + seed * 7, y, 5, seed) - 0.5) * 0.28 + (hash2(x, y, seed) - 0.5) * 0.1;
    // 团与团交界处压暗，形成"叶团"轮廓
    const up = y > 0 ? owner[(y - 1) * w + x] : -1;
    const lf = x > 0 ? owner[y * w + x - 1] : -1;
    let edge = 0;
    if ((up >= 0 && up !== o && blobs[up].cy < blobs[o].cy) || (lf >= 0 && lf !== o && blobs[lf].cy < blobs[o].cy)) edge = 1;
    let t = v * (n + 0.4) * 0.92;
    t += (BAYER[y & 1][x & 1] / 4 - 0.375) * 0.9; // 有序抖动
    let idx = Math.max(0, Math.min(n, Math.floor(t)));
    if (edge) idx = Math.max(0, idx - 2);
    img.set(x, y, ramp[idx]);
  }
  // 高光叶簇
  const sp = opts.speckle ?? 0.012;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (owner[y * w + x] < 0) continue;
    const r = hash2(x, y, seed + 99);
    if (r < sp && lum[y * w + x] > 0.45) { img.set(x, y, ramp[n]); img.set(x + 1, y, ramp[Math.max(0, n - 1)]); }
    else if (r > 1 - sp * 1.2 && lum[y * w + x] < 0.55) { img.set(x, y, ramp[0]); img.set(x, y + 1, ramp[0]); }
  }
  return img;
}

function trunk(w: number, h: number, flare = true): Img {
  const t = new Img(w, h);
  const [d0, d1, d2, d3] = PAL.trunk;
  for (let y = 0; y < h; y++) {
    const fl = flare && y > h - 4 ? Math.floor((y - (h - 4)) / 2) + 1 : 0;
    for (let x = -fl; x < w + fl; x++) {
      const nx = (x + fl) / (w + fl * 2);
      const c = nx < 0.28 ? d3 : nx < 0.6 ? d2 : nx < 0.85 ? d1 : d0;
      t.set(x + 2, y, c);
    }
  }
  return t.crop(0, 0, w + 4, h);
}

function groundShadow(img: Img, cx: number, cy: number, rx: number, ry: number) {
  const s = PAL.shadow;
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d <= 1 && img.alpha(x, y) === 0) img.set(x, y, [s[0], s[1], s[2], d > 0.55 ? 38 : s[3]]);
    }
}

/** 阔叶树（夏绿）。size: 0 小 / 1 中 / 2 大 */
export function oak(seed: number, size = 1, ramp: RGBA[] = PAL.leaf, outline: RGBA = PAL.leafOutline): Sprite {
  const rng = new Rng(seed * 131 + size);
  const W = [36, 46, 58][size], H = [44, 56, 70][size];
  const tw = [5, 7, 9][size], th = [10, 13, 16][size];
  const cw = W - 2, ch = Math.round(H * 0.68);
  const blobs: Blob[] = [];
  const n = [6, 8, 11][size];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const rr = rng.range(0.22, 0.34) * cw;
    const dist = (i === 0 ? 0 : rng.range(0.18, 0.3)) * cw;
    blobs.push({ cx: cw / 2 + Math.cos(a) * dist, cy: ch * 0.52 + Math.sin(a) * dist * 0.72, r: rr, ry: rr * 0.92 });
  }
  blobs.push({ cx: cw / 2, cy: ch * 0.5, r: cw * 0.34, ry: ch * 0.36 });
  const can = paintCanopy(cw, ch, blobs, ramp, seed, { speckle: 0.014 });
  const tr = trunk(tw, th);
  const img = new Img(W + 2, H + 4);
  const baseY = H - 2;
  const cx = Math.floor((W + 2) / 2);
  img.blit(tr, cx - Math.floor((tw + 4) / 2), baseY - th);
  img.blit(can, 1, baseY - th - Math.round(ch * 0.72));
  const out = img.outlined(outline, false);
  groundShadow(out, cx + 1, baseY, cw * 0.46, 4 + size);
  return { img: out, ax: cx + 1, ay: baseY + 1, block: { x: -tw / 2 - 1, y: -4, w: tw + 2, h: 5 } };
}

/** 杨树 / 水杉：窄高的列植树 */
export function poplar(seed: number, height = 1): Sprite {
  const rng = new Rng(seed * 17 + 3);
  const W = 22, H = [56, 68][height];
  const ch = H - 14;
  const blobs: Blob[] = [];
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    const cy = ch * (0.88 - t * 0.78);
    const r = (0.5 - Math.abs(t - 0.4) * 0.42) * 10 + 4 + rng.range(-0.6, 0.6);
    blobs.push({ cx: 10 + rng.range(-1.2, 1.2), cy, r, ry: r * 1.25 });
  }
  const can = paintCanopy(20, ch, blobs, PAL.leaf, seed, { speckle: 0.01 });
  const tr = trunk(3, 11, false);
  const img = new Img(W, H + 3);
  img.blit(tr, 9, H - 11);
  img.blit(can, 1, H - 11 - ch + 3);
  const out = img.outlined(PAL.leafOutline);
  groundShadow(out, 12, H, 8, 3);
  return { img: out, ax: 12, ay: H + 1, block: { x: -2, y: -3, w: 4, h: 4 } };
}

/** 银杏（秋黄） */
export function ginkgo(seed: number): Sprite {
  return oak(seed, 1, PAL.ginkgo, hex2('#6e4a12'));
}
/** 红枫/鸡爪槭（橙红）：图书馆广场秋色点缀 */
export function maple(seed: number): Sprite {
  return oak(seed, 1, MAPLE_RAMP, hex2('#5a2410'));
}
/** 樱花/海棠（粉） */
export function blossom(seed: number): Sprite {
  return oak(seed, 1, PAL.blossom, hex2('#7a2f52'));
}
function hex2(s: string): RGBA { const v = s.replace('#', ''); return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16), 255]; }

/** 松柏：分层锥形 */
export function pine(seed: number, big = false): Sprite {
  const rng = new Rng(seed * 37 + 5);
  const W = big ? 34 : 28, H = big ? 62 : 52;
  const ch = H - 10;
  const blobs: Blob[] = [];
  const layers = big ? 5 : 4;
  for (let i = 0; i < layers; i++) {
    const t = i / (layers - 1);
    const r = 5 + t * (W / 2 - 7) + rng.range(-0.5, 0.5);
    blobs.push({ cx: W / 2 - 1, cy: 5 + t * (ch - 12) + 4, r, ry: r * 0.82 });
  }
  const can = paintCanopy(W - 2, ch, blobs, PAL.pine, seed, { speckle: 0.006, holes: 0 }); // 常绿：冬天也不掉叶子
  const tr = trunk(3, 9, false);
  const img = new Img(W, H + 3);
  img.blit(tr, Math.floor(W / 2) - 3, H - 9);
  img.blit(can, 1, H - 9 - ch + 3);
  const out = img.outlined(hex2('#123425'));
  groundShadow(out, W / 2 + 1, H, W * 0.36, 3);
  return { img: out, ax: Math.floor(W / 2) + 1, ay: H + 1, block: { x: -2, y: -3, w: 4, h: 4 } };
}

/** 垂柳：圆冠 + 下垂的枝条 */
export function willow(seed: number): Sprite {
  const rng = new Rng(seed * 53 + 11);
  const W = 54, H = 62;
  const cw = 52, ch = 34;
  const blobs: Blob[] = [{ cx: 26, cy: 16, r: 18, ry: 14 }, { cx: 14, cy: 20, r: 10 }, { cx: 38, cy: 20, r: 10 }, { cx: 26, cy: 10, r: 11 }];
  const can = paintCanopy(cw, ch, blobs, PAL.willow, seed, { speckle: 0.01 });
  // 垂枝
  const strands = new Img(cw, 30);
  for (let x = 6; x < cw - 6; x += 2) {
    const len = 8 + Math.floor(rng.range(0, 12)) - Math.floor(Math.abs(x - 26) / 6);
    const topY = 14 + Math.floor(Math.abs(x - 26) / 5);
    for (let j = 0; j < len; j++) strands.set(x, topY + j, PAL.willow[1 + ((j + x) % 3 === 0 ? 1 : 0)]);
  }
  const tr = trunk(5, 18);
  const img = new Img(W, H + 3);
  img.blit(tr, 25, H - 18);
  img.blit(can, 1, 4);
  img.blit(strands, 1, 14);
  const out = img.outlined(PAL.leafOutline);
  groundShadow(out, 28, H, 18, 4);
  return { img: out, ax: 28, ay: H + 1, block: { x: -3, y: -4, w: 6, h: 5 } };
}

/**
 * 大树洞：北山林地的地标古树（树洞里能钻进人，站在洞口按 E 打开传送面板）。
 * 尺寸 120×132，树冠比普通阔叶树大一圈、树干粗到能开一个拱形大洞；洞里透出暖光，远处一眼就认出来。
 * 树冠颜色跟 PAL.leaf 走，所以四季图集里会自动换成对应的叶色。
 */
export const HOLLOW_TREE_W = 120, HOLLOW_TREE_H = 132;
export function hollowTree(): Sprite {
  const W = HOLLOW_TREE_W, H = HOLLOW_TREE_H;
  const baseY = H - 2, cx = Math.floor((W + 2) / 2);
  const trW = 52, trH = 72, bcx = trW / 2;
  const [t0, t1, t2, t3] = PAL.trunk;
  const tr = new Img(trW, trH);
  // ---- 树干：顶部半宽 8、贴地 15，最后几行板根往外张；光从左上来，左亮右暗
  for (let y = 0; y < trH; y++) {
    const t = y / (trH - 1);
    const half = 8 + t * 7 + (t > 0.88 ? (t - 0.88) * 150 : 0);
    for (let x = Math.floor(bcx - half); x <= Math.ceil(bcx + half); x++) {
      const nx = (x - bcx) / half;
      let c = nx < -0.45 ? t3 : nx < -0.05 ? t2 : nx < 0.5 ? t1 : t0;
      if (hash2(x, y, 91) < 0.16) c = shade(c, 0.88);        // 纵向树皮裂纹
      else if (hash2(x, y, 92) < 0.05) c = shade(c, 1.12);
      if (t > 0.55 && hash2(x, y, 95) < 0.07) c = PAL.leaf[1]; // 靠地的青苔
      tr.set(x, y, c);
    }
  }
  // 一个老树结
  tr.ellipse(bcx - 11, 22, 3.5, 6, t0); tr.ellipse(bcx - 11, 22.5, 2, 4, t2);
  // ---- 大树洞：拱形，越靠底越宽、越亮（像里面透出暖光）；洞口一圈浅色木头包边
  const hy = trH - 1, hh = 30, hw = 11;
  for (let dy = 0; dy <= hh; dy++) {
    const y = hy - dy, k = dy / hh;
    const half = Math.round(hw * Math.sqrt(Math.max(0, 1 - k * k * 0.84)));
    for (let x = Math.round(bcx - half); x <= Math.round(bcx + half); x++) {
      const d = Math.abs(x - bcx) / Math.max(1, half), g = 1 - k;
      const c = d > 0.8 ? shade(t1, 1.18) : mix(hex('#0d0703'), hex('#ffc866'), 0.05 + g * g * 0.55);
      tr.set(x, y, c);
    }
  }
  // 洞里贴地的一小团亮光（传送点的"活气"）
  for (const [x, y, r] of [[bcx, hy - 2, 3.4], [bcx, hy - 5, 2.2]] as [number, number, number][]) {
    for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) if ((i / r) ** 2 + (j / r) ** 2 <= 1) tr.set(x + i, y + j, mix(hex('#ffc866'), hex('#fff2c8'), 0.55 - Math.hypot(i, j) / (r * 2.2)));
  }
  const trO = tr.outlined(hex('#2e1c10'));
  // ---- 树冠：一圈大小不一的叶团拼成一个大圆冠，底边比普通阔叶树更低，把树干上半截藏起来
  const cw = W - 8, ch = 84;
  const blobs: Blob[] = [];
  for (let i = 0; i < 18; i++) {
    const a = hash2(i, 1, 31) * Math.PI * 2;
    const rad = i === 0 ? 0 : Math.sqrt(hash2(i, 2, 33)) * 0.33 * cw;
    const rr = cw * (0.17 + hash2(i, 4, 35) * 0.09);
    blobs.push({ cx: cw / 2 + Math.cos(a) * rad, cy: ch * 0.54 + Math.sin(a) * rad * 0.62, r: rr, ry: rr * (0.85 + hash2(i, 6, 37) * 0.2) });
  }
  const can = paintCanopy(cw, ch, blobs, PAL.leaf, 23, { speckle: 0.012 });
  const canO = can.outlined(PAL.leafOutline);
  const img = new Img(W + 2, H + 4);
  img.blit(trO, cx - Math.floor(trO.w / 2), baseY - trH);
  img.blit(canO, cx - Math.floor(canO.w / 2), baseY - trH - Math.round(ch * 0.58));
  const out = img.outlined(PAL.leafOutline, false);
  groundShadow(out, cx, baseY, cw * 0.46, 5);
  return { img: out, ax: cx, ay: baseY + 1, block: { x: -13, y: -10, w: 26, h: 11 } };
}

/** 灌木丛 */
export function bush(seed: number, ramp: RGBA[] = PAL.leaf): Sprite {
  const rng = new Rng(seed * 7 + 1);
  const W = 22, H = 16;
  const blobs: Blob[] = [{ cx: 11, cy: 8, r: 7.5, ry: 6.5 }, { cx: 6, cy: 10, r: 5 }, { cx: 16, cy: 10, r: 5 }];
  if (rng.chance(0.6)) blobs.push({ cx: 11 + rng.range(-3, 3), cy: 5, r: 4.5 });
  const can = paintCanopy(W, H - 2, blobs, ramp, seed, { speckle: 0.02 });
  const img = new Img(W, H + 1);
  img.blit(can, 0, 0);
  const out = img.outlined(PAL.leafOutline);
  groundShadow(out, 12, H - 1, 9, 2.5);
  return { img: out, ax: 12, ay: H, block: { x: -8, y: -5, w: 16, h: 5 } };
}

/** 花丛（草地装饰，不阻挡） */
export function flowers(seed: number, kind: 'pink' | 'yellow' | 'white' | 'mix'): Sprite {
  const rng = new Rng(seed * 19 + 2);
  const img = new Img(16, 12);
  const cols: RGBA[] = kind === 'pink' ? [hex2('#ee93b6'), hex2('#f8b9d0'), hex2('#df719d')]
    : kind === 'yellow' ? [hex2('#f6d550'), hex2('#fdea8a'), hex2('#e8b92c')]
      : kind === 'white' ? [hex2('#f7f8fa'), hex2('#e9ebf0'), hex2('#f6d550')]
        : [hex2('#ee93b6'), hex2('#f6d550'), hex2('#f7f8fa'), hex2('#8fb4f0')];
  const n = 5 + rng.int(4);
  for (let i = 0; i < n; i++) {
    const x = 1 + rng.int(14), y = 2 + rng.int(8);
    img.set(x, y + 1, PAL.leaf[2]);
    img.set(x, y, rng.pick(cols));
    if (rng.chance(0.4)) img.set(x - 1, y + 1, PAL.leaf[1]);
  }
  return { img, ax: 8, ay: 11 };
}
