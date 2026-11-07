import { defineConfig } from 'vite';
import type { Plugin } from 'vite';

// The shared "← Almanac" back button (see /almanac-back.js at the repo root) is a classic
// script. Vite would warn that it cannot bundle it, so it is injected after bundling, in
// the production build only (the dev server does not serve the repo root).
const almanacBack = (): Plugin => ({
  name: 'almanac-back',
  apply: 'build',
  transformIndexHtml: {
    order: 'post',
    handler: () => [{ tag: 'script', attrs: { defer: true, src: '/almanac-back.js' }, injectTo: 'body' }],
  },
});

// The Vite project root is web/, so the repo's responsive test (which treats every
// top-level <dir>/index.html as a published document) never sees this source index.html.
// The build goes straight into the served directory, ../kings-cross/, with relative URLs
// so it works under the GitHub Pages subpath.
export default defineConfig({
  root: 'web',
  base: './',
  plugins: [almanacBack()],
  build: {
    outDir: '../../kings-cross',
    emptyOutDir: true,
    target: 'es2022',
    // three.js alone is about 700 kB minified, so the default 500 kB advisory always fires.
    // The size budget that matters is the gzipped total (2 MB, see the scoring rubric).
    chunkSizeWarningLimit: 1200,
  },
  server: { host: '127.0.0.1' },
});
