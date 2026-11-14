/** 编译产物 world.json 的格式（工具写、游戏读）。 */
import type { BuildingKind, Poi } from './blueprint.ts';

export interface WingOut {
  /** 图集帧名（atlas: buildings） */
  k: string;
  /** 图集页号（buildings0, buildings1…） */
  pg?: number;
  /** 精灵宽高（像素）。有了它客户端不用先下载图集就能登记流式加载范围，图集页可以按需再加载；老编译产物没有，退回"全部预载" */
  w?: number; h?: number;
  /** 精灵左上角世界像素 */
  x: number; y: number;
  /** 深度排序基线（世界像素 y） */
  base: number;
  /** 阻挡矩形(tile) */
  block: { x: number; y: number; w: number; d: number };
  /** 层数（用于推算卫星图里屋顶的预测位置，校验用） */
  f: number;
  /** 旋转翼体的平面多边形(tile)，碰撞用 */
  poly?: [number, number][];
}
export interface BuildingOut {
  id: string; name: string; kind: BuildingKind; desc?: string; interior?: string;
  wings: WingOut[];
  /** 门的触发区（tile 矩形，位于门前南侧一格） */
  doors: { x: number; y: number; w: number; h: number }[];
  /** 建筑包围盒(tile)，用于名牌与小地图 */
  bbox: { x: number; y: number; w: number; h: number };
}
export interface ObjOut {
  /** 图集帧名（atlas: props） */
  k: string;
  /** 脚点世界像素 */
  x: number; y: number;
  /** 图中脚点 */
  ax: number; ay: number;
}
export interface WorldFile {
  version: number;
  /** 世界放大倍数（1 格 = 5/scale 米） */
  scale?: number;
  /** 实际存在的地面块 'cx_cy'（区域原型只含部分块）；缺省 = 全部 */
  chunks?: string[];
  tile: number; width: number; height: number;
  chunk: { px: number; cols: number; rows: number };
  water: { frames: number; chunks: string[] };
  collision: string[];
  buildings: BuildingOut[];
  objects: ObjOut[];
  /** 路灯 [x, y, 灯头离地像素(默认26)] */
  lamps: [number, number, number?][];
  /** 逐帧动画物件（如旗帜）：x,y = 左上角世界像素 */
  anims: { frames: string[]; x: number; y: number; ms: number; depth: number }[];
  /** 世界内文字牌 */
  labels: { text: string; x: number; y: number; size: number; /** 画在更靠前的层（像素） */ ds?: number; color?: string; stroke?: string; /** 在文字下画深色底牌（门头招牌） */ plate?: boolean; /** 运行时可改字的文字牌 id（见 interacts） */ id?: string }[];
  /** 可交互区域（像素坐标矩形）：站进去按 E，id 对应的文字牌依次换成 texts，轮完回到原文 */
  interacts?: { id: string; x: number; y: number; w: number; h: number; hint: string; texts: string[]; /** 'board' = 打开留言板；'shop' = 商店；'wall' = 校园墙；'fishshop' = 钓具摊；'portal' = 传送面板；不填 = 校名石彩蛋那类"换字" */ action?: 'board' | 'shop' | 'wall' | 'fishshop' | 'portal' }[];
  /** 水面格：[行 y, 起 x, 止 x)（半开区间）的连续段；钓鱼据此判断面前是不是水 */
  waterRuns?: [number, number, number][];
  /** 草地格位图（每格 1 位，行优先，base64）：精灵遭遇只在草地上发生 */
  grass?: string;
  pois: Poi[];
  spawn: { x: number; y: number };
  /** 行人可出生的路面格(tile) */
  npcSpawns: [number, number][];
  atlases: { buildings: string; props: string; buildingPages?: number };
}
