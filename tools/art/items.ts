/**
 * 背包物品图标：每个 16×16（描边后 18×18），文件名 item_<id> 与 src/shared/items.ts 的物品 id 一一对应。
 * 新增物品：在 ICONS 里加同名的绘制函数。
 */
import { Img, hex } from './px.ts';
import { DECOR } from '../../src/shared/decor.ts';
import { FURNITURE } from './furniture.ts';
import { OFFICE_FURNITURE } from './furniture-office.ts';
import { DECOR_FURNITURE } from './furniture-decor.ts';
import { DORM_FURNITURE } from './furniture-dorm.ts';

const O = hex('#2a1f2e');

function catFood(): Img {
  const i = new Img(16, 16);
  const paper = hex('#d9b27a'), paperD = hex('#b08650'), paperL = hex('#ecd0a0'), pink = hex('#e8708a'), cream = hex('#fbf1da');
  i.rect(3, 3, 10, 12, paper); i.vline(3, 3, 12, paperL); i.vline(12, 3, 12, paperD); i.hline(3, 14, 10, paperD);
  i.rect(3, 1, 10, 3, paperL); for (let x = 3; x < 13; x += 2) i.set(x, 1, paper); // 袋口折边
  i.hline(3, 3, 10, paperD);
  i.rect(5, 6, 6, 5, cream); // 标签
  // 小鱼：身体 + 尾巴 + 眼睛
  i.rect(6, 8, 3, 2, pink); i.set(9, 7, pink); i.set(9, 10, pink); i.set(10, 8, pink); i.set(10, 9, pink); i.set(6, 8, cream); i.set(7, 8, hex('#2a1f2e'));
  i.set(5, 12, pink); i.set(7, 12, pink); i.set(9, 12, pink); // 猫爪印的小点
  return i;
}

function monBall(): Img {
  const i = new Img(16, 16);
  const red = hex('#e8584a'), redD = hex('#b03a30'), redL = hex('#f89080'), cream = hex('#fbf1da'), gold = hex('#f2c230');
  i.rect(3, 4, 10, 10, red); i.vline(3, 4, 10, redL); i.vline(12, 4, 10, redD); i.hline(3, 13, 10, redD);
  i.rect(3, 2, 10, 2, redL); for (let x = 3; x < 13; x += 2) i.set(x, 2, red); // 袋口的褶
  i.rect(5, 6, 6, 5, cream); // 标签上画一颗星
  i.set(8, 6, gold); i.hline(7, 8, 3, gold); i.set(8, 9, gold); i.set(7, 10, gold); i.set(9, 10, gold);
  return i;
}

function catTreat(): Img {
  const i = new Img(16, 16);
  const body = hex('#f08a4a'), bodyL = hex('#f9b070'), bodyD = hex('#c8622e'), cream = hex('#fbf1da'), teal = hex('#4a9aa8');
  // 斜放的小条袋：从左下到右上
  for (let k = 0; k < 11; k++) { const x = 2 + k, y = 12 - k; i.rect(x, y, 3, 3, body); i.set(x, y, bodyL); i.set(x + 2, y + 2, bodyD); }
  i.set(12, 2, cream); i.set(13, 2, cream); i.set(12, 1, cream); i.set(13, 3, bodyL); // 撕开的口
  i.rect(6, 8, 2, 2, cream); i.set(7, 9, teal); i.rect(8, 6, 2, 2, cream); i.set(9, 7, teal); // 贴纸
  i.set(1, 13, bodyD); i.set(2, 14, bodyD);
  return i;
}

function ginkgoLeaf(): Img {
  const i = new Img(16, 16);
  const g1 = hex('#fdea8a'), g2 = hex('#f6d550'), g3 = hex('#e8b92c'), g4 = hex('#cc9a1f');
  // 扇形叶片：圆心在叶柄上方，半径 ~7
  for (let y = 1; y < 13; y++) for (let x = 0; x < 16; x++) {
    const dx = x + 0.5 - 8, dy = y + 0.5 - 13, r = Math.hypot(dx, dy), ang = Math.atan2(-dy, dx);
    if (r <= 11.5 && r >= 2 && ang > 0.45 && ang < Math.PI - 0.45) {
      const ray = Math.round(((ang - 0.45) / (Math.PI - 0.9)) * 7);
      i.set(x, y, r > 9.8 ? g2 : ray % 2 ? g3 : g2);
      if (r > 11) i.set(x, y, g1);
    }
  }
  i.set(8, 2, g4); // 叶缘中央的小缺口
  i.vline(8, 11, 4, hex('#8a6a20')); i.set(8, 14, hex('#6a4a18'));
  for (let k = 0; k < 5; k++) i.set(8 + Math.round(Math.cos(0.9 + k * 0.3) * (3 + k)), 11 - Math.round(Math.sin(0.9 + k * 0.3) * (3 + k)), g4);
  return i;
}

function catBadge(): Img {
  const i = new Img(16, 16);
  const gold = hex('#f2c030'), goldL = hex('#ffe680'), goldD = hex('#b8861a'), red = hex('#c4503c'), redD = hex('#8a2f26'), paw = hex('#5a3a1c');
  // 丝带
  i.rect(4, 9, 3, 6, red); i.rect(9, 9, 3, 6, red); i.vline(4, 9, 6, redD); i.vline(11, 9, 6, redD); i.set(5, 14, redD); i.set(10, 14, redD);
  // 圆章
  i.ellipse(8, 6.5, 6, 6, goldD); i.ellipse(8, 6.5, 5, 5, gold); i.ellipse(7, 5, 3, 2.4, goldL);
  i.ellipse(8, 6.5, 3.6, 3.6, gold);
  // 猫爪印：一个掌垫 + 四个趾
  i.rect(6, 7, 4, 3, paw); i.set(5, 8, paw); i.set(10, 8, paw);
  i.set(5, 5, paw); i.set(7, 4, paw); i.set(9, 4, paw); i.set(11, 5, paw);
  return i;
}

/** 鱼：身体椭圆 + 尾巴 + 背鳍 + 眼睛；pattern 给不同种类加花纹（斑点/条纹/腮红） */
type FishPattern = 'none' | 'stripe' | 'dots' | 'koi' | 'whisker' | 'long' | 'flat' | 'fat' | 'big' | 'gold' | 'ice' | 'scale';
function fish(body: string, belly: string, fin: string, pattern: FishPattern = 'none', sc = 1): () => Img {
  return () => {
    const i = new Img(16, 16);
    const b = hex(body), bl = hex(belly), f = hex(fin), eye = hex('#2a1f2e');
    const long = pattern === 'long' || pattern === 'ice' || pattern === 'scale', cy = 8, ry = (long ? 2.6 : pattern === 'flat' ? 4.6 : pattern === 'fat' ? 4.4 : 3.6) * sc, rx = (long ? 6.6 : pattern === 'fat' ? 5.2 : 5.6) * (sc < 1 ? sc + 0.2 : 1);
    i.ellipse(7, cy, rx, ry, b);
    i.ellipse(7, cy + 1.2, rx - 0.8, ry * 0.5, bl);
    // 尾巴
    i.set(12, cy - 3, f); i.set(13, cy - 4, f); i.set(12, cy - 2, f); i.set(12, cy, f); i.set(13, cy - 1, f); i.set(13, cy + 1, f); i.set(12, cy + 1, f); i.set(12, cy + 2, f); i.set(13, cy + 4, f); i.set(12, cy + 3, f); i.set(13, cy - 2, f); i.set(13, cy + 2, f);
    // 背鳍/腹鳍
    i.set(6, cy - Math.round(ry) - 1, f); i.set(7, cy - Math.round(ry) - 1, f); i.set(8, cy - Math.round(ry) - 1, f); i.set(7, cy - Math.round(ry) - 2, f);
    i.set(7, cy + Math.round(ry) + 1, f); i.set(8, cy + Math.round(ry) + 1, f);
    if (pattern === 'stripe') for (const x of [5, 7, 9]) i.vline(x, cy - 2, 4, f);
    if (pattern === 'dots') for (const [x, y] of [[5, cy - 1], [7, cy - 2], [8, cy], [6, cy + 1], [9, cy - 1]]) i.set(x, y, f);
    if (pattern === 'koi') { i.rect(4, cy - 3, 3, 2, hex('#e84a3a')); i.rect(8, cy - 1, 3, 3, hex('#e84a3a')); i.rect(6, cy + 1, 2, 2, hex('#2a2a3a')); }
    if (pattern === 'big') { i.ellipse(4, cy, 3.4, ry + 0.8, b); i.ellipse(4, cy + 1.5, 2.8, ry * 0.5, bl); i.set(2, cy + 3, f); }
    if (pattern === 'gold') for (const [x, y] of [[5, cy - 2], [8, cy - 1], [10, cy + 1], [6, cy + 1], [9, cy - 3]]) i.set(x, y, hex('#fffbe0'));
    if (pattern === 'ice') for (const [x, y] of [[5, cy - 1], [8, cy], [10, cy - 1], [7, cy + 1], [4, cy + 1]]) i.set(x, y, hex('#ffffff'));
    if (pattern === 'scale') for (let x = 4; x < 11; x++) for (let y = cy - 2; y <= cy + 1; y++) if ((x + y) % 2 === 0) i.set(x, y, f);
    if (pattern === 'whisker') { i.set(1, cy, f); i.set(0, cy - 1, f); i.set(1, cy + 2, f); i.set(0, cy + 3, f); }
    i.set(3, cy - 1, hex('#ffffff')); i.set(3, cy, eye); // 眼睛
    i.set(1, cy + 1, bl); // 嘴
    return i;
  };
}


/** 用字符画出一张 16×16 的图：'.' 透明；legend 把字符映射到颜色 */
function art(rows: string[], legend: Record<string, string>): () => Img {
  return () => {
    const i = new Img(16, 16);
    rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch !== '.' && legend[ch]) i.set(x, y, hex(legend[ch])); }));
    return i;
  };
}
/** 蛇形的长条（黄鳝、泥鳅、神龙）：沿正弦曲线画 thick 格粗的身体，左端是头 */
function serpent(body: string, belly: string, opt: { from: number; to: number; thick: number; amp: number; period?: number; head?: string; whisk?: boolean; horn?: boolean; spine?: string }): () => Img {
  return () => {
    const i = new Img(16, 16), b = hex(body), bl = hex(belly);
    for (let x = opt.from; x <= opt.to; x++) {
      const cy = 8 + Math.round(opt.amp * Math.sin((x - opt.from) / (opt.period ?? 2.4)));
      const th = x === opt.to ? Math.max(1, opt.thick - 1) : opt.thick;
      for (let k = 0; k < th; k++) i.set(x, cy + k - Math.floor(th / 2), k === th - 1 ? bl : b);
      if (opt.spine && x % 2 === 0) i.set(x, cy - Math.floor(th / 2) - 1, hex(opt.spine));
    }
    const hy = 8 + Math.round(opt.amp * Math.sin(0));
    i.ellipse(opt.from + 1, hy, 1.6, opt.thick / 2 + 0.6, hex(opt.head ?? body));
    i.set(opt.from + 1, hy - 1, hex('#ffffff')); i.set(opt.from + 2, hy - 1, hex('#2a1f2e'));
    if (opt.whisk) { i.set(opt.from - 1, hy + 1, hex('#e8e0c8')); i.set(opt.from - 2, hy + 2, hex('#e8e0c8')); i.set(opt.from - 1, hy - 2, hex('#e8e0c8')); }
    if (opt.horn) { i.set(opt.from + 1, hy - 3, hex('#f4d070')); i.set(opt.from + 2, hy - 4, hex('#f4d070')); i.set(opt.from + 3, hy - 3, hex('#f4d070')); }
    return i;
  };
}
const SHRIMP = art([
  '................',
  '......bbbbb.....',
  '....bbbllbbbb...',
  '.a..bbbbbbbbbbd.',
  '..a.bdbdbdbbbbbd',
  '..aebbbbbbbbbbd.',
  '...bbbbbbbbbd...',
  '....f.bbbbd.....',
  '....f.f.bd.rr...',
  '.....f.f..rRRr..',
  '..........rrrr..',
  '................', '................', '................', '................', '................',
], { b: '#f0b8a0', d: '#c47a64', e: '#2a1f2e', a: '#b89080', l: '#fff0e0', f: '#c89a88', r: '#e0907a', R: '#f4b8a0' });
const CRAYFISH = art([
  '................',
  '..cc........cc..',
  '.cCCc......cCCc.',
  '.cCc........cCc.',
  '..c..a....a..c..',
  '..cc.aeeea.cc...',
  '...cc.rrrr.cc...',
  '....c.rRrrrr....',
  '......rrrrrrr.rr',
  '.....lrdrdrdrrrr',
  '......rrrrrrr.rr',
  '.....l.l.l.l....',
  '................', '................', '................', '................',
], { c: '#b83a26', C: '#e0583c', r: '#c4442e', R: '#e8664a', d: '#8a2a1c', e: '#2a1f2e', a: '#d6603c', l: '#8a2a1c' });
const TURTLE = art([
  '................',
  '................',
  '......gggg......',
  '....ggGgGggg....',
  '...gGggGgGggg...',
  '...gggGgGgGgg.hh',
  '.t.gGgggGggg.hhh',
  '..tgggGgGgggghhe',
  '...ggGgGgGggg.hh',
  '....gggggggg....',
  '...ll.....ll....',
  '..lll.....lll...',
  '................', '................', '................', '................',
], { g: '#5a7a42', G: '#3e5a2e', h: '#8aa064', e: '#2a1f2e', t: '#8aa064', l: '#8aa064' });
const SALAMANDER = art([
  '................',
  '................',
  '..ll.....ll.....',
  '.lmmm...mmml....',
  '..mmmmmmmmmm....',
  '.hhhmsmmsmmmmt..',
  'ehhhmmmsmmmmmmtt',
  'hhhhmmmmmmmmmtt.',
  '.hhhmsmmsmmmt...',
  '..mmmmmmmmm.....',
  '.lmmm...mmml....',
  '..ll.....ll.....',
  '................', '................', '................', '................',
], { m: '#8a7a5e', s: '#5a4a38', h: '#a09070', e: '#2a1f2e', t: '#7a6a50', l: '#7a6a50' });
const CAN = art([
  '................', '................',
  '....cccccccc....',
  '...cCCCCCCCCc...',
  '...cddddddddc...',
  '...cDDDDDDDDc...',
  '...cDrrrrrrDc...',
  '...cDrRRRRrDc...',
  '...cDrrrrrrDc...',
  '...cDDDDDDDDc...',
  '...cdddddddDc...',
  '...cDDDDDDDDc...',
  '...cddddddddc...',
  '....cccccccc....',
  '................', '................',
], { c: '#6a727a', C: '#d8e0e8', d: '#98a4ae', D: '#b8c4ce', r: '#c4402e', R: '#e8e0d0' });
const BOTTLE = art([
  '................', '.......cc.......',
  '......cCCc......',
  '.......cc.......',
  '.....bbBBbb.....',
  '....bBBBBBBb....',
  '....bBwwwwBb....',
  '....bBBBBBBb....',
  '....bBBBBBBb....',
  '....bBwwwwBb....',
  '....bBBBBBBb....',
  '....bBBBBBBb....',
  '....bbbbbbbb....',
  '................', '................', '................',
], { c: '#e8e0d0', C: '#f4ecdc', b: '#4a8ab8', B: '#8cc4e8', w: '#e8f4fa' });

// ---- 翻垃圾桶翻出来的东西
const PAPER = art([
  '................', '................',
  '.....wwwww......',
  '...wwWWWWWww....',
  '..wWWWgWWWWWw...',
  '..wWWgWWWWgWw...',
  '.wWWWWWWgWWWWw..',
  '.wWgWWWWWWWWWw..',
  '.wWWWWgWWWgWWw..',
  '..wWWWWWWWWWw...',
  '..wwWgWWgWWww...',
  '...wwwWWWwww....',
  '.....wwwww......',
  '................', '................', '................',
], { w: '#b8b0a0', W: '#f4efe4', g: '#c8c0b0' });
const CUP = art([
  '.........s......', '.........s......', '.........s......',
  '....lllllsll....',
  '...lLLLLLsLLl...',
  '....lllllllll...',
  '....cCCCCCCc....',
  '....cCCCCCCc....',
  '....cmmmmmmc....',
  '....cmmmmmmc....',
  '.....cmmmmc.....',
  '.....cmpmpc.....',
  '.....cpmpmc.....',
  '.....cccccc.....',
  '................', '................',
], { s: '#e0508a', l: '#a8a8b8', L: '#f4f4fa', c: '#c8b088', C: '#fff4e0', m: '#c89a6a', p: '#3a2418' });
const WRAPPER = art([
  '................',
  '...r.r.r.r.r....',
  '..rRRRRRRRRRr...',
  '..rRyyyyyyyRr...',
  '..rRyYYYYyyRr...',
  '..rRyyyyyyyRr...',
  '..rRRRRRRRRRr...',
  '..rRRRrRRRRRr...',
  '..rRRRRRRrRRr...',
  '...rRRRRRRRr....',
  '..r.r.r.r.r.r...',
  '................', '................', '................', '................', '................',
], { r: '#a82a2a', R: '#e04a3a', y: '#f4d450', Y: '#fff0a0' });
const PEEL = art([
  '................', '................',
  '.....y..........',
  '....yYy.........',
  '....yYYy...yy...',
  '...yYYYYy.yYYy..',
  '...yYbYYYyYYYy..',
  '..yYYYYYYYYYb...',
  '..yYbYYYYYYYy...',
  '...yYYYYYYYy....',
  '....yyyyyyy.....',
  '................', '................', '................', '................', '................',
], { y: '#c8a420', Y: '#f4d838', b: '#8a5a1a' });
const USB = art([
  '................',
  '....mmmmmmmm....',
  '....mMMMMMMm....',
  '....mMdMMdMm....',
  '....mMMMMMMm....',
  '....bbbbbbbb....',
  '...bBBBBBBBBb...',
  '...bBwwwwwwBb...',
  '...bBwtttttBb...',
  '...bBwwwwwwBb...',
  '...bBBBBBBBBb...',
  '...bBBBBBBBBb...',
  '....bbbbbbbb....',
  '................', '................', '................',
], { m: '#8a929a', M: '#d0d8e0', d: '#3a4048', b: '#1e4a8a', B: '#3a7ad0', w: '#f4f4f0', t: '#7a8a9a' });
function chopsticks(): Img {
  const i = new Img(16, 16), wood = hex('#e6c887'), woodD = hex('#b8924e'), sleeve = hex('#c84a3a'), sleeveL = hex('#e8806a');
  for (let k = 0; k < 13; k++) { i.set(1 + k, 13 - k, wood); i.set(1 + k, 14 - k, woodD); }
  for (let k = 0; k < 12; k++) { i.set(3 + k, 14 - k, wood); i.set(3 + k, 15 - k, woodD); }
  for (let k = 5; k < 8; k++) { i.set(1 + k, 13 - k, sleeve); i.set(1 + k, 14 - k, sleeve); i.set(3 + k, 14 - k, sleeve); i.set(3 + k, 15 - k, sleeve); i.set(2 + k, 13 - k, sleeveL); }
  return i;
}

function boot(): Img {
  const i = new Img(16, 16);
  const leather = hex('#8a5a32'), leatherD = hex('#5e3a1e'), leatherL = hex('#b0804a'), sole = hex('#3a2a20'), lace = hex('#e8dcc0'), moss = hex('#5a8a3a');
  i.rect(5, 2, 5, 9, leather); i.vline(5, 2, 9, leatherL); i.vline(9, 2, 9, leatherD); // 鞋筒
  i.rect(5, 9, 9, 4, leather); i.hline(5, 9, 9, leatherL); // 鞋头
  i.rect(4, 13, 11, 2, sole); i.hline(5, 12, 8, leatherD);
  i.set(7, 4, lace); i.set(8, 5, lace); i.set(7, 6, lace); i.set(8, 7, lace);
  i.set(11, 10, moss); i.set(12, 11, moss); i.set(6, 3, moss); // 水草
  return i;
}
function weed(): Img {
  const i = new Img(16, 16);
  const g1 = hex('#4a8a3a'), g2 = hex('#6ab04a'), g3 = hex('#2e6a2a');
  for (const [x, y0, h, c] of [[4, 4, 10, g1], [7, 2, 12, g2], [10, 5, 9, g3], [12, 8, 6, g1], [2, 8, 6, g3]] as [number, number, number, ReturnType<typeof hex>][]) {
    for (let k = 0; k < h; k++) i.set(x + (k % 4 < 2 ? 0 : 1), y0 + k, c);
  }
  i.hline(3, 14, 10, hex('#3a2a20'));
  return i;
}
function bait(): Img {
  const i = new Img(16, 16);
  const tin = hex('#b8c4cc'), tinD = hex('#7e8c96'), tinL = hex('#e8eef2'), soil = hex('#5a3a20'), worm = hex('#e07a8a'), wormD = hex('#b04a64');
  i.rect(3, 5, 10, 9, tin); i.vline(3, 5, 9, tinL); i.vline(12, 5, 9, tinD); i.hline(3, 13, 10, tinD);
  i.rect(2, 3, 12, 3, tinL); i.hline(2, 5, 12, tinD); // 盖沿
  i.rect(4, 7, 8, 5, soil); // 敞开的土
  i.set(5, 8, worm); i.set(6, 9, worm); i.set(7, 8, worm); i.set(8, 9, wormD); i.set(9, 8, worm); i.set(10, 10, wormD); i.set(6, 11, wormD);
  return i;
}
function rod(): Img {
  const i = new Img(16, 16);
  const cane = hex('#c8a45a'), caneD = hex('#8a6a30'), line = hex('#e8eef2'), reel = hex('#4a6a8a'), reelL = hex('#8ab0d0'), hook = hex('#c4cad0');
  for (let k = 0; k < 13; k++) { i.set(1 + k, 14 - k, cane); if (k % 3 === 0) i.set(1 + k, 15 - k, caneD); } // 斜竿
  i.rect(3, 10, 3, 3, reel); i.set(3, 10, reelL); i.set(4, 11, hex('#e8eef2')); // 线轮
  i.vline(14, 2, 6, line); i.set(14, 8, hook); i.set(13, 9, hook); i.set(12, 9, hook); // 垂下的线和钩
  return i;
}

function rodTier(caneC: string, caneD: string, reelC: string, reelL: string, shine?: string): Img {
  const i = new Img(16, 16), cane = hex(caneC), dark = hex(caneD), line = hex('#e8eef2');
  for (let k = 0; k < 13; k++) { i.set(1 + k, 14 - k, cane); if (k % 3 === 0) i.set(1 + k, 15 - k, dark); if (shine && k % 4 === 1) i.set(1 + k, 13 - k, hex(shine)); }
  i.rect(3, 10, 3, 3, hex(reelC)); i.set(3, 10, hex(reelL)); i.set(4, 11, hex('#fff6d8'));
  i.vline(14, 2, 6, line); i.set(14, 8, hex('#c4cad0')); i.set(13, 9, hex('#c4cad0')); i.set(12, 9, hex('#c4cad0'));
  return i;
}
function baitPro(): Img {
  const i = new Img(16, 16);
  const glass = hex('#cfe4ee'), glassD = hex('#8fb0c0'), lid = hex('#e0a52a'), lidD = hex('#a8741a'), soil = hex('#7a4a22'), worm = hex('#f08a9a'), wormD = hex('#c04a6a');
  i.rect(3, 5, 10, 9, glass); i.vline(3, 5, 9, hex('#ffffff')); i.vline(12, 5, 9, glassD); i.hline(3, 13, 10, glassD);
  i.rect(3, 2, 10, 3, lid); i.hline(3, 4, 10, lidD); i.set(4, 2, hex('#ffe08a'));
  i.rect(4, 7, 8, 6, soil); i.set(5, 8, worm); i.set(6, 9, worm); i.set(7, 8, worm); i.set(8, 9, wormD); i.set(9, 8, worm); i.set(10, 10, wormD); i.set(6, 11, wormD);
  i.set(11, 6, hex('#ffe08a')); i.set(10, 5, hex('#fff6d8')); // 香味的小星星
  return i;
}
function catBed(): Img {
  const i = new Img(16, 16);
  const rim = hex('#c98a5a'), rimL = hex('#e8b080'), rimD = hex('#8a5a38'), cush = hex('#f4b6c8'), cushD = hex('#d88aa4'), fur = hex('#fff0d8');
  i.ellipse(8, 10, 7.4, 4.6, rimD); i.ellipse(8, 9, 7.4, 4.6, rim); i.ellipse(8, 9.5, 5.6, 3, cush); i.ellipse(8, 10, 4.2, 2, cushD);
  for (let x = 2; x < 14; x += 2) i.set(x, 5 + Math.abs(x - 8) / 4, rimL);
  i.set(7, 8, fur); i.set(8, 8, fur); i.set(9, 8, fur); i.set(8, 9, fur); // 一小团毛
  i.set(11, 7, hex('#d6405c')); i.set(12, 7, hex('#d6405c')); i.set(11, 8, hex('#d6405c')); // 小爱心
  return i;
}

/** 染料：一个小瓶子（玻璃瓶身、软木塞），瓶里是彩虹渐变的颜料，瓶口挂着一滴 */
function dyeBottle(): Img {
  const i = new Img(16, 16);
  const glass = hex('#e8f2f8'), glassD = hex('#9ab4c4'), cork = hex('#c89a5a'), corkD = hex('#8a6438');
  const paint = ['#e8506a', '#f09a3a', '#f4d84a', '#5ab870', '#4a9ae0', '#9a6ad0'].map(hex);
  i.set(7, 1, corkD); i.set(8, 1, corkD); i.set(6, 2, cork); i.set(7, 2, cork); i.set(8, 2, cork); i.set(9, 2, cork); // 软木塞
  for (let x = 5; x <= 10; x++) i.set(x, 3, glassD);          // 瓶口
  i.set(6, 4, glass); i.set(7, 4, glass); i.set(8, 4, glass); i.set(9, 4, glass); i.set(5, 4, glassD); i.set(10, 4, glassD);
  for (let y = 5; y <= 14; y++) { const w = y < 7 ? 3 + (y - 5) : 5; for (let x = 8 - w; x < 8 + w; x++) i.set(x, y, x === 8 - w || x === 8 + w - 1 ? glassD : glass); }
  for (let x = 3; x < 13; x++) i.set(x, 15, glassD);          // 瓶底
  for (let y = 8; y <= 14; y++) for (let x = 4; x < 12; x++) i.set(x, y, paint[Math.min(5, Math.floor(((x - 4) + (y - 8) * 0.4) / 1.4) % 6)]); // 瓶里的颜料
  i.set(6, 6, hex('#ffffff')); i.set(6, 7, hex('#ffffff')); // 高光
  return i;
}

// ================= 钓鱼 2.0 新增图标 =================
const CLAM = art([
  '................', '................', '................',
  '......pppp......',
  '....ppPPPPpp....',
  '...pPPwPPPPPp...',
  '..pPPPPPPwPPPp..',
  '..pPwPPPPPPPPp..',
  '..dpPPPwPPPPpd..',
  '..dddpppppppdd..',
  '...ddddddddddd..',
  '....dddddddd....',
  '......dddd......',
  '................', '................', '................',
], { p: '#a89888', P: '#d8c8b4', w: '#f4ece0', d: '#6a5848' });
const CRAB = art([
  '................',
  '.cc..........cc.',
  'cCCc........cCCc',
  'cC.c........c.Cc',
  '.c..a......a..c.',
  '.....aeeeea.....',
  '...rrrrrrrrrr...',
  '..rRrrRrrrRrrr..',
  '.lrrrrrrrrrrrrl.',
  '..lrRrrrrrRrrl..',
  '...lrrrrrrrrl...',
  '..l.l.l..l.l.l..',
  '................', '................', '................', '................',
], { c: '#7a5a2a', C: '#b88a3a', r: '#8a6a3a', R: '#b08a4e', a: '#8a6a3a', e: '#2a1f2e', l: '#5a4220' });
const XUANGUI = art([
  '................', '.......gg.......',
  '.....ggGGgg.....',
  '...ggGgGgGGgg...',
  '..gGGgGGgGgGGg..',
  '..gGgGGgGGgGgg.h',
  '.tgGGgGgGGgGGghh',
  '..gGgGGgGgGGgghe',
  '..gGGgGgGGgGgg.h',
  '...ggGGgGgGggg..',
  '...lll.gggg.lll.',
  '..lll......lll..',
  '................', '................', '................', '................',
], { g: '#2a5a4a', G: '#4a8a6a', h: '#7aa088', e: '#f4d070', t: '#7aa088', l: '#7aa088' });
const BOTTLE_BOX = art([
  '................', '......ccc.......',
  '......cCc.......',
  '......bBb.......',
  '.....bBBBb......',
  '....bBwwwBb.....',
  '....bBwpwBb.....',
  '....bBwpwBb.....',
  '....bBwwwBb.....',
  '....bBBBBBb.....',
  '....bBBBBBb.....',
  '.....bbbbb......',
  '................', '................', '................', '................',
], { c: '#b89060', C: '#d8b078', b: '#3a9a8a', B: '#8adccc', w: '#f4ecd8', p: '#c8503a' });
const CRATE = art([
  '................', '................',
  '..dddddddddddd..',
  '..dWWWWWWWWWWd..',
  '..dWWWWWWWWWWd..',
  '..dDDDDDDDDDDd..',
  '..dWWWWgWWWWWd..',
  '..dWWWgggWWWWd..',
  '..dWWWWgWWWWWd..',
  '..dDDDDDDDDDDd..',
  '..dWWWWWWWWWWd..',
  '..dddddddddddd..',
  '..m..........m..',
  '................', '................', '................',
], { d: '#4a3220', W: '#9a7040', D: '#6a4a2a', g: '#d8b84a', m: '#3a8a4a' });
const WRECK = art([
  '................', '................',
  '...gggggggggg...',
  '..gGGGGGGGGGGg..',
  '..gGgggggggGGg..',
  '..ggggGGggggggg.',
  '..gDDDDggDDDDDg.',
  '..gDwwwDDDwwwDg.',
  '..gDDDDDDDDDDDg.',
  '..gDDDDDDDDDDDg.',
  '..gDDDDDDDDDDDg.',
  '...gggggggggg...',
  '..a.a..a..a.a...',
  '................', '................', '................',
], { g: '#2a4a5a', G: '#5a8a9a', D: '#3a6a7a', w: '#e0c050', a: '#4a8a5a' });
const SCALE = art([
  '................', '................',
  '......ggg.......',
  '....ggGGGgg.....',
  '...gGGYYGGGg....',
  '..gGGYyyYGGGg...',
  '..gGYyYYyYGGg...',
  '..gGYyYYyYGGg...',
  '..gGGYyyYGGGg...',
  '...gGGYYGGGg....',
  '....ggGGGgg.....',
  '......ggg.......',
  '................', '................', '................', '................',
], { g: '#8a6a1a', G: '#e0b030', Y: '#fff0a0', y: '#ffd84a' });
const PEARL = art([
  '................', '................', '................',
  '......wwww......',
  '....wwWWWWww....',
  '...wWWHHWWWWw...',
  '...wWHHWWWWWp...',
  '...wWWWWWWWpp...',
  '...wWWWWWWpp....',
  '....wppWWpp.....',
  '.....pppppp.....',
  '................', '................', '................', '................', '................',
], { w: '#c8c8d8', W: '#f4f4fa', H: '#ffffff', p: '#a8a8c0' });
const RELIC_BADGE = art([
  '................', '................',
  '.....rrrrrr.....',
  '....rRRRRRRr....',
  '...rRRyyyyRRr...',
  '...rRyYYYYyRr...',
  '...rRyYggYyRr...',
  '...rRyYggYyRr...',
  '...rRyYYYYyRr...',
  '...rRRyyyyRRr...',
  '....rRRRRRRr....',
  '.....rrrrrr.....',
  '................', '................', '................', '................',
], { r: '#8a5a2a', R: '#b08040', y: '#8a7a40', Y: '#b8a860', g: '#6a5a20' });
const RELIC_CARD = art([
  '................', '................',
  '..yyyyyyyyyyyy..',
  '..yYYYYYYYYYYy..',
  '..yYbbbbbYYYYy..',
  '..yYYYYYYYYYYy..',
  '..yYrrYrrYrrYy..',
  '..yYYYYYYYYYYy..',
  '..yYrrYrrYYYYy..',
  '..yYYYYYYYYYYy..',
  '..yyyyyyyyyyyy..',
  '................', '................', '................', '................', '................',
], { y: '#a8905a', Y: '#e4d4a0', b: '#5a4a2a', r: '#9a6a5a' });
const RELIC_MEAL = art([
  '................', '................',
  '..cccccccccccc..',
  '..cGGGGGGGGGGc..',
  '..cGoooGGGGGGc..',
  '..cGoooGGGGGGc..',
  '..cGGGGGGGGGGc..',
  '..cdddddddddGc..',
  '..cdDDDDDDDdGc..',
  '..cdddddddddGc..',
  '..cccccccccccc..',
  '................', '................', '................', '................', '................',
], { c: '#5a6a5a', G: '#8a9a7a', o: '#c8b040', d: '#3a3a3a', D: '#5a5a5a' });
const RELIC_HISTORY = art([
  '................',
  '...wwwwwwwwww...',
  '..wWWWWWWWWWWw..',
  '..wWkkkkkkWWWw..',
  '..wWWWWWWWWWWw..',
  '..wWkkkWkkkkWw..',
  '..wWWWWWWWWWWw..',
  '..wWkkWkkkWWWw..',
  '..wWWWWWWWWWWw..',
  '..wWkkkkWkkkWw..',
  '..wWWWWsWWWWWw..',
  '...wwwwwssswww..',
  '................', '................', '................', '................',
], { w: '#b8a880', W: '#eee2c0', k: '#7a6a50', s: '#8a9aa8' });

/** 鱼饵罐：和 bait / bait_pro 同一个罐子形状，换盖子颜色和里面的东西 */
function baitJar(lidC: string, lidD: string, content: 'glow' | 'leaf' | 'grub' | 'magnet' | 'any' | 'name' | 'myth'): () => Img {
  return () => {
    const i = new Img(16, 16);
    const glass = hex('#cfe4ee'), glassD = hex('#8fb0c0'), lid = hex(lidC), lidDk = hex(lidD), soil = hex('#5a3a20');
    i.rect(3, 5, 10, 9, glass); i.vline(3, 5, 9, hex('#ffffff')); i.vline(12, 5, 9, glassD); i.hline(3, 13, 10, glassD);
    i.rect(3, 2, 10, 3, lid); i.hline(3, 4, 10, lidDk); i.set(4, 2, hex('#ffffff'));
    i.rect(4, 7, 8, 6, soil);
    if (content === 'glow') { for (const [x, y] of [[5, 8], [8, 10], [10, 8], [6, 11], [9, 12]]) { i.set(x, y, hex('#e8ff6a')); i.set(x + 1, y, hex('#9ae04a')); } }
    if (content === 'leaf') { for (const [x, y] of [[5, 8], [7, 10], [9, 8], [10, 11]]) { i.set(x, y, hex('#e08a3a')); i.set(x + 1, y, hex('#f4c860')); } i.set(8, 12, hex('#6aa04a')); }
    if (content === 'grub') { for (const [x, y] of [[5, 8], [6, 9], [8, 8], [9, 9], [6, 11], [8, 11]]) { i.rect(x, y, 2, 1, hex('#f4ecc0')); i.set(x, y, hex('#b89a50')); } }
    if (content === 'magnet') { i.rect(5, 8, 2, 4, hex('#d6405c')); i.rect(9, 8, 2, 4, hex('#d6405c')); i.hline(5, 8, 6, hex('#d6405c')); i.set(5, 11, hex('#e8eef2')); i.set(6, 11, hex('#e8eef2')); i.set(9, 11, hex('#e8eef2')); i.set(10, 11, hex('#e8eef2')); }
    if (content === 'any') { for (const [x, y, c] of [[5, 8, '#e8584a'], [7, 10, '#4a9ae8'], [9, 8, '#f2c230'], [10, 11, '#6ac04a'], [6, 12, '#c06ae0']] as [number, number, string][]) { i.set(x, y, hex(c)); i.set(x + 1, y, hex(c)); } }
    if (content === 'name') { i.set(8, 8, hex('#fff6d8')); i.vline(8, 9, 3, hex('#fff6d8')); i.set(7, 8, hex('#fff6d8')); i.set(9, 8, hex('#fff6d8')); i.set(7, 12, hex('#fff6d8')); i.set(9, 12, hex('#fff6d8')); i.set(5, 10, hex('#f2c230')); i.set(11, 10, hex('#f2c230')); }
    if (content === 'myth') { for (const [x, y] of [[5, 8], [8, 9], [10, 8], [6, 11], [9, 11]]) { i.set(x, y, hex('#ffd84a')); i.set(x + 1, y, hex('#ff6a4a')); } i.set(11, 6, hex('#ffe08a')); i.set(10, 5, hex('#fff6d8')); }
    return i;
  };
}
/** 配件小图：长浮漂 / 铅坠 / 倒刺钩 / 缓冲浮标 / 声呐浮标 / 寻宝钩 */
const TK_FLOAT = art([
  '.......r........', '.......R........', '.......R........',
  '......rRr.......',
  '......wWw.......',
  '......rRr.......',
  '......wWw.......',
  '......rRr.......',
  '.......w........',
  '.......l........', '.......l........', '.......l........', '................', '................', '................', '................',
], { r: '#d6405c', R: '#ff8a9a', w: '#f4f4f0', W: '#ffffff', l: '#e8eef2' });
const TK_LEAD = art([
  '................', '.......l........', '.......l........',
  '......lll.......',
  '.....sSSSs......',
  '....sSSSSSs.....',
  '....sSSSSSds....',
  '....sSSSSddds...',
  '.....sddddds....',
  '......sssss.....',
  '.......l........', '.......l........', '................', '................', '................', '................',
], { l: '#e8eef2', s: '#4a5058', S: '#8a929a', d: '#2e3238' });
const TK_BARB = art([
  '................', '.......l........', '.......l........', '.......l........',
  '.......k........',
  '.......k........',
  '.......k........',
  '.......k........',
  '......kk........',
  '.....kk..k......',
  '.....k...kk.....',
  '.....kk.kk......',
  '......kkk.......', '................', '................', '................',
], { l: '#e8eef2', k: '#b8c4cc' });
const TK_BUFFER = art([
  '................', '.......l........',
  '.....bbbbb......',
  '....bBBBBBb.....',
  '...bBBwwBBBb....',
  '...bBBwBBBBb....',
  '...bBBBBBBBb....',
  '...rrrrrrrrr....',
  '...rRRRRRRRr....',
  '....rrrrrrr.....',
  '.....rrrrr......',
  '.......l........', '................', '................', '................', '................',
], { l: '#e8eef2', b: '#2a7ab8', B: '#6ac0f0', w: '#ffffff', r: '#c84a3a', R: '#f08a6a' });
const TK_SONAR = art([
  '................', '.......l........',
  '.....y.y.y......',
  '....y.yyy.y.....',
  '.....gggggg.....',
  '....gGGGGGGg....',
  '...gGGdddGGGg...',
  '...gGdGGGdGGg...',
  '...gGGdddGGGg...',
  '....gGGGGGGg....',
  '.....gggggg.....',
  '.......l........', '................', '................', '................', '................',
], { l: '#e8eef2', y: '#7ae8a8', g: '#2a4a3a', G: '#4a8a6a', d: '#9affc8' });
const TK_TREASURE = art([
  '................', '.......l........', '.......l........',
  '.......k........',
  '......kk........',
  '.....kk.........',
  '.....k..yyy.....',
  '.....kk.yYy.....',
  '......kkyyy.....',
  '.......kk.......',
  '.......k........', '................', '................', '................', '................', '................',
], { l: '#e8eef2', k: '#d8a82a', y: '#f2c230', Y: '#fff0a0' });

const RODS2: Record<string, () => Img> = {
  rod_glow: () => rodTier('#2a3a6a', '#141c3a', '#e8e060', '#fffcb0', '#c8f06a'),
  rod_rain: () => rodTier('#3a7a8a', '#1e4a58', '#6ab0e8', '#cfe8ff', '#a8e0f0'),
  rod_frost: () => rodTier('#a8d4ec', '#6a98b8', '#e8f4fc', '#ffffff', '#ffffff'),
  rod_pickup: () => rodTier('#7a5a32', '#4a321a', '#6aa04a', '#b8e090', '#e0c070'),
  rod_twin: () => rodTier('#c86a9a', '#8a3a68', '#e8c0d8', '#ffe8f4', '#f4a8d0'),
  rod_bone: () => rodTier('#ece4d0', '#a89878', '#c4402e', '#ff8a6a', '#fff6e0'),
};

// ------------------------------------------------ 耕作：作物与种子（校园农场）
/** 小白菜 */
const cropCabbage = () => {
  const i = new Img(16, 16);
  i.ellipse(8, 10, 5, 4, hex('#6aac46'));
  i.ellipse(8, 9, 3.4, 2.8, hex('#a8d878'));
  i.set(8, 3, hex('#4e8a32')); i.set(7, 4, hex('#4e8a32')); i.set(9, 4, hex('#4e8a32'));
  i.rect(7, 13, 2, 2, hex('#eaf2d8'));
  return i;
};
/** 番茄 */
const cropTomato = () => {
  const i = new Img(16, 16);
  i.ellipse(8, 9, 5, 4.6, hex('#e04a3a'));
  i.ellipse(6, 7, 1.6, 1.2, hex('#f48878'));
  for (const [x, y] of [[8, 3], [7, 4], [9, 4], [8, 5]]) i.set(x, y, hex('#4a9a3a'));
  i.set(8, 5, hex('#3a7a2a'));
  return i;
};
/** 辣椒 */
const cropChili = () => {
  const i = new Img(16, 16);
  for (const [x, y] of [[5, 5], [5, 6], [6, 7], [6, 8], [7, 9], [7, 10], [8, 11], [8, 12], [9, 12]]) {
    i.set(x, y, hex('#d63a2e')); i.set(x + 1, y, hex('#a82a22'));
  }
  i.set(5, 3, hex('#4a9a3a')); i.set(6, 3, hex('#4a9a3a')); i.set(5, 4, hex('#3a7a2a'));
  return i;
};
/** 西瓜 */
const cropWatermelon = () => {
  const i = new Img(16, 16);
  i.ellipse(8, 9, 6, 5, hex('#3e8a3a'));
  for (const [x, y, h] of [[4, 7, 3], [6, 6, 5], [9, 6, 5], [11, 7, 3], [8, 5, 2]]) i.rect(x, y, 1, h, hex('#22502a'));
  i.set(8, 13, hex('#8ab84a'));
  i.set(4, 5, hex('#b8d878'));
  return i;
};
/** 南瓜 */
const cropPumpkin = () => {
  const i = new Img(16, 16);
  i.ellipse(8, 10, 6, 4.6, hex('#e8882a'));
  for (const x of [4, 6, 8, 10, 12]) i.rect(x, 6, 1, 8, hex('#c86a1a'));
  i.rect(7, 3, 2, 3, hex('#5a7a2a')); i.set(9, 3, hex('#4a6a22'));
  i.set(3, 8, hex('#f4b060'));
  return i;
};
/** 胡萝卜 */
const cropCarrot = () => {
  const i = new Img(16, 16);
  for (let y = 0; y < 9; y++) {
    const w = Math.max(1, 4 - Math.floor(y / 2));
    i.rect(8 - w, 6 + y, w * 2, 1, hex(y < 3 ? '#f09030' : '#e07820'));
  }
  for (const [x, y] of [[5, 3], [6, 2], [7, 4], [9, 3], [10, 2], [8, 2]]) i.set(x, y, hex(y % 2 ? '#6ab84a' : '#4a9a3a'));
  return i;
};
/** 冬小麦 */
const cropWheat = () => {
  const i = new Img(16, 16);
  i.rect(7, 4, 2, 11, hex('#d8b048'));
  for (const y of [3, 5, 7, 9, 11]) { i.set(5, y, hex('#f0d070')); i.set(6, y, hex('#b8861a')); i.set(9, y, hex('#f0d070')); i.set(10, y, hex('#b8861a')); }
  i.rect(7, 15, 2, 1, hex('#b8861a'));
  return i;
};
/** 大白菜 */
const cropNapa = () => {
  const i = new Img(16, 16);
  i.ellipse(8, 9, 4.4, 5.4, hex('#d8e8b0'));
  i.ellipse(8, 12, 3.8, 2.6, hex('#f4f8e0'));
  i.rect(7, 4, 2, 10, hex('#a8c878'));
  i.set(5, 6, hex('#b8d888')); i.set(11, 6, hex('#b8d888'));
  return i;
};
/** 种子袋：一张纸袋 + 一块作物色的封签（8 种作物共用形状，只换颜色） */
const seedBag = (paper: string, rim: string, mark: string) => art([
  '................',
  '....rrrrrrrr....',
  '...rPPPPPPPPR...',
  '...rPmmmmmmPR...',
  '...rPmMMMMmPR...',
  '...rPmMMMMmPR...',
  '...rPmmmmmmPR...',
  '...rPPPPPPPPR...',
  '...rPPPPPPPPR...',
  '...rPPPPPPPPR...',
  '...rPPPPPPPPR...',
  '...rPPPPPPPPR...',
  '....rrrrrrrr....',
  '................',
  '................',
  '................',
], { r: rim, P: paper, R: rim, m: mark, M: mark });

export const ICONS: Record<string, () => Img> = {
  crop_cabbage: cropCabbage, crop_tomato: cropTomato, crop_chili: cropChili, crop_watermelon: cropWatermelon,
  crop_pumpkin: cropPumpkin, crop_carrot: cropCarrot, crop_wheat: cropWheat, crop_napa: cropNapa,
  seed_cabbage: seedBag('#f2ecd6', '#b8a888', '#6aac46'), seed_tomato: seedBag('#f2ecd6', '#b8a888', '#e04a3a'),
  seed_chili: seedBag('#f2ecd6', '#b8a888', '#d63a2e'), seed_watermelon: seedBag('#f2ecd6', '#b8a888', '#3e8a3a'),
  seed_pumpkin: seedBag('#f2ecd6', '#b8a888', '#e8882a'), seed_carrot: seedBag('#f2ecd6', '#b8a888', '#f09030'),
  seed_wheat: seedBag('#f2ecd6', '#b8a888', '#d8b048'), seed_napa: seedBag('#f2ecd6', '#b8a888', '#a8c878'),
  rod_carbon: () => rodTier('#3a4250', '#1e242c', '#b8c4cc', '#f0f6fa', '#7a8ca0'), rod_golden: () => rodTier('#e8b83a', '#a8741a', '#d6405c', '#ff9aa8', '#fff0a0'),
  ...RODS2,
  bait_glow: baitJar('#3a5aa8', '#243a78', 'glow'), bait_season: baitJar('#4a9a4a', '#2e6a2e', 'leaf'), bait_wild: baitJar('#b87a3a', '#7a4e1e', 'grub'),
  bait_magnet: baitJar('#c8c8d0', '#8a8a98', 'magnet'), bait_any: baitJar('#e8e0f0', '#a89cc0', 'any'), bait_name: baitJar('#f2c230', '#b8861a', 'name'), bait_myth: baitJar('#7a2ab8', '#4a1a78', 'myth'),
  tk_float: TK_FLOAT, tk_lead: TK_LEAD, tk_barb: TK_BARB, tk_buffer: TK_BUFFER, tk_sonar: TK_SONAR, tk_treasure: TK_TREASURE,
  box_bottle: BOTTLE_BOX, box_crate: CRATE, box_wreck: WRECK, dragon_scale: SCALE, pearl: PEARL,
  relic_badge: RELIC_BADGE, relic_card: RELIC_CARD, relic_meal: RELIC_MEAL, relic_history: RELIC_HISTORY,
  fish_bitterling: fish('#a8b8c0', '#f4c0d0', '#e8708a', 'dots', 0.6), fish_whitebait: fish('#dce6ec', '#ffffff', '#9aa8b4', 'long', 0.7), fish_clam: CLAM,
  fish_yellowcat: fish('#b89a4a', '#ecdca0', '#5a4a1e', 'whisker'), fish_bass: fish('#6a7a4a', '#d8dcb0', '#3e4a2a', 'stripe'), fish_wuchang: fish('#9aa4a8', '#e0e4e4', '#6a7478', 'flat'),
  fish_goby: fish('#8a6a50', '#d8c0a0', '#5a4230', 'dots', 0.7), fish_crab: CRAB, fish_yellowcarp: fish('#e8a830', '#fce8a0', '#c8741a', 'scale'), fish_silverling: fish('#e8f4f8', '#ffffff', '#b8d4e0', 'ice', 0.7),
  fish_ganoid: fish('#6a7a6a', '#d0d8cc', '#3e4a3e', 'long'), fish_sucker: fish('#d8707a', '#f4c0c0', '#a8404e', 'big'), fish_gar: fish('#6a7a4a', '#c8c89a', '#3a4a22', 'long'),
  fish_paddlefish: fish('#7a8490', '#d8dce0', '#4a5460', 'long'), fish_dragongate: fish('#ffe07a', '#fff6c0', '#e8841a', 'gold'),
  fish_hegongjin: fish('#fff6d8', '#ffffff', '#e8c850', 'koi'), fish_xuangui: XUANGUI,
  fish_yinglong: serpent('#e8b830', '#fff0a0', { from: 1, to: 15, thick: 3, amp: 3.2, period: 3, head: '#f4d050', whisk: true, horn: true, spine: '#e0602a' }),
  fish_guppy: fish('#e87a3a', '#ffd8a0', '#4a9ae8', 'dots', 0.6), fish_neon: fish('#2a3a6a', '#c8d8f0', '#3a9af0', 'stripe', 0.55), fish_oranda: fish('#f4f0e8', '#ffffff', '#e8483a', 'fat'),
  fish_butterfly: fish('#e87a4a', '#fff0d8', '#4a6ad8', 'koi'), fish_discus: fish('#e89a3a', '#fce8b0', '#2a8a9a', 'flat'),
  bait_pro: baitPro, cat_bed: catBed, dye: dyeBottle,
  cat_food: catFood, cat_treat: catTreat, mon_ball: monBall, ginkgo_leaf: ginkgoLeaf, cat_badge: catBadge,
  fishing_rod: rod, bait, junk_boot: boot, junk_weed: weed,
  fish_crucian: fish('#b8a878', '#e8e0c0', '#8a7a50', 'fat'),
  fish_carp: fish('#d88a3a', '#f4d8a0', '#b8501e', 'none'),
  fish_grass: fish('#6a8a5a', '#d8e0b8', '#486a3a', 'long'),
  fish_bream: fish('#aab8c4', '#e8eef2', '#7a8a98', 'flat'),
  fish_snakehead: fish('#4a4a3a', '#a89868', '#2a2a22', 'stripe'),
  fish_catfish: fish('#6a6a78', '#b8b8c0', '#4a4a58', 'whisker'),
  fish_goldfish: fish('#f2a020', '#ffd860', '#e07a10', 'fat'),
  fish_koi: fish('#f4ecd8', '#ffffff', '#e8e0c8', 'koi'),
  fish_gudgeon: fish('#b4c0c8', '#f0f4f6', '#78888c', 'none', 0.6),
  fish_loach: serpent('#8a7050', '#d8c090', { from: 2, to: 14, thick: 2, amp: 1.6, period: 3, whisk: true }),
  fish_shrimp: SHRIMP,
  fish_silver: fish('#c8d0d8', '#f4f6f8', '#9aa4b0', 'none'),
  fish_bighead: fish('#7a8490', '#d8dce0', '#566068', 'big'),
  fish_crayfish: CRAYFISH,
  fish_culter: fish('#d0dae4', '#f6f8fa', '#e0a040', 'long'),
  fish_mandarin: fish('#c8b04a', '#ece4a8', '#6a5a1a', 'stripe'),
  fish_turtle: TURTLE,
  fish_eel: serpent('#a08a4a', '#e0cf90', { from: 1, to: 15, thick: 3, amp: 2.2, period: 3.2 }),
  fish_blackcarp: fish('#3e4a58', '#8a96a4', '#2a323c', 'fat'),
  fish_salamander: SALAMANDER,
  fish_arowana: fish('#c8d4e0', '#f6f0f0', '#d88aa0', 'scale'),
  fish_sturgeon: fish('#6a7a8a', '#c8d0d8', '#3e4a58', 'long'),
  fish_goldkoi: fish('#ffd23a', '#fff0a0', '#f0a010', 'gold'),
  fish_icefish: fish('#cfe8f8', '#ffffff', '#8ac4e8', 'ice'),
  fish_lakedragon: serpent('#2a8a8a', '#f0d070', { from: 1, to: 15, thick: 3, amp: 3, period: 3.2, head: '#3aa8a0', whisk: true, horn: true, spine: '#f0d070' }),
  junk_can: CAN, junk_bottle: BOTTLE,
  trash_paper: PAPER, trash_cup: CUP, trash_wrapper: WRAPPER, trash_peel: PEEL, trash_chopsticks: chopsticks, bin_usb: USB,
};

/** 宿舍家具的背包图标：把家具精灵按面积平均缩进 16×16（保持比例、居中），再和别的图标一样描边 */
function decorIcon(k: string): Img {
  const src = ({ ...FURNITURE, ...OFFICE_FURNITURE, ...DORM_FURNITURE, ...DECOR_FURNITURE })[k]().img;
  const s = Math.max(1, Math.max(src.w, src.h) / 16), nw = Math.max(1, Math.min(16, Math.round(src.w / s))), nh = Math.max(1, Math.min(16, Math.round(src.h / s)));
  const out = new Img(16, 16), ox = (16 - nw) >> 1, oy = (16 - nh) >> 1;
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = Math.floor((y * src.h) / nh); sy < Math.max(Math.floor((y * src.h) / nh) + 1, Math.floor(((y + 1) * src.h) / nh)); sy++)
      for (let sx = Math.floor((x * src.w) / nw); sx < Math.max(Math.floor((x * src.w) / nw) + 1, Math.floor(((x + 1) * src.w) / nw)); sx++) {
        const p = src.get(sx, sy); n++; a += p[3]; r += p[0] * p[3]; g += p[1] * p[3]; b += p[2] * p[3];
      }
    if (n && a / n >= 110) out.set(ox + x, oy + y, [Math.round(r / a), Math.round(g / a), Math.round(b / a), 255]);
  }
  return out;
}
for (const d of DECOR) ICONS[d.id] = () => decorIcon(d.k);

/** 成品：描边后的图标 */
export function buildItemIcon(id: string): Img { return ICONS[id]().outlinedSoft(0.4, [40, 28, 64, 255]); }
void O;
