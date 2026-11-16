# 宿主对接：把工具条和交互区交出去

闲亭对局页默认自己画「顶部工具条」和「底部/右侧交互区」。如果外面上了一层壳（模拟器、渠道 SDK、
自己的 WebView 容器），这两块可以让壳来画，网页只留牌桌本体 —— 这样壳的 UI 和游戏画面不会互相打架。

## 一、三种接入方式

| 场景 | 怎么开 | 说明 |
|---|---|---|
| 直接在浏览器/WebView 里玩 | 正常地址 | 工具条 + 交互区都由网页自己画 |
| 壳接管界面 | `index.html?host=1` | 默认收起工具条与交互区，牌桌占满整屏 |
| file:// 打开或老 WebView | `闲亭-嵌入版.html#host=1` | 嵌入版是普通脚本（IIFE），不依赖 ES Module |

没带 query 的壳可以用 hash 传参：`#host=1`、`#tools=1&dock=1` 与 `?host=1` 等价。
单独关掉某一块：`?tools=0` 或 `?dock=0`。

## 二、宿主 → 游戏

```js
const frame = document.querySelector('iframe').contentWindow;

// 显示/隐藏顶部工具条与交互区
frame.postMessage({ park: 'host', type: 'chrome', tools: true, dock: true }, '*');

// 屏幕方向：原生壳硬锁，浏览器只做 CSS 旋转兜底
frame.postMessage({ park: 'host', type: 'orientation', mode: 'landscape' }, '*');
// mode: 'landscape' | 'portrait' | 'auto'
```

同页（没有 iframe）时也可以直接调：

```js
window.ParkHostAPI.setChrome(true, true);   // 工具条, 交互区
window.ParkHostAPI.setOrientation('landscape');
```

## 三、游戏 → 宿主

```js
window.addEventListener('message', (e) => {
  const d = e.data;
  if (d?.park !== 'park') return;
  // d.type === 'ready'  → { host: 'native' | 'web' }
  // d.type === 'state'  → 牌桌状态（预留）
});
```

## 四、Android 原生壳

`MainActivity` 注入了 `window.ParkHost`：

```js
window.ParkHost.setOrientation('landscape'); // 逆时针横屏，手机锁着竖屏也会转
window.ParkHost.setOrientation('portrait');
window.ParkHost.setOrientation('auto');
window.ParkHost.setSystemBars('0');          // 沉浸：隐藏状态栏/导航栏
window.ParkHost.setSystemBars('1');
window.ParkHost.orientation();               // 'landscape' | 'portrait'
```

壳里同时做了全屏铺满：不再给 WebView 加系统栏占位，安全区交给网页的
`env(safe-area-inset-*)`。横屏顶部那条空白就是原来系统栏占位留下的，现已去掉。

## 五、为什么模拟器可能打不开 H5

常见三个原因，按顺序排查：

1. **拿到的是 zip / 文件夹**：多数模拟器只认单个 html 文件。用 `闲亭-嵌入版.html`。
2. **要求 ES Module**：普通单文件版用的是 `<script type="module">`，老 WebView 会因跨域策略直接拒绝，
   白屏。嵌入版是 IIFE 普通脚本，不挑环境。
3. **要联机**：file:// 页面连不上 `ws://`，需要先起本地服务（`启动-Windows.bat` / `启动-Mac-Linux.command`），
   再让模拟器打开 `http://127.0.0.1:8899/?host=1`。

`宿主示例.html` 是一个可以直接跑的对接 demo：上层按钮模拟壳，下面 iframe 里是游戏。
