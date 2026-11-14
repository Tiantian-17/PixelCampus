/**
 * 室内房间的数据格式（data/interiors/<id>.json）与校验。地图编辑器的「室内编辑器」、室内编译（tools/world/interiors.ts）、测试共用。
 * 坐标单位 = 格（16 px）；北墙占上面 3 格，西/东/南各 1 格墙，南墙留一个门洞（exit）。
 */
export const INTERIOR_THEMES: { k: string; name: string }[] = [
  { k: 'office', name: '办公室/活动室（白墙、大地砖）' }, { k: 'classroom', name: '教室' }, { k: 'library', name: '图书馆（木地板）' }, { k: 'canteen', name: '食堂（米黄墙、红墙裙）' },
  { k: 'canteen2', name: '食堂 B（薄荷绿墙、水磨石地面）' }, { k: 'canteen3', name: '食堂 C（浅蓝墙、木地板）' }, { k: 'mall', name: '超市（白墙、浅色地砖）' }, { k: 'hall', name: '教学楼走廊 / 门厅（浅绿墙）' },
  { k: 'farm', name: '私人农场（草地、木屋、耕地，户外无墙）' },
];
export type InteriorTheme = 'library' | 'classroom' | 'canteen' | 'office' | 'canteen2' | 'canteen3' | 'mall' | 'hall' | 'farm';
export interface InteriorWindow { x: number; w: number; curtain?: boolean }
export interface InteriorLabel { text: string; x: number; y: number; size?: number; color?: string }
export type Rot = 0 | 90 | 180 | 270;
export interface InteriorFurn { k: string; x: number; y: number; /** 顺时针旋转角度（缺省 0）；90/270 时占地的宽高互换 */ rot?: Rot; /** 横幅/字画/白板上的字（由 Phaser 文字牌画在家具上） */ text?: string; /** 走近按 E 弹出的话（互动）；标题用家具上的字或家具名 */ interact?: string; /** 宿舍专用的动作：床（睡觉）、空调（开关/制冷/制热）、衣柜（换装）、宝箱（仓库）；走近按 E 触发，由宿舍场景处理 */ act?: 'bed' | 'ac' | 'wardrobe' | 'chest' | 'sign' | 'bath'; /** 摆在桌面上的小件：不占地、画在桌子上面 */ top?: boolean; /** top 小件的层级抬高（像素），缺省 24 */ dz?: number }
/** 房间内的玻璃隔断（竖向，一格厚）：x 列、y0~y1 行（含两端），gap = 隔断上留的"内部门"（从第 y 行起、高 h 格） */
export interface InteriorPartition { x: number; y0: number; y1: number; gap?: { y: number; h: number } }
/** shop = 走近按 E 打开哪个商店（目前只有农场的「农场管理员」：买种子 / 卖菜）；有商店的 NPC 不再弹普通对话框 */
export interface InteriorNpc { look: number; x: number; y: number; name: string; facing?: 'down' | 'up' | 'left' | 'right'; lines: string[]; shop?: 'farm' }
/**
 * 楼梯口：画在地板上的一块 w×2 格的楼梯（不挡路），走到上面按 E 换层。dir = 上楼 / 下楼，to = 目标室内 id。
 * land = 从别的楼层走过来时人落在哪（缺省：楼梯口正南面，见 stairLand）。
 */
export interface InteriorStair { dir: 'up' | 'down'; x: number; y: number; w?: number; to: string; land?: { x: number; y: number } }
export const STAIR_H = 2, STAIR_W = 3;
const CN_NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** 楼层的中文说法：1 → 一楼 */
export const floorName = (n: number) => `${CN_NUM[n] ?? n}楼`;
export const stairW = (s: InteriorStair) => s.w ?? STAIR_W;
/** 从楼上 / 楼下走过来时人落的位置（格，可以是小数）：楼梯口正南面一格多一点 */
export const stairLand = (s: InteriorStair): { x: number; y: number } => s.land ?? { x: s.x + stairW(s) / 2, y: s.y + STAIR_H + 0.6 };
/** 楼梯口的互动区（像素）：楼梯本体外扩半格（落点在区外，刚走过来不会马上又提示换层） */
export const stairZone = (s: InteriorStair) => ({ x0: s.x * 16 - 8, x1: (s.x + stairW(s)) * 16 + 8, y0: s.y * 16 - 8, y1: (s.y + STAIR_H) * 16 + 8 });
export interface InteriorSpec {
  id: string; name: string; w: number; h: number; theme: InteriorTheme;
  /** 南墙门洞（回校园）。多层建筑的二层以上没有门洞，只能走楼梯 */
  exit?: { x: number; w: number };
  /** 第几层（1 起）；多层建筑每层一个文件 */
  floor?: number;
  /** 所属建筑（同一栋楼的各层写同一个名字，如 canteen-2）：测试按它检查楼层连贯 */
  building?: string;
  stairs?: InteriorStair[];
  rugs?: { x: number; y: number; w: number; h: number; color?: string }[];
  blackboard?: { x: number; w: number };
  posters?: { x: number }[];
  windows?: InteriorWindow[];
  wallW?: 'glass';
  partitions?: InteriorPartition[];
  labels?: InteriorLabel[];
  /** 额外的挡路块（格）：底图上画死的东西（农场的木屋、树丛），没有家具可挂就写在这里 */
  blocks?: { x: number; y: number; w: number; h: number }[];
  open?: boolean;
  furniture: InteriorFurn[];
  npcs?: InteriorNpc[];
  desc?: string;
}

/** 旋转后的占地（格）：90/270 宽高互换 */
export const rotFoot = (fw: number, fh: number, rot: number = 0) => (rot === 90 || rot === 270 ? { fw: fh, fh: fw } : { fw, fh });
/**
 * 一件家具按某个朝向摆放时，占地矩形在精灵图里的位置：mx/my = 占地左上角在精灵图里的像素位置，fw/fh = 旋转后的占地格数，w/h = 旋转后的精灵图尺寸。
 * 精灵图（带 1px 描边）的约定：占地左缘 = 图左缘 +1，占地底缘 = 图底 −1，精灵可以向上超出；顺时针转 90° 一次：(x,y) → (H−1−y, x)。
 * 室内编译（tools/world/interiors.ts）和宿舍里摆家具（InteriorScene）共用这一个算法，两边不会对不上。
 */
export function rotInfo(fw: number, fh: number, w: number, h: number, rot: number = 0): { fw: number; fh: number; w: number; h: number; mx: number; my: number } {
  let rect = { x: 1, y: h - 1 - fh * 16, w: fw * 16, h: fh * 16 }, iw = w, ih = h;
  for (let r = 90; r <= rot && fh > 0; r += 90) { rect = { x: ih - (rect.y + rect.h), y: rect.x, w: rect.h, h: rect.w }; [iw, ih] = [ih, iw]; }
  return { fw: rect.w / 16, fh: rect.h / 16, w: iw, h: ih, mx: rect.x, my: rect.y };
}
/** 家具上写字的版式：h = 横排（横幅、白板），v = 竖排（字画） */
export type TextMode = 'h' | 'v';
/**
 * 家具上的字（横幅「数学建模协会」、字画「天道酬勤」）→ 文字牌：位置在精灵正中，字号按精灵宽度自适应，竖排时每个字一行。
 * m = 家具目录里这件家具的数据（img = 精灵图宽高，mx/my = 占地左上角在精灵图里的位置，见 tools/world/interiors.ts）。
 */
export function furnitureLabel(f: InteriorFurn, m: { fw: number; fh: number; w: number; h: number; mx: number; my: number; text?: TextMode }): InteriorLabel | null {
  if (!f.text || !m.text) return null;
  const chars = [...f.text], n = Math.max(1, chars.length);
  const cx = f.x + (m.w / 2 - m.mx) / 16, cy = f.y + (m.h / 2 - m.my) / 16; // 精灵图中心相对占地左上角的位置
  if (m.text === 'v') return { text: chars.join('\n'), x: cx, y: cy - 0.1, size: Math.max(7, Math.min(10, Math.floor((m.h - 10) / n))), color: '#2a2a33' };
  return { text: f.text, x: cx, y: cy, size: Math.max(7, Math.min(12, Math.floor((m.w - 6) / n))), color: '#2a2a33' };
}

/** 校验一份室内数据，返回错误列表（空 = 合法）。known = 已知的家具 key（编译时从家具表来） */
export function validateInterior(j: unknown, known: ReadonlySet<string>): string[] {
  const err: string[] = [];
  if (!j || typeof j !== 'object') return ['不是对象'];
  const s = j as Partial<InteriorSpec>;
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  const int = (v: unknown) => Number.isInteger(v);
  if (typeof s.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(s.id)) err.push('id 只能是小写字母/数字/短横线（2~40 位）');
  if (typeof s.name !== 'string' || !s.name || s.name.length > 30) err.push('名字 1~30 字');
  if (!int(s.w) || !int(s.h) || s.w! < 8 || s.w! > 48 || s.h! < 8 || s.h! > 40) err.push('房间大小：宽 8~48、高 8~40 格');
  if (!INTERIOR_THEMES.some((t) => t.k === s.theme)) err.push('未知主题');
  if (err.length) return err;
  const W = s.w!, H = s.h!;
  if (s.exit === undefined) { if (!Array.isArray(s.stairs) || !s.stairs.length) err.push('没有南墙门洞 exit 的房间（多层建筑的上层）必须有楼梯 stairs'); }
  else if (!int(s.exit.x) || !int(s.exit.w) || s.exit.w < 2 || s.exit.w > 6 || s.exit.x < 1 || s.exit.x + s.exit.w > W - 1) err.push('门洞 exit：宽 2~6，且在南墙内');
  if (s.floor !== undefined && (!int(s.floor) || s.floor < 1 || s.floor > 9)) err.push('floor 是 1~9 的整数');
  if (s.building !== undefined && (typeof s.building !== 'string' || !/^[a-z0-9][a-z0-9-]{1,39}$/.test(s.building))) err.push('building 只能是小写字母/数字/短横线');
  if (s.stairs !== undefined) {
    if (!Array.isArray(s.stairs) || s.stairs.length > 4) err.push('stairs 不合法（最多 4 个）');
    else s.stairs.forEach((t, i) => {
      const w = int(t.w ?? STAIR_W) ? (t.w ?? STAIR_W) : 0;
      const ok = (t.dir === 'up' || t.dir === 'down') && int(t.x) && int(t.y) && w >= 2 && w <= 6 && t.x >= 1 && t.x + w <= W - 1 && t.y >= 3 && t.y + STAIR_H <= H - 1 && typeof t.to === 'string' && /^[a-z0-9][a-z0-9-]{1,39}$/.test(t.to);
      if (!ok) err.push(`stairs[${i}]: 方向 up/down、位置在房间里（宽 2~6、高 ${STAIR_H} 格）、目标是室内 id`);
    });
  }
  if (!Array.isArray(s.furniture) || s.furniture.length > 500) { err.push('furniture 不是数组或太多'); return err; }
  s.furniture.forEach((f, i) => {
    if (!f || !known.has(f.k)) err.push(`furniture[${i}]: 未知家具 ${f?.k}`);
    else if (!int(f.x) || !int(f.y) || f.x < 0 || f.y < 0 || f.x >= W || f.y >= H) err.push(`furniture[${i}]: 位置出界`);
    else if (f.dz !== undefined && (!num(f.dz) || f.dz < 0 || f.dz > 200)) err.push(`furniture[${i}]: dz 不合法`);
    else if (f.rot !== undefined && ![0, 90, 180, 270].includes(f.rot)) err.push(`furniture[${i}]: 旋转只能是 0/90/180/270`);
    else if (f.interact !== undefined && (typeof f.interact !== 'string' || !f.interact || f.interact.length > 120)) err.push(`furniture[${i}]: 互动文字 1~120 字`);
    else if (f.act !== undefined && !['bed', 'ac', 'wardrobe', 'chest', 'sign', 'bath'].includes(f.act)) err.push(`furniture[${i}]: act 只能是 bed/ac/wardrobe/chest/sign/bath`);
    else if (f.text !== undefined && (typeof f.text !== 'string' || f.text.length > 16)) err.push(`furniture[${i}]: 文字最多 16 字`);
  });
  if (s.windows !== undefined) {
    if (!Array.isArray(s.windows) || s.windows.length > 8) err.push('windows 不合法');
    else s.windows.forEach((w, i) => { if (!num(w.x) || !num(w.w) || w.w < 1 || w.w > 12 || w.x < 1 || w.x + w.w > W - 1) err.push(`windows[${i}]: 位置/宽度不合法`); });
  }
  if (s.labels !== undefined) {
    if (!Array.isArray(s.labels) || s.labels.length > 20) err.push('labels 不合法');
    else s.labels.forEach((l, i) => { if (typeof l.text !== 'string' || !l.text || l.text.length > 30 || !num(l.x) || !num(l.y) || (l.size !== undefined && (!num(l.size) || l.size < 6 || l.size > 24))) err.push(`labels[${i}]: 不合法`); });
  }
  if (s.npcs !== undefined) {
    if (!Array.isArray(s.npcs) || s.npcs.length > 12) err.push('npcs 不合法');
    else s.npcs.forEach((n, i) => {
      if (!int(n.look) || n.look < 0 || n.look > 20 || !num(n.x) || !num(n.y) || typeof n.name !== 'string' || !n.name || n.name.length > 12 || !Array.isArray(n.lines) || !n.lines.length || n.lines.length > 8 || n.lines.some((l) => typeof l !== 'string' || !l || l.length > 120)) err.push(`npcs[${i}]: 不合法（名字 ≤12 字，台词 1~8 句、每句 ≤120 字）`);
      else if (n.shop !== undefined && n.shop !== 'farm') err.push(`npcs[${i}]: shop 只能是 farm`);
    });
  }
  if (s.partitions !== undefined) {
    if (!Array.isArray(s.partitions) || s.partitions.length > 6) err.push('partitions 不合法');
    else s.partitions.forEach((p, i) => {
      const ok = int(p.x) && int(p.y0) && int(p.y1) && p.x >= 2 && p.x <= W - 3 && p.y0 >= 3 && p.y1 <= H - 2 && p.y0 <= p.y1;
      const gapOk = !p.gap || (int(p.gap.y) && int(p.gap.h) && p.gap.h >= 2 && p.gap.h <= 4 && p.gap.y >= p.y0 && p.gap.y + p.gap.h - 1 <= p.y1);
      if (!ok || !gapOk) err.push(`partitions[${i}]: 位置不合法（隔断要在房间里，门洞高 2~4 格且在隔断范围内）`);
    });
  }
  if (s.wallW !== undefined && s.wallW !== 'glass') err.push('wallW 只能是 glass');
  if (s.open !== undefined && typeof s.open !== 'boolean') err.push('open 要是 true/false');
  if (s.desc !== undefined && (typeof s.desc !== 'string' || s.desc.length > 80)) err.push('desc ≤80 字');
  return err;
}


// ---------------------------------------------------------------- 座位 / 碰撞 / 楼层检查（编译、测试共用）
/** 能坐的室内家具（key）：椅子、凳子、沙发。座位位置由占地推算，不需要在数据里手写 */
export const SEAT_KEYS: ReadonlySet<string> = new Set(['chair', 'chairup', 'stool', 'bchair_d', 'bchair_u', 'bchair_l', 'bchair_r', 'gchair', 'campchair', 'sofa']);
export interface InteriorSeat { x: number; y: number; bx: number; by: number }
/**
 * 一件能坐的家具的座位（像素）：bx,by = 椅面中心（人画在这里），x,y = 坐下时人的位置（椅子正南面一点，和宿舍里的椅子一个算法）；
 * 沙发有两个座位（沿着长边排）。fw/fh = 旋转之后的占地格数。
 */
export function seatsOfFurn(f: Pick<InteriorFurn, 'k' | 'x' | 'y' | 'top'>, fw: number, fh: number): InteriorSeat[] {
  if (!SEAT_KEYS.has(f.k) || f.top) return [];
  const n = Math.max(fw, fh), out: InteriorSeat[] = [];
  for (let i = 0; i < n; i++) {
    if (fw >= fh) { const bx = (f.x + ((i + 0.5) * fw) / n) * 16, by = (f.y + fh) * 16 - 8; out.push({ x: bx, y: (f.y + fh) * 16 + 1, bx, by }); }
    else { const bx = (f.x + 0.5) * 16, by = (f.y + ((i + 1) * fh) / n) * 16 - 8; out.push({ x: bx, y: by + 9, bx, by }); }
  }
  return out;
}

/** 碰撞格（'1' = 挡路）：北墙 3 格、东西南墙各 1 格（南墙门洞除外）、玻璃隔断（门洞除外）、地面家具的占地、数据里写死的挡块（blocks）。foot(k,rot) = 家具旋转后的占地格数 */
export function collisionRows(s: InteriorSpec, foot: (k: string, rot: number) => { fw: number; fh: number } | undefined): string[] {
  const rows: Uint8Array[] = Array.from({ length: s.h }, () => new Uint8Array(s.w));
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    let b = y < 3 || x === 0 || x === s.w - 1 || y === s.h - 1;
    if (s.exit && y === s.h - 1 && x >= s.exit.x && x < s.exit.x + s.exit.w) b = false;
    rows[y][x] = b ? 1 : 0;
  }
  for (const p of s.partitions ?? []) for (let y = p.y0; y <= p.y1; y++) if (!(p.gap && y >= p.gap.y && y < p.gap.y + p.gap.h)) rows[y][p.x] = 1;
  for (const f of s.furniture) {
    if (f.top) continue;
    const ft = foot(f.k, f.rot ?? 0); if (!ft) continue;
    for (let j = 0; j < ft.fh; j++) for (let i = 0; i < ft.fw; i++) if (rows[f.y + j]?.[f.x + i] !== undefined) rows[f.y + j][f.x + i] = 1;
  }
  for (const b of s.blocks ?? []) for (let j = 0; j < b.h; j++) for (let i = 0; i < b.w; i++) if (rows[b.y + j]?.[b.x + i] !== undefined) rows[b.y + j][b.x + i] = 1;
  return rows.map((r) => Array.from(r).join(''));
}

/**
 * 一间房的"能不能用"检查（不合格的返回原因）：楼梯落点必须是空地（stairs，硬错误）；每把椅子四周要有能站的格子（seats，
 * idx = furniture 下标；被堵死的椅子走不到，编译时会把它的座位去掉并警告，新做的房间由测试要求全部为空）。foot 同 collisionRows
 */
export function interiorProblems(s: InteriorSpec, foot: (k: string, rot: number) => { fw: number; fh: number } | undefined): { stairs: string[]; seats: { idx: number; msg: string }[] } {
  const stairs: string[] = [], seats: { idx: number; msg: string }[] = [], rows = collisionRows(s, foot), free = (x: number, y: number) => rows[y]?.[x] === '0';
  for (const t of s.stairs ?? []) {
    const l = stairLand(t);
    if (!free(Math.floor(l.x), Math.floor(l.y))) stairs.push(`楼梯 ${t.dir}→${t.to} 的落点 (${l.x.toFixed(1)}, ${l.y.toFixed(1)}) 被挡住了`);
    for (let j = 0; j < STAIR_H; j++) for (let i = 0; i < stairW(t); i++) if (!free(t.x + i, t.y + j)) stairs.push(`楼梯 ${t.dir}→${t.to} 的 (${t.x + i}, ${t.y + j}) 被家具 / 墙压住`);
  }
  s.furniture.forEach((f, idx) => {
    const ft = foot(f.k, f.rot ?? 0); if (!ft || !SEAT_KEYS.has(f.k) || f.top) return;
    let ok = false; // 椅子（或沙发）四周至少有一个能站的格子，不然走不到、也坐不上去
    for (let i = -1; i <= ft.fw && !ok; i++) for (let j = -1; j <= ft.fh && !ok; j++) {
      const inside = i >= 0 && i < ft.fw && j >= 0 && j < ft.fh, corner = (i === -1 || i === ft.fw) && (j === -1 || j === ft.fh);
      if (!inside && !corner && free(f.x + i, f.y + j)) ok = true;
    }
    if (!ok) seats.push({ idx, msg: `furniture[${idx}] ${f.k} (${f.x}, ${f.y}) 四周都被堵死，坐不上去` });
  });
  return { stairs, seats };
}

/** 一批室内之间的关系：id 唯一；楼梯成对（上去的楼梯对面一定有下来的）；同一栋楼的楼层连续、一层有门、二层以上没有；楼层号随楼梯方向变 */
export function validateInteriorSet(specs: readonly InteriorSpec[]): string[] {
  const err: string[] = [], by = new Map<string, InteriorSpec>();
  for (const s of specs) { if (by.has(s.id)) err.push(`重复的 id ${s.id}`); by.set(s.id, s); }
  for (const s of specs) {
    for (const t of s.stairs ?? []) {
      const o = by.get(t.to);
      if (!o) { err.push(`${s.id}: 楼梯指向不存在的室内 ${t.to}`); continue; }
      if (!o.stairs?.some((u) => u.to === s.id && u.dir !== t.dir)) err.push(`${s.id}: 楼梯 ${t.dir}→${t.to}，但 ${t.to} 里没有反方向通回来的楼梯`);
      if (s.building !== o.building) err.push(`${s.id} 与 ${t.to} 不在同一栋楼（building 不同）`);
      if (s.floor !== undefined && o.floor !== undefined && o.floor !== s.floor + (t.dir === 'up' ? 1 : -1)) err.push(`${s.id}（${s.floor} 层）的 ${t.dir} 楼梯通向 ${t.to}（${o.floor} 层），层号对不上`);
    }
    if (s.exit === undefined && !s.stairs?.length) err.push(`${s.id}: 没有出口也没有楼梯`);
  }
  const groups = new Map<string, InteriorSpec[]>();
  for (const s of specs) if (s.building) groups.set(s.building, [...(groups.get(s.building) ?? []), s]);
  for (const [b, g] of groups) {
    const fl = g.map((s) => s.floor ?? 0).sort((p, q) => p - q);
    if (fl.some((n, i) => n !== i + 1)) err.push(`${b}: 楼层号要从 1 连续编号，现在是 ${fl.join(',')}`);
    for (const s of g) { if ((s.floor ?? 1) === 1 && !s.exit) err.push(`${s.id}: 一层必须有南墙门洞`); if ((s.floor ?? 1) > 1 && s.exit) err.push(`${s.id}: 二层以上不该有通向室外的门洞`); }
  }
  return err;
}
