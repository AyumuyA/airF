import { defineConfig } from 'vite';

export default defineConfig({
  base: '/airF/', // URLのパスを /airF/ に設定
  server: {
    port: 80,     // ポート番号なしでアクセスできるように80番に戻す
    host: true, // LANからのアクセスを許可
    proxy: {
      '/airF/socket.io': {
        target: 'http://127.0.0.1:8080',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/airF/, '') // サーバー側には元の /socket.io として転送
      }
    }
  }
});
