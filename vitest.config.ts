import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    root: path.resolve(__dirname),
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@electron': path.resolve(__dirname, 'electron'),
    },
  },
})
