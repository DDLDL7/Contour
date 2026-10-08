import { defineConfig } from 'vitest/config'

export default defineConfig({
  base: './',
  server: {
    watch: { ignored: ['**/src-tauri/**'] },
  },
  test: {
    environment: 'jsdom',
  },
})
