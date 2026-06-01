import { defineConfig } from 'vite'

// När GitHub Actions bygger sätts NODE_ENV=production automatiskt.
// I produktion behöver vi base: '/natsim/' så att assets hittas på
// https://vinstmaximering.github.io/natsim/
// Lokalt (npm run dev) används '/' så att hot-reload fungerar normalt.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/natsim/' : '/',
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
}))
