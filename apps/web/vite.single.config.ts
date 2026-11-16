import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 单文件构建：把网页、样式、字体、图片、打工牌引擎全部内联进一个 .html，
 * 双击就能玩（file:// 也能跑），方便直接丢进模拟器浏览器或发给别人。
 *
 * 注意：单文件版没有联机服务器，只能人机对战；
 * 要联机请用局域网包（npm start 起服务）或在 App 里填服务器地址。
 */
export default defineConfig({
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  base: './',
  build: {
    outDir: 'dist-single',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: { inlineDynamicImports: true },
    },
  },
});
