import { defineConfig, loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig(({ mode }) => {
  // 联机代理目标：默认本机 `npm run server`（8787）。
  // 想在本地直连测试服，就在 .env.local 里写 PC_PROXY=https://<测试服地址>（可带隐藏路径前缀），
  // 之后 /ws、/up、/img 都转到那台机器，客户端不用改任何代码。
  const target = (loadEnv(mode, process.cwd(), '').PC_PROXY || 'http://127.0.0.1:8787').replace(/\/+$/, '');
  const url = new URL(target);
  const prefix = url.pathname.replace(/\/+$/, ''); // 隐藏路径前缀，如 /pixel-test-xxx
  const rewrite = prefix ? (p: string) => prefix + p : undefined;
  const origin = url.origin;
  // 测试服会用 Origin 拦 403（浏览器一定会带 Origin: http://127.0.0.1:5173），所以转发时改成测试服自己的源、Host 也一并改
  const remote = !['127.0.0.1', 'localhost', '::1'].includes(url.hostname);
  const cross = { changeOrigin: remote, ...(remote ? { headers: { Origin: origin } } : {}) };
  return {
    resolve: { alias: { '@': r('./src'), '@data': r('./data') } },
    server: {
      host: '127.0.0.1', port: 5173,
      proxy: {
        '/ws': { target: origin.replace(/^http/, 'ws'), ws: true, rewrite, ...cross },
        '/up': { target: origin, rewrite, ...cross },
        '/img': { target: origin, rewrite, ...cross },
      },
    }, // 联机：把 /ws 转给 npm run server；地点留言板的图片上传（/up）和读取（/img）也转过去，和线上一样同源
    build: {
      target: 'es2022', chunkSizeWarningLimit: 2000,
      // Phaser 单独打成一个文件（约 1.2 MB 原始 / 330 KB 压缩）：它几乎不变，文件名里的哈希也就不变，
      // 玩家浏览器缓存后，之后每次部署只需重新下载我们自己的代码（约 1/3），不用每次都把引擎再下一遍
      rollupOptions: { output: { manualChunks: (id) => (id.includes('node_modules/phaser/') ? 'phaser' : undefined) } },
    },
  };
});
