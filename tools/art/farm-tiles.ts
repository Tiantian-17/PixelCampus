/**
 * 把 data/art/farm-scene/states/ 下的「地块状态」tile 打包成运行时图集。
 * 产物（都不入库）：public/assets/generated/{atlas-farm.png, atlas-farm.json}
 *
 * 底图不在这里（直接缩 data/art/farm-scene/farm-source.png，见 farm-bg.ts）；
 * 图集只有 12 张透明底作物状态（四阶段嫩芽 + 8 种成熟作物），
 * 运行时每块地盖一张、放大 3 倍，换状态 = setFrame。
 */
import sharp from 'sharp';
import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, GEN } from '../paths.ts';
import { Img } from './px.ts';
import { pack, type PackItem } from './pack.ts';

const DIR = join(ROOT, 'data', 'art', 'farm-scene');
const STATES = join(DIR, 'states');

async function readImg(path: string): Promise<Img> {
  const { data, info } = await sharp(path).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const img = new Img(info.width, info.height);
  img.data.set(data);
  return img;
}

export async function buildFarmAtlas(): Promise<void> {
  const files = readdirSync(STATES).filter((f) => f.endsWith('.png')).sort();
  if (!files.length) throw new Error(`农场状态素材目录为空：${STATES}（先跑 npx tsx tools/art/gen-farm-assets.ts）`);
  const items: PackItem[] = [];
  for (let i = 0; i < files.length; i += 40) {
    const batch = await Promise.all(files.slice(i, i + 40).map((f) => readImg(join(STATES, f))));
    files.slice(i, i + 40).forEach((f, k) => items.push({ key: f.replace(/\.png$/, ''), img: batch[k] }));
  }
  console.log(`  状态 tile：${files.length} 个`);
  const atlas = pack(items, 1024);
  await atlas.img.save(join(GEN, 'atlas-farm.png'));
  writeFileSync(join(GEN, 'atlas-farm.json'), JSON.stringify(atlas.json));
}
