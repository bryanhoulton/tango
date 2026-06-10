// Serverless import-graph guard, manifest level.
//
// Anything reachable from a generated project's `api/index.ts` becomes part of
// the Vercel function bundle and inflates cold starts. React and the admin UI
// must ship as prebuilt static assets, never as dependencies of server-side
// packages. This script fails if any server package (or the generated project
// template) declares a forbidden package in its shipped dependency fields.
//
// Companion guards: the `no-restricted-imports` rule in eslint.config.mjs
// (source level) and the @vercel/nft trace test in packages/adapters/test
// (bundle level — the actual proof).
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'

const ROOT = new URL('..', import.meta.url).pathname

// Packages whose entire purpose is browser UI. They are exempt because their
// dist/ is served as static assets and never imported by server code.
const UI_PACKAGES = new Set(['@tango-ts/admin-ui'])

const FORBIDDEN = ['react', 'react-dom', '@tango-ts/admin-ui']

// devDependencies are excluded on purpose: they never ship in the published
// package and therefore never enter a function bundle.
const SHIPPED_DEPENDENCY_FIELDS = [
  'dependencies',
  'peerDependencies',
  'optionalDependencies'
]

function manifestPaths() {
  const paths = []
  for (const dir of ['packages', 'apps']) {
    const base = join(ROOT, dir)
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const manifest = join(base, entry.name, 'package.json')
      if (existsSync(manifest)) paths.push(manifest)
    }
  }
  // The generated project template is the closest proxy for what users deploy.
  const template = join(
    ROOT,
    'packages/cli/templates/default-project/package.json'
  )
  if (existsSync(template)) paths.push(template)
  return paths
}

const violations = []

for (const manifestPath of manifestPaths()) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (UI_PACKAGES.has(manifest.name)) continue

  for (const field of SHIPPED_DEPENDENCY_FIELDS) {
    const deps = manifest[field]
    if (deps === undefined) continue
    for (const dep of Object.keys(deps)) {
      if (FORBIDDEN.includes(dep)) {
        violations.push(
          `${relative(ROOT, manifestPath)}: "${dep}" in ${field}`
        )
      }
    }
  }
}

if (violations.length > 0) {
  console.error(
    'Import-graph guard failed. Server packages must not ship UI dependencies\n' +
      '(they would enter the Vercel function bundle and inflate cold starts):\n'
  )
  for (const violation of violations) {
    console.error(`  - ${violation}`)
  }
  process.exit(1)
}

console.log('Import-graph guard passed: no UI dependencies in server packages.')
