import Phaser from 'phaser';
import { isDormInterior } from '@/shared/dorm';
import type { WorldFile } from '@/shared/world-format';
import { Hud } from '@/ui/Hud';
import { loadGlyphs } from '@/ui/glyphs';

import { G, WD } from '@/core/paths';
import { loadProfile, saveProfile } from '@/core/profileStore';
import { CreateCharacter } from '@/ui/CreateCharacter';
import { TILE } from '@/core/const';
import { seasonAt } from '@/shared/season';
import { makeWeatherTextures } from '@/systems/weather';
import { makeFestivalTextures } from '@/art/festival';
import { SkinManager, createCharAnims, type CharsMeta } from '@/art/skins';

function allChunks(w: WorldFile) { const o: string[] = []; for (let cy = 0; cy < w.chunk.rows; cy++) for (let cx = 0; cx < w.chunk.cols; cx++) o.push(`${cx}_${cy}`); return o; }

/** generated 里数据文件改过就 +1：换成新 URL，免得浏览器拿缓存里的旧室内数据（碰撞/NPC/出口都在 interiors.json 里） */
const DATA_V = '20261132';

/** 两段式加载：先拿 world.json 与图集，再按其中的块清单拉地面块。 */
export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }
  preload() {
    const hud = new Hud();
    this.registry.set('hud', hud);
    this.load.on('progress', (p: number) => hud.setLoading(p * 0.3, '读取地图…'));
    this.load.json('world', `${WD}/world.json`);
    // 季节：由当前时间决定（服务器时间要连上才知道，这里先用本机时间；跨季节的瞬间 WorldScene 会再校正一次）
    const season = seasonAt(Date.now());
    this.registry.set('season', season);
    this.load.atlas('props', `${WD}/atlas-props-${season}.webp`, `${WD}/atlas-props.json`);
    this.load.atlas('chars', `${G}/atlas-chars.webp`, `${G}/atlas-chars.json`);
    this.load.json('charsMeta', `${G}/chars-meta.json`);
    this.load.atlas('portraits', `${G}/atlas-portraits.webp`, `${G}/atlas-portraits.json`);
    this.load.atlas('held', `${G}/atlas-held.webp`, `${G}/atlas-held.json`);
    this.load.json('interiors', `${G}/interiors.json?v=${DATA_V}`);
    this.load.atlas('furniture', `${G}/atlas-furniture.webp`, `${G}/atlas-furniture.json`);
    this.load.atlas('farmTiles', `${G}/atlas-farm.webp`, `${G}/atlas-farm.json`);   // 农场作物状态图（嫩芽/成熟，透明底）
    this.load.atlas('cats', `${G}/atlas-cats.webp`, `${G}/atlas-cats.json`);
    this.load.json('catsMeta', `${G}/cats-meta.json`);
    this.load.atlas('birds', `${G}/atlas-birds.webp`, `${G}/atlas-birds.json`);   // 精工湖的鸭子和天鹅
    this.load.json('birdsMeta', `${G}/birds-meta.json`);
    this.load.atlas('bikes', `${G}/atlas-bikes.webp`, `${G}/atlas-bikes.json`);
    this.load.json('bikesMeta', `${G}/bikes-meta.json`);
    this.load.atlas('items', `${G}/atlas-items.webp`, `${G}/atlas-items.json`);
  }
  create() {
    const hud = this.registry.get('hud') as Hud;
    const world = this.cache.json.get('world') as WorldFile;
    // 建筑图集分很多小页（按离出生点远近排）：只预载出生点附近要用的页，其余由 WorldScene 走到哪、加载哪页。
    // 老编译产物（翼体没有 w/h）仍然全部预载
    const pages = world.atlases.buildingPages ?? 1, sizeKnown = world.buildings.every((b) => b.wings.every((w) => w.w && w.h)), needPages = new Set<number>();
    const bx = world.spawn.x * TILE, by = world.spawn.y * TILE, BR = 1100;
    if (!sizeKnown) for (let i = 0; i < pages; i++) needPages.add(i);
    else for (const b of world.buildings) for (const w of b.wings) if (w.x < bx + BR && w.x + w.w! > bx - BR && w.y < by + BR && w.y + w.h! > by - BR) needPages.add(w.pg ?? 0);
    for (const i of needPages) this.load.atlas(`buildings${i}`, `${WD}/atlas-buildings-${i}.webp`, `${WD}/atlas-buildings-${i}.json`);
    // 只预载出生点附近的地面块（±800 像素，约 6 块，和 WorldScene 的流式加载范围 700 相当）；其余按视野流式加载/释放。
    // 以前预载 ±1600（12 块），多下载约 0.8 MB，而很多玩家的落点并不在出生点附近
    const sx = world.spawn.x * TILE, sy = world.spawn.y * TILE, px = world.chunk.px, waterSet = new Set(world.water.chunks), R = 800;
    for (const key of world.chunks ?? allChunks(world)) {
      const [cx, cy] = key.split('_').map(Number);
      if (cx * px > sx + R || (cx + 1) * px < sx - R || cy * px > sy + R || (cy + 1) * px < sy - R) continue;
      this.load.image(`ground_${key}`, `${WD}/ground/${this.registry.get('season')}/c_${key}.webp`);
      if (waterSet.has(key)) for (let f = 1; f < world.water.frames; f++) this.load.image(`water${f}_${key}`, `${WD}/ground/w${f}_${key}.webp`);
    }
    for (const it of this.cache.json.get('interiors') as { id: string; bg: string }[]) if (!isDormInterior(it.id)) this.load.image(it.bg, `${G}/${it.bg}.webp`); // 宿舍的底图是墙纸+地板两层，进宿舍时才按选的样式加载
    this.load.off('progress');
    this.load.on('progress', (p: number) => hud.setLoading(0.3 + p * 0.7, `铺设校园地面… ${Math.round(p * 100)}%`));
    this.load.once('complete', () => {
      this.makeAnimations();
      this.makeEffectTextures();
      hud.setLoading(1, '进入校园');
      const existing = loadProfile();
      if (existing) { this.registry.set('profile', existing); this.scene.start('World'); return; }
      // 第一次来：先新生报到（创建角色 + 学生证），存进浏览器，下次直接进入
      hud.hideLoading();
      new CreateCharacter(this.textures, { onDone: (p) => { saveProfile(p); this.registry.set('profile', p); hud.setLoading(1, '进入校园'); this.scene.start('World'); } }).open();
    });
    // 世界内文字牌用像素字体：先确保字体已加载，否则 Phaser 文本会固化成回退字体
    const go = () => this.load.start();
    loadGlyphs('河北工程大学南门西门东门').then(go, go);   // 字体是按字切片的，只加载这些字所在的那片（常用片，约 85 KB）
  }
  /** 小特效贴图：骑车扬起的尘土、摸猫冒出的爱心（程序画，不占图集） */
  private makeEffectTextures() {
    makeWeatherTextures(this); makeFestivalTextures(this);
    if (!this.textures.exists('puff')) {
      const c = this.textures.createCanvas('puff', 12, 12)!, g = c.getContext(), r = g.createRadialGradient(6, 6, 0, 6, 6, 6);
      r.addColorStop(0, 'rgba(238,228,206,0.95)'); r.addColorStop(0.55, 'rgba(226,214,188,0.55)'); r.addColorStop(1, 'rgba(220,208,180,0)');
      g.fillStyle = r; g.fillRect(0, 0, 12, 12); c.refresh();
    }
    if (!this.textures.exists('heart')) {
      const c = this.textures.createCanvas('heart', 9, 8)!, g = c.getContext();
      const px = (rows: string[], col: string) => { g.fillStyle = col; rows.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') g.fillRect(x, y, 1, 1); })); };
      px(['.##...##.', '####.####', '#########', '#########', '.#######.', '..#####..', '...###...', '....#....'], '#d6405c');
      g.fillStyle = '#ffd0da'; g.fillRect(1, 1, 2, 1); g.fillRect(1, 2, 1, 1);
      c.refresh();
    }
  }
  /** 人物与小猫的全部动画：来自 tools/art 生成的 meta（动作名、帧数、帧率、视角），不在代码里写死 */
  private makeAnimations() {
    const cm = this.cache.json.get('catsMeta') as { coats: number; anims: Record<string, { fps: number; loop: boolean; n: number }> };
    for (let c = 0; c < cm.coats; c++) for (const [id, a] of Object.entries(cm.anims)) {
      this.anims.create({ key: `cat${c}_${id}`, frameRate: a.fps, repeat: a.loop ? -1 : 0, frames: Array.from({ length: a.n }, (_, f) => ({ key: 'cats', frame: `cat${c}_${id}_${f}` })) });
    }
    const bm = this.cache.json.get('birdsMeta') as { kinds: number; anims: Record<string, { fps: number; loop: boolean; n: number }> };
    for (let k = 0; k < bm.kinds; k++) for (const [id, a] of Object.entries(bm.anims)) {
      this.anims.create({ key: `bird${k}_${id}`, frameRate: a.fps, repeat: a.loop ? -1 : 0, frames: Array.from({ length: a.n }, (_, f) => ({ key: 'birds', frame: `bird${k}_${id}_${f}` })) });
    }
    const meta = this.cache.json.get('charsMeta') as CharsMeta;
    for (let n = 0; n < meta.count; n++) createCharAnims(this.anims, `c${n}`, 'chars', meta);
    this.registry.set('skins', new SkinManager(this.game, meta));   // 玩家自定义外观的运行时合成
  }
}
