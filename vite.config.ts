import { defineConfig } from 'vite';

// Relative base so the built site works under /krupal-sai-portfolio/ on GitHub Pages
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
