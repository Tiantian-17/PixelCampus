/** 进出室内：建筑内部、我的宿舍 / 好友宿舍（淡出 → 睡眠本场景 → 启动 Interior 场景）。 */
import type { BuildingOut } from '@/shared/world-format';
import { TILE } from '@/core/const';
import { dormInteriorId } from '@/shared/dorm';
import { FARM_INTERIOR } from '@/shared/farming';
import { groundInterior } from '@/shared/teleport';
import type { WorldScene } from '../WorldScene';

export function enterInterior(sc: WorldScene, b: BuildingOut, interiorId: string | undefined = b.interior) {
  if (sc.entering || !b.interior || !interiorId) return;
  sc.entering = true;
  sc.hud.hint(null);
  const d = b.doors[0];
  sc.enterPos = { x: (d.x + d.w / 2) * TILE, y: (d.y + 1.0) * TILE };
  const cam = sc.cameras.main;
  cam.fadeOut(220, 20, 14, 10);
  cam.once('camerafadeoutcomplete', () => { sc.scene.sleep(); sc.scene.launch('Interior', { id: interiorId }); });
}

/** 服务器说可以回宿舍了（x,y = 宿舍楼门口）：淡出进入「我的宿舍」；出来时人站在这个位置 */
export function enterDorm(sc: WorldScene, x: number, y: number) {
  if (sc.entering || !sc.scene.isActive()) return; // 已经在进门，或者人已经在宿舍里
  sc.entering = true; sc.hud.hint(null);
  sc.player.setRiding(false); sc.player.setSitting(false);
  sc.dormUi.close(); sc.tpUi.close();
  sc.enterPos = { x, y };
  const cam = sc.cameras.main;
  cam.fadeOut(220, 20, 14, 10);
  cam.once('camerafadeoutcomplete', () => { sc.scene.sleep(); const v = sc.registry.get('dormVisit') as { rm?: number } | null | undefined; sc.scene.launch('Interior', { id: dormInteriorId(v ? v.rm ?? 0 : sc.dormUi.data?.rm ?? 0) }); });
}

/** 传送面板「校园农场」：人已被服务器传到北山林地，再淡出进入私人农场室内（和宿舍一样的独立空间） */
export function enterFarm(sc: WorldScene) {
  if (sc.entering || !sc.scene.isActive()) return;
  sc.entering = true; sc.hud.hint(null);
  sc.player.setRiding(false); sc.player.setSitting(false);
  sc.tpUi.close();
  sc.enterPos = null; // 位置由服务器传送落点决定：出来时人就站在北山林地
  const cam = sc.cameras.main;
  cam.fadeOut(220, 20, 14, 10);
  cam.once('camerafadeoutcomplete', () => { sc.scene.sleep(); sc.scene.launch('Interior', { id: FARM_INTERIOR }); });
}

/** 大树洞钻进农场：比传送面板那套更有「钻洞」的仪式感——慢慢暗到全黑（钻进树洞），黑一拍（钻过去的一瞬），再在另一头亮起（InteriorScene 里 treeArrive 的暖光淡入） */
export function enterFarmTree(sc: WorldScene) {
  if (sc.entering || !sc.scene.isActive()) return;
  sc.entering = true; sc.hud.hint(null);
  sc.player.setRiding(false); sc.player.setSitting(false);
  sc.tpUi.close();
  sc.enterPos = null;
  const cam = sc.cameras.main;
  cam.fadeOut(650, 0, 0, 0); // 纯黑（普通传送是暖棕）：洞里是暗的
  cam.once('camerafadeoutcomplete', () => { sc.time.delayedCall(300, () => { sc.scene.sleep(); sc.scene.launch('Interior', { id: FARM_INTERIOR, treeArrive: true }); }); }); // 全黑停 300ms 再过去
}

/** 传送面板里选了某一层：人已被服务器传到建筑门口，直接进入那一层（找到一层室内 = 这栋楼的 interior 的建筑） */
export function enterFloor(sc: WorldScene, interiorId: string) {
  const ground = groundInterior(interiorId), b = sc.wf.buildings.find((x) => x.interior === ground);
  if (b) enterInterior(sc, b, interiorId);
}
