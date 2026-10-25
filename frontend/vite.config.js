import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// In development the browser talks only to Vite (port 5173). Vite forwards /api to the
// Express server, so the sign-in cookie is same-site and needs no CORS or cookie tricks.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:4000' },
  },
  // `npm test`: component tests in a simulated browser, with the API replaced by test doubles.
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    css: false,
  },
});
