import { defineConfig } from 'vitest/config'

// Integration tests run against a REAL MySQL (see docker-compose.yml).
// Per project policy these NEVER skip when the DB is missing — they fail loudly.
export default defineConfig({
  resolve: {
    alias: {
      '@tango-ts/adapters': new URL('./packages/adapters/src/index.ts', import.meta.url).pathname,
      '@tango-ts/auth': new URL('./packages/auth/src/index.ts', import.meta.url).pathname,
      '@tango-ts/cli': new URL('./packages/cli/src/index.ts', import.meta.url).pathname,
      '@tango-ts/contrib-auth': new URL('./packages/contrib-auth/src/index.ts', import.meta.url).pathname,
      '@tango-ts/core-types': new URL('./packages/core-types/src/index.ts', import.meta.url).pathname,
      '@tango-ts/http': new URL('./packages/http/src/index.ts', import.meta.url).pathname,
      '@tango-ts/migrations': new URL('./packages/migrations/src/index.ts', import.meta.url).pathname,
      '@tango-ts/openapi': new URL('./packages/openapi/src/index.ts', import.meta.url).pathname,
      '@tango-ts/orm': new URL('./packages/orm/src/index.ts', import.meta.url).pathname,
      '@tango-ts/router': new URL('./packages/router/src/index.ts', import.meta.url).pathname,
      '@tango-ts/serializers': new URL('./packages/serializers/src/index.ts', import.meta.url).pathname,
      '@tango-ts/server': new URL('./packages/server/src/index.ts', import.meta.url).pathname,
      '@tango-ts/views': new URL('./packages/views/src/index.ts', import.meta.url).pathname
    }
  },
  test: {
    include: ['packages/**/*.integration.test.ts'],
    exclude: ['**/node_modules/**'],
    // A real DB connection + schema setup needs more than the 5s default.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // MySQL state is shared; run integration files serially to avoid races.
    fileParallelism: false
  }
})
