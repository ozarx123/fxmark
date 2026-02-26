import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('error', (err, req, res) => {
            if (req.url?.startsWith('/api')) console.warn('[vite] API proxy target not reachable (is backend running on port 3000?)');
          });
        },
      },
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
        configure: (proxy) => {
          proxy.on('error', () => {
            // Backend not running; avoid spamming ECONNREFUSED. Start backend: cd backend && npm run dev
          });
        },
      },
      '/socket.io': {
        target: 'http://localhost:3000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
