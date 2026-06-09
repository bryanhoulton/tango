import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { startApp, startProject } from '../src/index.js'

interface ProjectPackageJson {
  readonly name: string
  readonly scripts: Record<string, string>
}

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'tango-scaffold-'))
}

describe('scaffold commands', () => {
  it('startProject creates a root project with nested app layout', async () => {
    const dir = await tempDir()
    try {
      const projectDir = join(dir, 'shop')

      await startProject({ name: 'shop', directory: projectDir })

      await expect(readFile(join(projectDir, 'src/project.ts'), 'utf8')).resolves.toContain(
        'defineProject'
      )
      await expect(readFile(join(projectDir, 'src/project.ts'), 'utf8')).resolves.toContain(
        "name: 'shop'"
      )
      await expect(readFile(join(projectDir, 'src/project.ts'), 'utf8')).resolves.toContain(
        "mysqlFromEnv({ projectName: 'shop' })"
      )
      const packageJson = await readFile(join(projectDir, 'package.json'), 'utf8')
      const parsedPackageJson = JSON.parse(packageJson) as ProjectPackageJson
      expect(parsedPackageJson.name).toBe('shop')
      expect(parsedPackageJson.scripts['clean']).toBe('rm -rf dist')
      expect(parsedPackageJson.scripts['serve']).toBe(
        'yarn clean && yarn build && tango serve'
      )
      expect(parsedPackageJson.scripts['dev']).toBe(
        'tango dev --handler ./dist/project.js --watch ./src --build "yarn clean && yarn build"'
      )
      expect(parsedPackageJson.scripts['makemigrations']).toBe(
        'yarn clean && yarn build && tango makemigrations --app ./dist/apps/core/app.js --migrations-dir ./src/apps/core/migrations --name auto'
      )
      expect(parsedPackageJson.scripts['migrate']).toBe(
        'yarn clean && yarn build && tango migrate --app ./dist/apps/core/app.js --migrations-dir ./dist/apps/core/migrations --database shop'
      )
      expect(parsedPackageJson.scripts['check']).toBe(
        'yarn clean && yarn build && tango check --app ./dist/apps/core/app.js --migrations-dir ./src/apps/core/migrations'
      )
      await expect(readFile(join(projectDir, 'tsconfig.json'), 'utf8')).resolves.toContain(
        '"rootDir": "src"'
      )
      await expect(readFile(join(projectDir, 'tsconfig.json'), 'utf8')).resolves.toContain(
        '"outDir": "dist"'
      )
      await expect(readFile(join(projectDir, 'src/routes.ts'), 'utf8')).resolves.toContain(
        'defineRoutes'
      )
      await expect(readFile(join(projectDir, 'src/apps/core/app.ts'), 'utf8')).resolves.toContain(
        "name: 'core'"
      )
      await expect(readFile(join(projectDir, 'src/apps/core/routes.ts'), 'utf8')).resolves.toContain(
        "route('GET', '/health/live/'"
      )
      expect(parsedPackageJson.scripts['start']).toBe('tango serve')
      await expect(readFile(join(projectDir, 'src/project.ts'), 'utf8')).resolves.toContain(
        'middleware: [requestLog(), securityHeaders()]'
      )
      // Deployment assets, with dotfiles renamed from their __DOT__ template names.
      await expect(readFile(join(projectDir, '.gitignore'), 'utf8')).resolves.toContain(
        'node_modules'
      )
      await expect(readFile(join(projectDir, '.dockerignore'), 'utf8')).resolves.toContain(
        '.env'
      )
      await expect(readFile(join(projectDir, '.env.example'), 'utf8')).resolves.toContain(
        'TANGO_DB_NAME=shop'
      )
      const dockerfile = await readFile(join(projectDir, 'Dockerfile'), 'utf8')
      expect(dockerfile).toContain('EXPOSE 8000')
      expect(dockerfile).toContain('tango')
      await expect(readFile(join(projectDir, 'README.md'), 'utf8')).resolves.toContain(
        '# shop'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('startApp creates a new nested app scaffold', async () => {
    const dir = await tempDir()
    try {
      await startApp({ name: 'billing', directory: join(dir, 'billing') })

      await expect(readFile(join(dir, 'billing/app.ts'), 'utf8')).resolves.toContain(
        "name: 'billing'"
      )
      await expect(readFile(join(dir, 'billing/routes.ts'), 'utf8')).resolves.toContain(
        'defineRoutes'
      )
      await expect(readFile(join(dir, 'billing/models.ts'), 'utf8')).resolves.toContain(
        'export const models'
      )
      await expect(readFile(join(dir, 'billing/serializers.ts'), 'utf8')).resolves.toContain(
        'serializers'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
