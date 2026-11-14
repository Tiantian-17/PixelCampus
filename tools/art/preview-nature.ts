/** 生成植物样片接触表 .cache/preview/nature.png（草地底，3×放大） */
import { Img } from './px.ts';
import { PAL } from './palette.ts';
import * as N from './nature.ts';
import { CACHE } from '../paths.ts';
import { join } from 'node:path';

const sheet = new Img(1180, 190);
for (let y = 0; y < sheet.h; y++) for (let x = 0; x < sheet.w; x++) {
  const g = (x * 7 + y * 13) % 11 === 0 ? PAL.grass[3] : (x + y * 3) % 17 === 0 ? PAL.grass[1] : PAL.grass[2];
  sheet.set(x, y, g);
}
let x = 8;
const put = (s: N.Sprite) => { sheet.blit(s.img, x, 150 - s.ay + 20 > 0 ? 170 - s.ay : 0); x += s.img.w + 6; };
[1, 2, 3].forEach((i) => put(N.oak(i, 0)));
[4, 5, 6].forEach((i) => put(N.oak(i, 1)));
[7, 8].forEach((i) => put(N.oak(i, 2)));
[1, 2, 3].forEach((i) => put(N.poplar(i, i % 2)));
[1, 2].forEach((i) => put(N.ginkgo(i)));
[1, 2].forEach((i) => put(N.blossom(i)));
[1, 2].forEach((i) => put(N.pine(i, i === 2)));
put(N.willow(3));
put(N.hollowTree());
[1, 2, 3].forEach((i) => put(N.bush(i)));
['pink', 'yellow', 'white', 'mix'].forEach((k, i) => put(N.flowers(i + 1, k as any)));
await sheet.savePreview(join(CACHE, 'preview', 'nature.png'), 3);
console.log('ok', x);
