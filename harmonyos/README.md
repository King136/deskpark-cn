# 闲亭 DeskPark · HarmonyOS 客户端工程

原生壳 + WebView 复用路线：ArkTS EntryAbility + `@ohos.web.webview` 加载闲亭 Web 应用。
原生负责导航栏、工具栏、横竖屏、权限与生命周期，游戏内核复用同一份 React Web，不重复实现。

- **包名**：`com.deskpark.park`
- **目标系统**：HarmonyOS NEXT 5.1.0（API 18）
- **构建工具**：Command Line Tools for HarmonyOS 5.1.0（hvigor 5.18.5）

## 环境准备

下载 Command Line Tools for HarmonyOS 5.1.0 并解压，然后：

```bash
export DEVECO_SDK_HOME=/path/to/command-line-tools
```

## 构建 HAP

```bash
cd harmonyos
export DEVECO_SDK_HOME=/path/to/command-line-tools
./hvigorw assembleHap --mode module -p product=default -p buildMode=release --no-daemon
# 产物：entry/build/default/outputs/default/entry-default-unsigned.hap
```

## 签名

工程内置本地自生成的调试签名材料（`signing/`，仅用于调试），三种方式：

```bash
./sign-hap.sh -i <unsigned.hap> -o <signed.hap>   # 本地自签（默认调试材料）
HARMONY_DEVICE_UDID=XXXX ./sign-hap.sh -i ... -o ...  # 绑定真机 UDID
./sign-hap.sh regenerate                          # 重新生成调试材料
./sign-hap.sh with-keys -k app.p12 -c app.cer -p profile.p7b -o <out.hap>  # 自有 AppGallery 证书
```

签名后用 hdc 安装：

```bash
$DEVECO_SDK_HOME/sdk/default/openharmony/toolchains/hdc install -r <signed.hap>
```

真机需开启「开发者模式 + USB 调试」；模拟器可直接安装未签名或调试签名包。
正式上架请用 AppGallery Connect 发布证书（`with-keys` 模式）。

## 首次使用

App 启动后在设置页填写闲亭服务端地址（局域网电脑运行 `npm start`，默认端口 8787），
确保手机与服务端在同一局域网；单机对局也在 WebView 内运行。

## 目录结构

```
harmonyos/
├── AppScope/                 应用级配置（app.json5：包名/版本）与图标
├── entry/src/main/ets/
│   ├── entryability/EntryAbility.ets
│   ├── pages/Index.ets              # Web 容器 + 工具栏 + 设置弹窗
│   └── utils/ConfigStore.ets        # 服务端地址 / UA 持久化
├── signing/                  内置调试签名材料 + autosign.py
├── hvigor/ hvigorw           构建入口（自动定位 Command Line Tools）
└── sign-hap.sh               自签名脚本
```
