import { defineConfig } from 'vitest/config'

// Unit tests + type-level tests. No database required.
// Integration tests (*.integration.test.ts) are excluded here and run via
// vitest.integration.config.ts so the no-DB suite stays fast and hermetic.
export default defineConfig({
  resolve: {
    alias: {
      '@tango-ts/adapters': new URL('./packages/adapters/src/index.ts', import.meta.url).pathname,
      '@tango-ts/admin': new URL('./packages/admin/src/index.ts', import.meta.url).pathname,
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
    include: ['packages/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/*.integration.test.ts'],
    typecheck: {
      enabled: true,
      include: ['packages/**/*.test-d.ts'],
      tsconfig: './tsconfig.json'
    }
  }
})
