import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 嵌入版（IIFE）单文件构建。
 *
 * 与 dist-single 的区别：输出的是**普通脚本**而不是 ES Module。
 * 很多模拟器 / 老旧 WebView 用 file:// 打开页面时会直接拒绝 `<script type="module">`
 * （CORS 限制），表现就是白屏 —— 这一版把模块压成一个 IIFE，file:// 也能正常跑。
 *
 * 取舍：IIFE 没有模块作用域，打包体积略大；棋类导师的后台 worker 仍然外置，
 * 嵌入版里该功能不可用（其余玩法不受影响）。
 */
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: './',
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    target: 'es2018',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 8000,
    modulePreload: false,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
      },
    },
  },
});
