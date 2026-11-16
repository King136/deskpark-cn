import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * 嵌入版构建：输出**普通脚本**（IIFE）+ 单文件内联。
 *
 * 为什么单独一条流水线：不少模拟器/老旧 WebView 用 file:// 打开时不认
 * `<script type="module">`（跨域策略直接拒掉），表现是白屏。这里先正常打包成
 * 一个 IIFE 的 .js，再由 tools/make-embed.mjs 把 CSS/JS 全部内联进 index.html。
 */
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    target: 'es2018',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    modulePreload: false,
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        format: 'iife',
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]',
      },
    },
  },
});
