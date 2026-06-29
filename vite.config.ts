import { defineConfig } from 'vite';

// Static SPA, deployed to Vercel (output → dist/). No backend: maps live in
// localStorage and as downloadable/uploadable oathbound-map.json files.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    sourcemap: false,
  },
});
