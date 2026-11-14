/** 一键重建所有生成资源：人物 -> 世界（地面/建筑/对象/碰撞）-> 精灵 -> 转 WebP（客户端加载的格式）。 npm run assets */
import { spawnSync } from 'node:child_process';
import { ROOT } from './paths.ts';
for (const s of ['tools/art/index.ts', 'tools/world/compile.ts', 'tools/world/interiors.ts', 'tools/mons/build-art.ts', 'tools/mons/cat-art.ts', 'tools/assets/webp.ts']) {
  // Windows 下 npx 是 npx.cmd，不加 shell 会直接 ENOENT（脚本静默退出、一个产物都不生成）；用整条命令字符串避免 shell 拼接告警
  const r = spawnSync(`npx tsx ${s}`, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (r.status !== 0) { console.error(`资源生成失败：${s}`); process.exit(r.status ?? 1); }
}
