# App 打包与模拟器导入（Android）

本文对应仓库里的 `android/`（Capacitor 壳）与两个可直接分发的产物：

| 产物 | 用途 | 联机 |
|---|---|---|
| `闲亭-debug.apk` | 装进安卓模拟器/手机，像原生 App 一样玩 | 需在「设置 → 联机服务器」填地址 |
| `闲亭-H5局域网包/` | 电脑起服务，浏览器/模拟器浏览器访问 | 天然可联机（同一局域网） |
| `闲亭-单文件离线版.html` | 双击即玩，零依赖（ES Module 版） | 不可联机（服务器不在了） |
| `闲亭-嵌入版.html` | 同上，但输出的是普通脚本（IIFE），老 WebView / 模拟器用 file:// 打开不会白屏 | 不可联机 |
| `宿主示例.html` | 演示上层壳如何接管工具条与交互区（见 `docs/HOST.md`） | 跟局域网包一起用 |

---

## 一、工程结构

```
capacitor.config.ts          # appId / 应用名 / webDir / androidScheme=http
android/                     # Gradle 工程（Capacitor 8 · AGP 8.13 · compileSdk 36）
  app/src/main/AndroidManifest.xml   # usesCleartextTraffic=true（局域网 ws:// 必需）
  app/src/main/res/mipmap-*/         # 自定义图标（AI 生成，已按密度切好）
```

构建链：

```bash
npm run build -w @park/web     # 产出 apps/web/dist
npx cap sync android           # 拷进 android/app/src/main/assets/public
cd android && ./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

需要 JDK 21 与 Android SDK（platform 36 + build-tools 36 + platform-tools）。

---

## 二、三处关键改动（不改会出问题）

1. **`androidScheme: 'http'`**
   Capacitor 默认让页面跑在 `https://localhost` 源里，此时连 `ws://192.168.x.x:8787/ws` 会被 WebView 按"混合内容"拦掉。改成 `http` 源即可正常连局域网。
2. **`android:usesCleartextTraffic="true"`**
   Android 9 起默认禁止明文流量，不打开这个开关，`ws://` 直接失败、且报错很难看懂。
3. **`MainActivity` 整屏铺满 + 方向接口**
   Capacitor 默认把系统栏安全区当成 WebView 的边距加进来，横屏会在顶部留一条空白、左侧再留一条挖孔白。
   壳里改成 `decorFitsSystemWindows=false` 且吃掉所有 inset，安全区交给网页的 `env()`；同时注入
   `window.ParkHost.setOrientation()`，让顶栏的「横屏」按钮在手机锁竖屏时也能强制逆时针横屏。

---

## 三、装进模拟器

通用做法：把 `闲亭-debug.apk` 拖进模拟器窗口（MuMu / 夜神 / 逍遥 / Genymotion 都支持拖拽安装），或者在命令行：

```bash
adb install -r 闲亭-debug.apk
```

**服务器地址怎么填**（App 内没有同源服务器，必须手填）：

| 场景 | 填什么 |
|---|---|
| MuMu / 夜神 / 逍遥（与本机共用网络） | `127.0.0.1:8787` |
| 官方 AVD 模拟器 | `10.0.2.2:8787` |
| 真机连家里电脑 | `192.168.1.9:8787`（电脑的局域网 IP） |
| 部署在公网 + HTTPS | `wss://游戏.example.com/ws` |

填写位置：**设置 → 联机服务器 → 输入地址 → 保存并重连**。输入框接受 `192.168.1.9:8787` 这种简写，会自动补成 `ws://192.168.1.9:8787/ws`。

> 不填也能玩：人机对战、规则、导师、娱乐分记录都正常，只是进不了别人的房间。

---

## 四、娱乐分在 App 里

- 对局结束弹「本局结算」卡：每人分差 + 累计，可收起为胶囊；
- 等待房间显示「这一桌的娱乐分」和「我的娱乐分」；
- 分数落在服务端的 `data/scores.json`，App 端只是展示；
- 换手机不会继承分数（分数跟服务器里的身份 token 绑定，token 存在那台设备的 WebView 里）。

---

## 五、要发正式包（可选）

debug 包带调试签名，能装能玩但不适合上架。正式发布：

```bash
cd android
keytool -genkey -v -keystore release.jks -alias park -keyalg RSA -keysize 2048 -validity 10000
./gradlew assembleRelease      # 需在 android/app/build.gradle 里配 signingConfigs
```

上架前记得改 `appId`（`com.deskpark.park`）为自己的域名反写，并准备应用商店要求的图标/截图/隐私说明。

---

## 六、本次构建记录（可复核）

| 项 | 值 |
|---|---|
| 产物 | `闲亭-debug.apk`，8.0 MB |
| 包名 / 版本 | `com.deskpark.park` / 1.0（versionCode 1） |
| 应用名 | 闲亭 |
| minSdk / targetSdk | 24（Android 7.0）/ 36 |
| 启动 Activity | `com.deskpark.park.MainActivity` |
| 签名 | Android Debug（`apksigner verify` 通过） |
| 内置网页 | `assets/public/` 共 101 个文件，含 `index.html` 与全部玩法分块 |
| 图标 | 自适应图标（墨绿桌布 + 纸牌，AI 生成后按 5 档密度切图） |

构建环境：JDK 21（Temurin）、Android SDK platform 36 + build-tools 36.0.0、Gradle 8.14.3、AGP 8.13.0。

一键复现：`./tools/build-apk.sh`

模拟器安装：

```bash
adb install -r 闲亭-debug.apk
```

界面截图（390×844 视口，2 倍像素密度）见交付目录里的 `界面截图/`。


## 局域网主机与接棒（`/api/lan`）

服务端把每间房写到 `<PARK_DATA_DIR>/rooms/<房号>.json`（座位、选项、娱乐分、局数，900ms 节流、临时文件 + rename 原子替换）。

- 进程重启、或换一台设备用同一个数据目录起服务，启动时 `Hub.restoreRooms()` 把房间接回来；玩家用原房号 `join`，`Hub.adoptRoom()` 找不到内存房间就去盘上接，第一个进来的人自动成为房主。
- 房间真正解散（`removeRoom`）时才删文件，不会留下幽灵房。
- `GET /api/lan` 返回 `{app, name, rooms:[{code, gameId, seats, humans, status}]}`：其它设备/坞站可以用它做「这台上能开房」的自发现；App 里「联机与局域网 · 探测主机」就是打这个端点。
- 边界：手机自己当主机需要原生 TCP/UDP 监听，WebView 做不到；当前方案是「谁跑服务端谁当主机，数据目录一致即可接棒」，与 `docs/HOST.md` 里的模拟器接管线配合使用。
