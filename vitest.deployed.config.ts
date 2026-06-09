import { defineConfig } from 'vitest/config'

// Consumer dogfood tests. These start Docker MySQL, migrate real databases, start
// local HTTP servers through public adapters, and drive the apps over fetch().
export default defineConfig({
  test: {
    include: ['apps/**/*.deployed.test.ts'],
    exclude: ['**/node_modules/**'],
    globalSetup: ['./apps/test-support/global-setup.ts'],
    testTimeout: 45_000,
    hookTimeout: 90_000,
    fileParallelism: false
  }
})
