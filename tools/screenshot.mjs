/**
 * 对局界面截图（CDP）。
 *
 * 前置：
 *   1. 起服务：在 闲亭-H5局域网包 目录 `PORT=8899 STATIC_DIR=$(pwd)/web PARK_DATA_DIR=$(pwd)/data node server/main.js`
 *   2. 起浏览器：`chromium --headless=new --disable-gpu --no-sandbox --remote-debugging-port=9222 about:blank`
 *
 * 用法：node tools/screenshot.mjs 390 844 out.png 斗地主 [open|collapse|host]
 *   open     正常展开
 *   collapse 交互区收起
 *   host     交权模式（工具条 + 交互区都收走，只剩牌桌）
 */
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';

const [w, h, out, game = '斗地主', act = 'open'] = process.argv.slice(2);
const list = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const ws = new WebSocket(list.find((t) => t.type === 'page').webSocketDebuggerUrl);
let id = 0;
const pend = new Map();
const send = (m, p = {}) =>
  new Promise((r) => {
    const i = ++id;
    pend.set(i, r);
    ws.send(JSON.stringify({ id: i, method: m, params: p }));
  });
ws.on('message', (d) => {
  const m = JSON.parse(String(d));
  if (m.id && pend.has(m.id)) {
    pend.get(m.id)(m.result);
    pend.delete(m.id);
  }
});
await new Promise((r) => ws.on('open', r));
const ev = async (e) =>
  (await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true })).result
    ?.value;

await send('Emulation.setDeviceMetricsOverride', {
  width: Number(w),
  height: Number(h),
  deviceScaleFactor: 2,
  mobile: true,
});
const act2 = act.startsWith('dark:') ? act.slice(5) : act;
const hash = act2.startsWith('hash:') ? act2.slice(5) : '';
if (act.startsWith('dark:')) {
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  });
}
if (act.startsWith('dark')) {
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  });
}
const url = act === 'host' ? 'http://127.0.0.1:8899/?host=1' : `http://127.0.0.1:8899/${hash}`;
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: 'about:blank' });
await new Promise((r) => setTimeout(r, 400));
const bust = hash ? `${url.split('#')[0]}?t=${Date.now()}${hash}` : url;
await send('Page.navigate', { url: bust });
await new Promise((r) => setTimeout(r, 2300));
if (hash) {
  const shot0 = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(out, Buffer.from(shot0.data, 'base64'));
  ws.close();
  process.exit(0);
}

await ev(`(() => {
  const cards = [...document.querySelectorAll('button')].filter((b) => b.textContent.trim() === '单人');
  const host = cards.map((b) => b.closest('.game-card, .card, article, li, section') || b.parentElement);
  const i = host.findIndex((c) => c && c.textContent.includes(${JSON.stringify(game)}));
  (i >= 0 ? cards[i] : cards[0])?.click();
  return i;
})()`);
await new Promise((r) => setTimeout(r, 700));
await ev(`(() => { [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === '开始游戏')?.click(); return 1; })()`);
await new Promise((r) => setTimeout(r, 1800));

if (act.startsWith('rot')) {
  const n = Number(act.slice(3)) || 1;
  for (let i = 0; i < n; i++) {
    await ev(`(() => { [...document.querySelectorAll('.tool')].find((x) => x.textContent.trim() === '旋转')?.click(); return 1; })()`);
    await new Promise((r) => setTimeout(r, 420));
  }
}
if (act === 'collapse') {
  await ev(`(() => { [...document.querySelectorAll('.hud__head-btn')].find((x) => x.textContent.includes('收起'))?.click(); return 1; })()`);
  await new Promise((r) => setTimeout(r, 900));
}

console.log(
  await ev(`JSON.stringify({
    board: (() => { const b = document.querySelector('.board').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; })(),
    dock: document.querySelector('.hud')?.className ?? null,
    ribbon: !!document.querySelector('.turn-ribbon'),
    tools: !!document.querySelector('.table__top'),
    cls: document.querySelector('.table').className,
  })`),
);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
ws.close();
