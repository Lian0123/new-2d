import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  root: mode === 'demo' ? 'demo' : '.',
  base: mode === 'demo' ? (process.env.PAGES_BASE_PATH || '/new-2d/') : '/',
  publicDir: mode === 'demo' ? '../public' : 'public',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4311' },
  },
  build: { target: 'es2022', outDir: mode === 'demo' ? '../dist-demo' : 'dist', emptyOutDir: true },
}));
