import { defineConfig } from 'vite';

/**
 * 部署路徑（base）設定：
 * - 預設為相對路徑 './'，部署到任何子路徑（例如 GitHub Pages 的 /<repo>/）都不會出現空白畫面。
 * - 也可以用環境變數指定絕對路徑：VITE_BASE=/my-repo/ npm run build（或 BASE_PATH）。
 *   GitHub Actions 工作流程會在建置時自動帶入儲存庫名稱。
 */
const base = process.env.VITE_BASE || process.env.BASE_PATH || './';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: { manualChunks: { three: ['three'] } },
    },
  },
  server: { port: 5173, host: true },
  preview: { port: 4173, host: true },
});
