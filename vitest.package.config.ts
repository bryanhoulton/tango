import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/**/*.package.ts'],
    exclude: ['**/node_modules/**']
  }
})
