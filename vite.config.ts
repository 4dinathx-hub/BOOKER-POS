import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 5173,
    proxy: {
      // Lets `vite` alone (without netlify dev) talk to a locally running
      // `npm run dev:server` Express instance during frontend-only work.
      '/api': { target: 'http://localhost:4000', changeOrigin: true },
    },
  },
});
