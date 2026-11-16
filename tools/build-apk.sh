#!/usr/bin/env bash
# 一键打 Android debug 包（闲亭 · 娱乐分版）
#
# 依赖：JDK 21、Android SDK（platform 36 / build-tools 36 / platform-tools）
# 用法：./tools/build-apk.sh
set -euo pipefail
cd "$(dirname "$0")/.."

: "${JAVA_HOME:=/usr/lib/jvm/java-21-openjdk-amd64}"
: "${ANDROID_SDK_ROOT:=${HOME}/android-sdk}"
export JAVA_HOME ANDROID_SDK_ROOT ANDROID_HOME="$ANDROID_SDK_ROOT"

echo "==> 1/3 构建网页"
npm run build -w @park/web

echo "==> 2/3 同步进 Android 工程"
npx cap sync android

echo "==> 3/3 Gradle 打包"
cd android
./gradlew assembleDebug --console=plain

APK="app/build/outputs/apk/debug/app-debug.apk"
echo
echo "完成：android/$APK"
ls -lh "$APK"
