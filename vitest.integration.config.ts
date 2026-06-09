import { defineConfig } from 'vitest/config'

// Integration tests run against a REAL MySQL (see docker-compose.yml).
// Per project policy these NEVER skip when the DB is missing — they fail loudly.
export default defineConfig({
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
