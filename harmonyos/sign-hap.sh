#!/usr/bin/env bash
#
# 闲亭 DeskPark - HarmonyOS HAP 自签名脚本
#
# 说明:
#   本项目内置了一套本地自生成的调试签名材料 (signing/ 目录), 用于对构建出的
#   未签名 HAP 进行本地自签名。签名后的 HAP 可直接:
#     - 安装到华为模拟器 (无需设备 UDID)
#     - 安装到开启"开发者模式"的真机 (需把设备 UDID 通过 HARMONY_DEVICE_UDID 传入)
#
#   正式发布到应用市场 / 普通真机, 请在 AppGallery Connect 申请证书与 profile,
#   然后用 ./sign-hap.sh with-keys 模式签名 (见下方说明)。
#
# 用法:
#   ./sign-hap.sh                        对 dist 中未签名 HAP 做本地自签
#   ./sign-hap.sh -i a.hap -o b.hap     指定输入/输出
#   HARMONY_DEVICE_UDID=XXXX ./sign-hap.sh   绑定真机 UDID
#   ./sign-hap.sh regenerate             重新生成一套新的调试签名材料
#   ./sign-hap.sh with-keys -k app.p12 -c app.cer -p profile.p7b [-o signed.hap]
#                                      使用自有 AppGallery Connect 证书签名

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SIGNING_DIR="$SCRIPT_DIR/signing"

# ---- 定位 Command Line Tools ----
find_clt() {
    local candidates=("$DEVECO_SDK_HOME" "$HOME/command-line-tools" "/opt/command-line-tools"
        "/usr/local/command-line-tools" "$SCRIPT_DIR/command-line-tools")
    for dir in "${candidates[@]}"; do
        [ -n "$dir" ] && [ -f "$dir/sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar" ] && { echo "$dir"; return 0; }
    done
    return 1
}
CLT_HOME="$(find_clt)" || {
    echo "错误: 未找到 Command Line Tools for HarmonyOS (hap-sign-tool.jar)。"
    echo "请先下载解压: https://developer.huawei.com/consumer/cn/download/command-line-tools-for-hmos"
    exit 1
}
SIGN_JAR="$CLT_HOME/sdk/default/openharmony/toolchains/lib/hap-sign-tool.jar"
HDC="$CLT_HOME/sdk/default/openharmony/toolchains/hdc"

# ---- 参数解析 ----
MODE="local"
IN_HAP="$SCRIPT_DIR/../dist/fnos-mobile-harmonyos-unsigned.hap"
OUT_HAP="$SCRIPT_DIR/../dist/fnos-mobile-harmonyos-signed.hap"
USER_P12=""
USER_CER=""
USER_PROFILE=""

while [ $# -gt 0 ]; do
    case "$1" in
        with-keys) MODE="with-keys" ;;
        regenerate) MODE="regenerate" ;;
        -i) IN_HAP="$2"; shift 2 ;;
        -o) OUT_HAP="$2"; shift 2 ;;
        -k) USER_P12="$2"; shift 2 ;;
        -c) USER_CER="$2"; shift 2 ;;
        -p) USER_PROFILE="$2"; shift 2 ;;
        -h|--help) sed -n '2,22p' "$0"; exit 0 ;;
        *) echo "未知参数: $1"; exit 1 ;;
    esac
done

[ -f "$IN_HAP" ] || { echo "错误: 未找到未签名 HAP: $IN_HAP"; exit 1; }

KEY_PWD="${KEY_PWD:-123456}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# ============ 模式: regenerate (重新生成调试签名材料) ============
if [ "$MODE" = "regenerate" ]; then
    echo "==> 使用官方 autosign.py 重新生成调试签名材料"
    [ -f "$SIGNING_DIR/autosign.py" ] || { echo "错误: 缺少 signing/autosign.py"; exit 1; }
    SD="$WORK/gen"; mkdir -p "$SD"
    cp "$SIGN_JAR" "$SD/hap-sign-tool.jar"
    cp "$SIGNING_DIR/autosign.py" "$SD/"
    cp "$SIGNING_DIR/createRootAndSubCert.config" "$SD/"
    cp "$SIGNING_DIR/createAppCertAndProfile.config" "$SD/"
    # 重写 config 中的路径为本工作目录
    sed -i "s#^config.signtool=.*#config.signtool=$SD/hap-sign-tool.jar#" "$SD"/*.config
    sed -i "s#^config.targetDir=.*#config.targetDir=$SD#" "$SD"/*.config
    ( cd "$SD" && python3 autosign.py createRootAndSubCert )
    ( cd "$SD" && python3 autosign.py createAppCertAndProfile )
    cp "$SD/keys.p12" "$SD/app-cert.cer" "$SD/profile.p7b" "$SIGNING_DIR/"
    echo "==> 已更新 signing/{keys.p12,app-cert.cer,profile.p7b}"
    exit 0
fi

# ============ 模式: with-keys (用户自有证书) ============
if [ "$MODE" = "with-keys" ]; then
    echo "==> 使用自有证书签名 (AppGallery Connect 流程)"
    [ -f "$USER_P12" ] || { echo "错误: 缺少自有 p12 (-k)"; exit 1; }
    [ -f "$USER_CER" ] || { echo "错误: 缺少自有 app 证书 cer (-c)"; exit 1; }
    [ -f "$USER_PROFILE" ] || { echo "错误: 缺少自有 profile.p7b (-p)"; exit 1; }
    java -jar "$SIGN_JAR" sign-app -mode localSign -keyAlias appKey -keyPwd "$KEY_PWD" \
        -appCertFile "$USER_CER" -profileFile "$USER_PROFILE" -inFile "$IN_HAP" \
        -signAlg SHA384withECDSA -keystoreFile "$USER_P12" -keystorePwd "$KEY_PWD" \
        -outFile "$OUT_HAP" -compatibleVersion 18
    echo "==> 已签名: $OUT_HAP"
    exit 0
fi

# ============ 模式: local (内置调试材料本地自签) ============
[ -f "$SIGNING_DIR/keys.p12" ] && [ -f "$SIGNING_DIR/app-cert.cer" ] && [ -f "$SIGNING_DIR/profile.p7b" ] || {
    echo "错误: 缺少 signing/ 签名材料, 请先运行 ./sign-hap.sh regenerate"; exit 1;
}

echo "==> 生成调试 profile.json (development-certificate)"
# 取 app 证书叶证书 (app-cert.cer 为证书链, 仅取首段)
python3 - "$SIGNING_DIR/app-cert.cer" <<'PY'
import re, json, sys
data = open(sys.argv[1]).read()
leaf = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', data, re.S)[0]
prof = {
  "version-name":"0.5.0","version-code":500000,"uuid":"deskpark-auto-debug","type":"debug",
  "bundle-info":{"bundle-name":"com.deskpark.park","apl":"normal","app-feature":"hos_normal_app",
    "development-certificate": leaf + "\n"},
  "restricted-permissions":[],
  "device-ids": [],
  "validity":{"not-before":1,"not-after":9223372036854775806},
  "permissions":{}
}
open("profile.json","w").write(json.dumps(prof, indent=2))
print("profile.json 已生成")
PY

echo "==> 签名 profile -> profile.p7b"
java -jar "$SIGN_JAR" sign-profile -mode localSign -keyAlias "profile-key" -keyPwd "$KEY_PWD" \
    -profileCertFile "$SIGNING_DIR/profile.p7b" -inFile profile.json -signAlg SHA384withECDSA \
    -keystoreFile "$SIGNING_DIR/keys.p12" -keystorePwd "$KEY_PWD" -outFile "$WORK/profile.p7b"

echo "==> 签名 HAP"
java -jar "$SIGN_JAR" sign-app -mode localSign -keyAlias "app-key" -keyPwd "$KEY_PWD" \
    -appCertFile "$SIGNING_DIR/app-cert.cer" -profileFile "$WORK/profile.p7b" -inFile "$IN_HAP" \
    -signAlg SHA384withECDSA -keystoreFile "$SIGNING_DIR/keys.p12" -keystorePwd "$KEY_PWD" \
    -outFile "$OUT_HAP" -compatibleVersion 18

echo "==> 已签名: $OUT_HAP"
echo ""
echo "安装到已连接设备/模拟器: $HDC install -r \"$OUT_HAP\""
