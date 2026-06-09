import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)

interface PackageJson {
  readonly bin?: Record<string, string>
}

async function readPackageJson(): Promise<PackageJson> {
  const contents = await readFile(resolve('packages/cli/package.json'), 'utf8')
  return JSON.parse(contents) as PackageJson
}

describe('published CLI package', () => {
  it('runs the compiled tango bin to start a project', async () => {
    const pkg = await readPackageJson()
    const bin = pkg.bin?.['tango']
    expect(bin).toBe('./dist/main.js')
    if (bin === undefined) {
      throw new Error('Missing tango bin entry.')
    }

    const dir = await mkdtemp(join(tmpdir(), 'tango-cli-bin-'))
    try {
      const projectDir = join(dir, 'shop')
      await execFileAsync(process.execPath, [
        resolve('packages/cli', bin),
        'startproject',
        'shop',
        '--directory',
        projectDir
      ])

      await expect(readFile(join(projectDir, 'src/project.ts'), 'utf8')).resolves.toContain(
        "name: 'shop'"
      )
      await expect(readFile(join(projectDir, 'src/apps/core/routes.ts'), 'utf8')).resolves.toContain(
        "route('GET', '/health/live/'"
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
