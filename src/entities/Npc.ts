import Phaser from 'phaser';
import { Character, type Facing } from '@/entities/Player';
import { WALK_SPEED, TILE } from '@/core/const';
import { inPlaza } from '@/shared/plaza';
import type { WorldMap } from '@/world/WorldMap';
import type { TrainerDef } from '@/shared/trainers';

/** 校园里游走的行人：随机选近处目标走过去，停一会儿再走。 */
export class Npc extends Character {
  /** 训练家 NPC 的定义（普通行人是 null） */
  trainer: TrainerDef | null = null;
  private tx: number; private ty: number;
  private wait = 0;
  /** 室内溜达范围（像素矩形）：设了就在这个范围里挑目标，也不做广场判断（室内没有广场） */
  box?: { x0: number; y0: number; x1: number; y1: number };
  constructor(scene: Phaser.Scene, x: number, y: number, look: number, readonly name: string, readonly lines: string[], private wander = true, facing: Facing = 'down') {
    super(scene, x, y, look);
    this.tx = x; this.ty = y; this.facing = facing; this.animScale = 0.6;
    this.sprite.setFrame(`c${look}_${facing}_0`);
    this.wait = Math.random() * 3;
  }
  /** 对话时让行人站住一会儿 */
  pause(sec: number) { this.wait = sec; this.moving = false; this.play(); }
  update(dt: number, world: WorldMap, rng: () => number) {
    if (!this.wander) { this.moving = false; this.play(); this.syncSprite(); return; }
    if (this.wait > 0) { this.wait -= dt; this.moving = false; this.play(); this.syncSprite(); return; }
    const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
    if (d < 2) {
      // 到达：歇一会儿并挑下一个目标（走不通会很快放弃）
      this.wait = 1 + rng() * 4;
      const a = rng() * Math.PI * 2, r = 24 + rng() * 80;
      this.tx = this.x + Math.cos(a) * r; this.ty = this.y + Math.sin(a) * r;
      if (this.box) { // 室内：夹在活动范围里，别走到墙里/田里
        this.tx = Math.min(this.box.x1, Math.max(this.box.x0, this.tx));
        this.ty = Math.min(this.box.y1, Math.max(this.box.y0, this.ty));
      } else if (inPlaza(this.tx / TILE, this.ty / TILE)) { this.tx = this.x; this.ty = this.y; } // 不往图书馆广场里走
      this.moving = false; this.play(); return;
    }
    const sp = WALK_SPEED * 0.55 * dt;
    const mx = (dx / d) * sp, my = (dy / d) * sp;
    const p = world.move(this.x, this.y, mx, my);
    const intoPlaza = !this.box && inPlaza(p.x / TILE, p.y / TILE) && !inPlaza(this.x / TILE, this.y / TILE);
    if (intoPlaza || (p.x === this.x && p.y === this.y)) { this.tx = this.x; this.ty = this.y; this.wait = 0.4; this.moving = false; }
    else { this.moving = true; this.x = p.x; this.y = p.y; }
    if (Math.abs(dx) > Math.abs(dy)) this.facing = dx > 0 ? 'right' : 'left'; else this.facing = dy > 0 ? 'down' : 'up';
    this.play(); this.syncSprite();
  }
}
