import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['apps/**/*.deployed.test.ts'],
    exclude: ['**/node_modules/**'],
    testTimeout: 45_000,
    hookTimeout: 90_000,
    fileParallelism: false
  }
})
