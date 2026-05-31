import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: 'index.html',
        pm: 'src/pm/pm.html'
      }
    }
  },
  server: {
    port: 5173,
    open: true
  },
  test: {
    environment: 'jsdom',
    globals: true
  }
})
