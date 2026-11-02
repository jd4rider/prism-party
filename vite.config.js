import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: { port: 5183, open: false },
  build: {
    outDir: 'dist-web',
    emptyOutDir: true,
    assetsInlineLimit: 0,
  },
})
