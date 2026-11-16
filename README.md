# 闲亭 DeskPark · 中文二次开发版

基于 MIT 开源的 [DeskPark](https://github.com/solitern/DeskPark) 二次开发，面向「一家人打牌 + 掌机老游戏」的场景。娱乐分只记输赢，**不可充值、不可兑换、不可转赠**。

## 当前版本 v0.3.0（2026.11）

| 模块 | 内容 |
| --- | --- |
| 牌桌 | 竖屏 / 横屏三态交互区；顶栏「旋转」顺时针 0°→90°→180°→270° 连续切换 |
| 大厅 | 4 位房号加入、玩法分类、继续上次对局；右下角版本胶囊 |
| 游戏库 | 导入 H5 / Cocos / FC / GB / GBA；单文件 HTML 与 zip 包均可直接运行（内置 Service Worker 虚拟文件服务，Cocos 相对路径资源可解析） |
| 个人中心 | 资料、主题（自动跟随系统日/夜）、桌布、四色牌、记牌器、音效、虚拟形象、联机与局域网、数据清理 |
| 联机 | WebSocket 协议；房间落盘到 `data/rooms/<code>.json`，服务端重启或换机后按房号接棒，`GET /api/lan` 供自发现 |
| 宿主对接 | `?host=1` 交权模式 + `ParkHostAPI` / `postMessage`，供模拟器与外层 App 控制工具条与横竖屏 |

## 本地构建

```bash
npm install
npm run build -w @park/web
npm run build -w @park/server
cd android && ./gradlew assembleDebug
```

构建需要 JDK 21 与 Android SDK 36。

## 文档

`docs/UI.md`（信息分层、三态、旋转、主题）、`docs/HOST.md`（宿主对接）、`docs/APP.md`（产物与构建链、房间落盘与接棒）、`docs/SCORE.md`（娱乐分）。
