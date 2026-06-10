// Serverless import-graph guard, bundle level — the actual proof.
//
// Vercel builds the function bundle by tracing imports from `api/index.ts`
// with @vercel/nft (node-file-trace). This test runs the same tracer over the
// module graph a generated project's entrypoint reaches (adapters/vercel +
// server + openapi, plus the orm/router/serializers/views the scaffolded app
// imports) and asserts two invariants:
//
//   1. No UI code (react, react-dom, @tango-ts/admin-ui) is reachable. UI
//      ships as prebuilt static assets served from the CDN, never imported by
//      server code.
//   2. The traced bundle stays under a size budget, so any dependency that
//      would meaningfully inflate cold starts fails CI instead of shipping.
//
// Companion guards: `no-restricted-imports` in eslint.config.mjs (source
// level) and scripts/check-import-graph.mjs (manifest level).
import { nodeFileTrace } from '@vercel/nft'
import { existsSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(__dirname, '../../..')

// Mirrors the import graph of a generated project's Vercel function:
// api/index.ts imports adapters/vercel and src/project.ts, which imports
// server + openapi; the scaffolded core app imports orm, router, serializers,
// and views.
const ENTRY_FILES = [
  'packages/adapters/dist/vercel.js',
  'packages/server/dist/index.js',
  'packages/openapi/dist/index.js',
  // The admin API is server-side: it must never drag UI code into the bundle.
  'packages/admin/dist/index.js',
  'packages/views/dist/index.js',
  'packages/serializers/dist/index.js',
  'packages/router/dist/index.js',
  'packages/orm/dist/index.js'
].map((path) => resolve(REPO_ROOT, path))

const FORBIDDEN_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
  { pattern: /node_modules\/react\//, label: 'react' },
  { pattern: /node_modules\/react-dom\//, label: 'react-dom' },
  { pattern: /node_modules\/@tango-ts\/admin-ui\//, label: '@tango-ts/admin-ui' },
  { pattern: /packages\/admin-ui\//, label: '@tango-ts/admin-ui (workspace)' }
]

// The traced bundle is ~1.9 MB today (mysql2 + kysely dominate). Raising this
// budget is a deliberate decision about serverless cold starts, not a chore:
// justify the increase in the PR that needs it.
const BUNDLE_SIZE_BUDGET_BYTES = 3 * 1024 * 1024

async function traceFunctionBundle(): Promise<readonly string[]> {
  for (const entry of ENTRY_FILES) {
    if (!existsSync(entry)) {
      throw new Error(
        `Missing built entrypoint ${entry}. Run \`yarn build\` before the package tests.`
      )
    }
  }
  const result = await nodeFileTrace(ENTRY_FILES, { base: REPO_ROOT })
  return [...result.fileList]
}

describe('vercel function bundle (import-graph invariant)', () => {
  it('never reaches UI code from the server module graph', async () => {
    const files = await traceFunctionBundle()
    const violations = files.flatMap((file) =>
      FORBIDDEN_PATTERNS.filter(({ pattern }) => pattern.test(file)).map(
        ({ label }) => `${label}: ${file}`
      )
    )
    expect(violations).toEqual([])
  })

  it('stays under the cold-start size budget', async () => {
    const files = await traceFunctionBundle()
    let totalBytes = 0
    for (const file of files) {
      const absolute = resolve(REPO_ROOT, file)
      const stats = statSync(absolute)
      if (stats.isFile()) {
        totalBytes += stats.size
      }
    }
    const summary = `${(totalBytes / 1024 / 1024).toFixed(2)} MB across ${files.length} files (budget ${(BUNDLE_SIZE_BUDGET_BYTES / 1024 / 1024).toFixed(0)} MB)`
    expect(totalBytes, `Traced function bundle is ${summary}`).toBeLessThan(
      BUNDLE_SIZE_BUDGET_BYTES
    )
  })
})
