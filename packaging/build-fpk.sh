#!/usr/bin/env bash
# =============================================================================
# 闲亭 DeskPark · fpk 一键打包脚本
# 产出：/workspace/deskpark-dist/deskpark-<version>-x86.fpk
# 说明：服务端是 esbuild 单文件（无需 node_modules），内置 Node 运行时 + Web 静态产物。
# =============================================================================
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="${FPK_VERSION:-0.7.0}"
ARCH="${FPK_ARCH:-x64}"
PLATFORM="${FPK_PLATFORM:-x86}"
PORT="${FPK_PORT:-8787}"
APPNAME="deskpark"

# 复用旧项目已缓存的 fnpack 与 Node 运行时
SHARED_TOOLS="/workspace/packaging/tools"
FNPACK="$SHARED_TOOLS/fnpack"
RUNTIME_DIR="$SHARED_TOOLS/node-v22.13.1-linux-${ARCH}"

SRC="$ROOT/packaging/fpk-src"
STAGE="$ROOT/packaging/dist/$APPNAME"
OUT="${FPK_OUT:-/workspace/deskpark-dist}"

log() { printf '\033[1;32m[fpk]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[fpk] 错误: %s\033[0m\n' "$*" >&2; exit 1; }

[ -x "$FNPACK" ] || die "缺少 fnpack: $FNPACK"
[ -x "$RUNTIME_DIR/bin/node" ] || die "缺少 Node 运行时: $RUNTIME_DIR"
[ -f "$ROOT/apps/server/dist/main.js" ] || die "缺少服务端产物，请先 npm run build"
[ -d "$ROOT/apps/web/dist" ] || die "缺少前端产物，请先 npm run build"

log "1/5 组装 fpk 目录 $STAGE"
rm -rf "$STAGE"
mkdir -p "$STAGE/app/apps/server" "$STAGE/app/apps/web" "$STAGE/wizard"

log "2/5 元数据与配置"
cp "$SRC/manifest" "$STAGE/manifest"
cp -r "$SRC/config" "$STAGE/config"
cp -r "$SRC/cmd" "$STAGE/cmd"
mkdir -p "$STAGE/app/ui/images"
cp -r "$SRC/app/ui/." "$STAGE/app/ui/"
cp "$ROOT/packaging/icons/ui/icon-64.png" "$STAGE/app/ui/images/icon-64.png"
cp "$ROOT/packaging/icons/ui/icon-256.png" "$STAGE/app/ui/images/icon-256.png"
sed -i "s/^version=.*/version=${VERSION}/" "$STAGE/manifest"
sed -i "s/^platform=.*/platform=${PLATFORM}/" "$STAGE/manifest"
sed -i "s/^service_port=.*/service_port=${PORT}/" "$STAGE/manifest"
sed -i "s#\"port\": \"[0-9]*\"#\"port\": \"${PORT}\"#" "$STAGE/app/ui/config"
sed -i "s#127.0.0.1:[0-9]*#127.0.0.1:${PORT}#" "$STAGE/app/ui/config"

log "3/5 应用主体（单文件服务 + Web + 运行时）"
cp "$ROOT/apps/server/dist/main.js" "$STAGE/app/apps/server/main.js"
cp -r "$ROOT/apps/web/dist/." "$STAGE/app/apps/web/dist/"
cp "$RUNTIME_DIR" -r "$STAGE/app/runtime"

log "4/5 图标与权限"
cp "$ROOT/packaging/icons/ICON.PNG" "$STAGE/ICON.PNG"
cp "$ROOT/packaging/icons/ICON_256.PNG" "$STAGE/ICON_256.PNG"
chmod +x "$STAGE/cmd/"* 2>/dev/null || true
chmod +x "$STAGE/app/runtime/bin/node" 2>/dev/null || true

log "5/5 fnpack build"
rm -f "$STAGE"/*.fpk
( cd "$STAGE" && "$FNPACK" build --directory "$STAGE" )
FPK_FILE="$(ls "$STAGE"/*.fpk 2>/dev/null | head -1 || true)"
[ -n "$FPK_FILE" ] || die "fnpack 未生成 .fpk"

mkdir -p "$OUT"
FINAL="$OUT/deskpark-${VERSION}-${PLATFORM}.fpk"
mv "$FPK_FILE" "$FINAL"
log "完成 ✅  $FINAL"
du -h "$FINAL" | awk '{print "[fpk] 包大小: "$1}'
log "安装：飞牛 fnOS → 应用中心 → 设置 → 手动安装 → 选择该 .fpk"
