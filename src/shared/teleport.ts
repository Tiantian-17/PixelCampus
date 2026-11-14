/**
 * 定点传送（客户端与服务器共用）：玩家点一个地点，服务器把人放到那里。
 * 地点按"地标 id"或"建筑名"从世界数据里解析（不写死坐标），所以地图编辑器改了地图也不会传到墙里；
 * 服务器再在目标附近找一个真能站的位置，并限制冷却与状态（骑车/坐着/钓鱼/战斗中不能传）。
 */
import { FARM_POI } from './farming';
export type TeleportGroup = '大门' | '教学' | '食堂' | '宿舍' | '湖边' | '其他';
/** 多层建筑的某一层：传送面板里点它，服务器照常把人传到建筑门口，传到之后客户端自动进入这一层的室内（interior = 室内 id） */
export interface TeleportFloor { label: string; interior: string }
export interface TeleportDef {
  id: string; name: string; group: TeleportGroup;
  /** 能直接传到的楼层（缺省 = 只有门口） */
  floors?: readonly TeleportFloor[];
  /** 地标 id（world.json 的 pois） */
  poi?: string;
  /** 建筑名前缀：取同名里占地最大的一栋，目标是它南面（门前）约 2.5 格 */
  building?: string;
}

const floorsOf = (prefix: string, n: number): TeleportFloor[] => Array.from({ length: n }, (_, i) => ({ label: `${i + 1}F`, interior: `${prefix}-f${i + 1}` }));
export const TELEPORTS: readonly TeleportDef[] = [
  { id: 'gate-south', name: '南门', group: '大门', poi: 'gate-south' },
  { id: 'gate-east', name: '东门', group: '大门', poi: 'gate-east' },
  { id: 'gate-west', name: '西门', group: '大门', poi: 'gate-west' },
  { id: 'library', name: '图书馆门前', group: '教学', building: '图书馆' },
  { id: 'edu-1', name: '第一教学楼', group: '教学', building: '第一公共教学楼', floors: floorsOf('edu-1', 5) },
  { id: 'edu-2', name: '第二教学楼', group: '教学', building: '第二公共教学楼', floors: floorsOf('edu-2', 5) },
  { id: 'b42', name: '42 号楼', group: '教学', building: '42号楼' },
  { id: 'canteen-1', name: '第一餐厅', group: '食堂', building: '第一学生食堂', floors: floorsOf('canteen-1', 3) },
  { id: 'canteen-2', name: '第二餐厅', group: '食堂', building: '第二学生食堂', floors: floorsOf('canteen-2', 3) },
  { id: 'canteen-3', name: '第三餐厅', group: '食堂', building: '第三学生食堂', floors: floorsOf('canteen-3', 3) },
  { id: 'dorm-1', name: '一社区', group: '宿舍', poi: 'dorm-1' },
  { id: 'dorm-2', name: '二社区', group: '宿舍', poi: 'dorm-2' },
  { id: 'dorm-3', name: '三社区', group: '宿舍', poi: 'dorm-3' },
  { id: 'dorm-4', name: '四社区', group: '宿舍', poi: 'dorm-4' },
  { id: 'intl', name: '留学生公寓', group: '宿舍', building: '留学生公寓' },
  { id: 'fish-stall', name: '精工湖钓具摊', group: '湖边', poi: 'fish-stall' },
  // 我的农场：传到北山林地后客户端淡出进入私人农场室内（和宿舍一样的独立空间，见 docs/feature/20261112-farming/）
  { id: 'farm', name: '我的农场', group: '其他', poi: FARM_POI },
];
export const TELEPORT_GROUPS: readonly TeleportGroup[] = ['大门', '教学', '食堂', '宿舍', '湖边', '其他'];

/** 传送冷却（毫秒，每个人） */
export const TP_COOLDOWN_MS = 8000;

export const teleportDef = (id: unknown): TeleportDef | undefined => (typeof id === 'string' ? TELEPORTS.find((t) => t.id === id) : undefined);

export interface TeleportCtx {
  pois: readonly { id: string; x: number; y: number }[];
  buildings: readonly { name: string; bbox: { x: number; y: number; w: number; h: number } }[];
}
/** 解析成格坐标（可能是小数）；世界里找不到这个地标/建筑返回 null */
export function teleportCell(def: TeleportDef, c: TeleportCtx): { x: number; y: number } | null {
  if (def.poi) { const p = c.pois.find((q) => q.id === def.poi); return p ? { x: p.x, y: p.y } : null; }
  if (def.building) {
    let best: TeleportCtx['buildings'][number] | undefined;
    for (const b of c.buildings) if (b.name.startsWith(def.building) && (!best || b.bbox.w * b.bbox.h > best.bbox.w * best.bbox.h)) best = b;
    return best ? { x: best.bbox.x + best.bbox.w / 2, y: best.bbox.y + best.bbox.h + 2.5 } : null;
  }
  return null;
}

/** 在像素坐标 (x,y) 附近一圈圈找能站的位置（最多 maxR 像素）；blocked(px,py) = 脚盒会不会卡住 */
export function standNear(blocked: (px: number, py: number) => boolean, x: number, y: number, maxR = 320): { x: number; y: number } | null {
  for (let r = 0; r <= maxR; r += 8) {
    const n = r === 0 ? 1 : Math.max(8, Math.round(r * 0.8));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, px = Math.round((x + Math.cos(a) * r) * 4) / 4, py = Math.round((y + Math.sin(a) * r) * 4) / 4;
      if (!blocked(px, py)) return { x: px, y: py };
    }
  }
  return null;
}

/** 某层室内 id → 这栋楼一层的室内 id（建筑的 interior 字段就是一层）：canteen-2-f3 → canteen-2-f1 */
export const groundInterior = (id: string) => id.replace(/-f\d+$/, '-f1');
