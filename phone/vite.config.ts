import {defineConfig} from 'vite';

// `npm run dev` proxies the API to the real server or the mock (`bun dev/mock-server.ts`), both on 8787 by default.
const target = process.env.SKETCHLINGS_SERVER ?? 'http://localhost:8787';

export default defineConfig({
  base: '/',
  server: {
    port: 5173,
    fs: {allow: ['..']}, // ../shared and ../packages/doodle-cutout
    proxy: {
      '/ws': {target, ws: true},
      '/api': target,
      '/sprites': target,
    },
  },
  worker: {format: 'es'},
  // Keep the old hashed files: open phones load the worker and the fallback chunk lazily, on their first snap.
  build: {target: 'es2020', emptyOutDir: false},
});
