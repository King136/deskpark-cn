/**
 * 把 apps/web/dist-embed 打成单文件「嵌入版」：
 *   - 去掉 type="module" / crossorigin / manifest（file:// 下会被 CORS 拦），
 *   - CSS、JS 全部内联进同一个 .html，
 *   - 输出到项目根目录的 闲亭-嵌入版.html。
 *
 * 用法：node tools/make-embed.mjs
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'apps/web/dist-embed');
const out = join(root, '..', '闲亭-嵌入版.html');

let html = readFileSync(join(dist, 'index.html'), 'utf8');
const css = existsSync(join(dist, 'app.css')) ? readFileSync(join(dist, 'app.css'), 'utf8') : '';
const js = readFileSync(join(dist, 'app.js'), 'utf8')
  // 内联进 HTML 时必须转义：脚本里只要出现 </script 就会提前闭合标签
  .replace(/<\/script/gi, '<\\/script');

html = html
  .replace(/<link rel="manifest"[^>]*>/, '')
  .replace(/<script[^>]*src="\.\/app\.js"[^>]*><\/script>/, '')
  .replace(/<link rel="stylesheet"[^>]*>/g, '')
  // 用函数式替换：脚本里带 $ 的片段不会被当成替换模式
  .replace('</head>', () => `<style>${css}</style></head>`)
  .replace('</body>', () => `<script>${js}</script></body>`);

writeFileSync(out, html);
console.log(`embed html -> ${out} (${(html.length / 1024 / 1024).toFixed(2)} MB)`);
