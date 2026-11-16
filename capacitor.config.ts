import type { CapacitorConfig } from '@capacitor/cli';

/**
 * 闲亭 Android 壳。
 *
 * - webDir 指向 Web 构建产物，`npx cap sync android` 会把网页塞进 APK。
 * - androidScheme 用 http：局域网联机是 `ws://192.168.x.x:8787/ws`，
 *   页面若跑在 https 源里，浏览器会按"混合内容"把它拦掉。
 * - allowMixedContent 双保险；AndroidManifest 里同时开了 usesCleartextTraffic。
 */
const config: CapacitorConfig = {
  appId: 'com.deskpark.park',
  appName: '闲亭',
  webDir: 'apps/web/dist',
  server: {
    androidScheme: 'http',
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
