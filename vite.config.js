import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    host: true, // LANからのアクセスを許可
    proxy: {
      '/socket.io': {
        target: 'http://127.0.0.1:8080',
        ws: true,
        changeOrigin: true
      }
    }
  }
});
