/**
 * 校园蓝图的数据格式（data/campus/*.json）。
 * 所有坐标单位均为世界 tile（浮点），原点 = 世界左上角；1 tile = 5 米 = 16 像素。
 */
export type Mat =
  | 'grass' | 'forest' | 'lawn' | 'dirt' | 'sand'
  | 'path' | 'stone' | 'paver' | 'asphalt'
  | 'water' | 'track' | 'pitch' | 'courtBlue' | 'courtGreen' | 'courtRed'
  | 'roof' | 'line' | 'lineY' | 'zebraH' | 'zebraV'
  | 'bedPink' | 'bedPurple' | 'bedYellow'
  | 'plaza' | 'plazaDark' | 'plazaWarm' | 'steps' | 'rubber' | 'boardwalk';

export type Shape = ShapeBase & { /** 蓝图 id（文件#序号:指纹），由 loadTerrain 打上，地图编辑器用它去掉/原位修改已有图形 */ bp?: string };
type ShapeBase =
  | { kind: 'poly'; mat: Mat; pts: [number, number][]; note?: string }
  | { kind: 'rect'; mat: Mat; x: number; y: number; w: number; h: number; note?: string }
  | { kind: 'ellipse'; mat: Mat; cx: number; cy: number; rx: number; ry: number; note?: string }
  /** 运动场形（两端半圆、中间直边）：rx=半宽，ry=半高（含半圆），长轴竖直 */
  | { kind: 'capsule'; mat: Mat; cx: number; cy: number; rx: number; ry: number; note?: string }
  | { kind: 'stroke'; mat: Mat; w: number; pts: [number, number][]; mark?: 'center' | 'edges' | 'both' | 'double'; note?: string; /** 两端切平（手动层的斜路用）；缺省圆头 */ flat?: boolean;
      /** 折线取自 data/campus/osm-roads.json 里的 OSM way（编译时解析，优先于 pts）；osmSlice=取点下标区间 [from,to] */
      osm?: number; osmSlice?: [number, number] };

export type Species = 'oak' | 'oakS' | 'oakL' | 'poplar' | 'ginkgo' | 'maple' | 'blossom' | 'pine' | 'willow' | 'bush';
export type PropKind = 'lamp' | 'bench' | 'sign' | 'flowerbed' | 'stone' | 'bin' | 'bike'
  | 'stadium' | 'pergola' | 'rockS' | 'bleacher' | 'floodlight' | 'parasolTable' | 'dockPost' | 'lampGold' | 'wallV' | 'gatePlaque' | 'mottoStone' | 'wallH' | 'pier' | 'nameStone' | 'bollard' | 'boulder' | 'flagpole' | 'railV' | 'fenceH' | 'fenceV' | 'reed' | 'lily' | 'pavilion' | 'fishStall' | 'hollowTree' | 'car' | 'bikeRack' | 'noticeBoard' | 'messageBoard' | 'shop' | 'campusWall' | 'fountain' | 'monument' | 'goal' | 'hoop' | 'gateSign';

/** 条目生效的世界放大范围：minS/maxS（缺省 1~∞）。放大专属的细节层用 minS:2，被放大后过稀的手摆条目用 maxS:1 */
export interface ScatterOpts { minS?: number; maxS?: number; /** 蓝图 id，同 Shape.bp */ bp?: string }
export type Scatter = ScatterOpts & (
  | { kind: 'row'; species: Species; pts: [number, number][]; spacing: number; jitter?: number; note?: string }
  | { kind: 'cluster'; species: Partial<Record<Species, number>>; poly: [number, number][]; density: number; note?: string }
  | { kind: 'prop'; prop: PropKind; pts: [number, number][]; spacing: number; note?: string }
  | { kind: 'at'; species?: Species; prop?: PropKind; x: number; y: number; note?: string }
  /** 停车位：在矩形内按行排车。orient=v 车头朝南北（竖停），occupancy=占用率 */
  | { kind: 'cars'; rect: [number, number, number, number]; orient?: 'v' | 'h'; occupancy?: number; note?: string }
  /** 围栏：沿折线逐格放置；遇到路面(沥青/步道)自动留口 */
  | { kind: 'fence'; pts: [number, number][]; note?: string; /** 铁栏杆段间每隔 N 格立一根砖柱（默认 4） */ piers?: number; /** 忽略地面材质，直接沿线放置（门墙用） */ force?: boolean; /** 竖向时用砖墙(wallV)代替铁栏 */ wall?: boolean }
  /** 世界内文字牌（用像素字体渲染在 gateSign 之上） */
  | { kind: 'label'; text: string; x: number; y: number; size?: number; color?: string; stroke?: string; /** 画在更靠前的层（像素）：牌子挂在大建筑高处时，文字要压在楼的精灵上面 */ ds?: number; /** 给文字牌起个 id，供 interact 引用（运行时可改字） */ id?: string; note?: string }
  /** 可交互区域（站进矩形按 E）：每按一次让 id 对应的文字牌依次换成 texts 里的下一句，轮完回到原文。校名石彩蛋用 */
  | { kind: 'interact'; id: string; rect: [number, number, number, number]; hint: string; /** 彩蛋文字（不填 = 不是彩蛋） */ texts?: string[]; /** 'board' = 打开留言板；'shop' = 商店；'wall' = 校园墙；'fishshop' = 精工湖钓具摊；'portal' = 传送点（打开传送面板） */ action?: 'board' | 'shop' | 'wall' | 'fishshop' | 'portal'; note?: string }
  /** 自动种植：在矩形/多边形内按噪声撒林地（避开路面与楼体），species 为权重 */
  | { kind: 'grove'; species: Partial<Record<Species, number>>; poly: [number, number][]; spacing: number; threshold?: number; note?: string }
  /** 椭圆环：沿椭圆周长按 spacing（格，保持像素节奏）排 prop，如校名石岛的石球墩 */
  | { kind: 'ring'; prop: PropKind; cx: number; cy: number; rx: number; ry: number; spacing: number; note?: string }
);

export interface Block { x: number; y: number; w: number; h: number; note?: string }

export interface Terrain {
  shapes: Shape[];
  scatter: Scatter[];
  /** 额外阻挡（围墙、水景小品等），tile 矩形 */
  blocks: Block[];
  /** 世界可走范围的外框(tile)，框外一律阻挡 */
  bounds: { x: number; y: number; w: number; h: number };
}

export type StyleName = 'brick' | 'brickPale' | 'sand' | 'white' | 'glass' | 'civic' | 'hall';
export interface WingDef { x: number; y: number; w: number; d: number; f?: number; style?: StyleName; roof?: 'flat' | 'hip' | 'solar' | 'seam'; windows?: 'grid' | 'strip' | 'band' | 'none'; door?: { tx: number; tw: number; main?: boolean }; colonnade?: boolean; rot?: number; roofTone?: number }
export type BuildingKind = 'teaching' | 'dorm' | 'library' | 'canteen' | 'admin' | 'lab' | 'sport' | 'service' | 'culture' | 'misc';
export interface BuildingDef {
  id: string;
  name: string;
  kind: BuildingKind;
  style?: StyleName;
  f?: number;
  /** true = 坐标已按地面特征量得（台阶/广场边线等），不做斜视角修正；缺省则视为"量自屋顶"，编译时按层数换算成脚印 */
  ground?: boolean;
  /** 覆盖该栋的斜视角偏移（每层 tile：[东偏, 南偏]），默认取 geo.json 的区域值 */
  par?: [number, number];
  /** true = 世界放大时尺寸不变、只移动中心（门卫亭/岗亭等本来就是小尺度的东西） */
  fixed?: boolean;
  /** 门头招牌文字（如"食堂"）：编译时在主入口上方生成世界内文字牌 */
  sign?: string;
  /** 屋面色板（0 灰 1 蓝 2 红褐 3 绿灰 4 紫灰）；不填则按建筑类型默认 */
  roofTone?: number;
  /** 可进入的室内场景 id（暂未实现的留空） */
  interior?: string;
  desc?: string;
  wings: WingDef[];
}
export interface Poi { id: string; name: string; kind: 'gate' | 'landmark' | 'spawn' | 'area'; x: number; y: number; r?: number; desc?: string }
