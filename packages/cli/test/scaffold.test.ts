import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { startApp, startProject } from '../src/index.js'

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
      await expect(readFile(join(projectDir, 'src/routes.ts'), 'utf8')).resolves.toContain(
        'defineRoutes'
      )
      await expect(readFile(join(projectDir, 'src/apps/core/app.ts'), 'utf8')).resolves.toContain(
        "name: 'core'"
      )
      await expect(readFile(join(projectDir, 'src/apps/core/routes.ts'), 'utf8')).resolves.toContain(
        "route('GET', '/health/live/'"
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
