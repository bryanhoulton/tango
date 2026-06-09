import { defineConfig } from 'vitest/config'

// Unit tests + type-level tests. No database required.
// Integration tests (*.integration.test.ts) are excluded here and run via
// vitest.integration.config.ts so the no-DB suite stays fast and hermetic.
export default defineConfig({
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
