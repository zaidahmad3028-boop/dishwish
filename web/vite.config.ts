import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Images are served as static files and don't need hot reload. Not watching them keeps the dev server
  // alive while scripts rewrite hundreds of them (OneDrive briefly locks files mid-write, which crashed the watcher).
  server: { watch: { ignored: ['**/public/images/**'] } },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false, testTimeout: 15000,
  },
});
