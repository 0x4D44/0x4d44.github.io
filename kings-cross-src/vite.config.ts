import { defineConfig } from 'vite';

// The Vite project root is web/, so the repo's responsive test (which treats every
// top-level <dir>/index.html as a published document) never sees this source index.html.
// The build goes straight into the served directory, ../kings-cross/, with relative URLs
// so it works under the GitHub Pages subpath.
export default defineConfig({
  root: 'web',
  base: './',
  build: {
    outDir: '../../kings-cross',
    emptyOutDir: true,
    target: 'es2022',
  },
  server: { host: '127.0.0.1' },
});
