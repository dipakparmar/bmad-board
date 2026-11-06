import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  appType: 'spa',
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 33713,
    strictPort: true,
    // The local server (`bun run server`) answers /api; the board works without it, read-only.
    proxy: { '/api': { target: 'http://127.0.0.1:33714', changeOrigin: false } },
  },
  preview: { host: '127.0.0.1', port: 33713, strictPort: true },
});
