import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, '.'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3901',
    },
    hmr: process.env.DISABLE_HMR !== 'true',
  },
});
