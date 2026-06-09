import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { DevServer, ServeOptions, WebHandler } from '@tango-ts/adapters'
import { afterEach, describe, expect, it, vi } from 'vitest'

const serveMock = vi.hoisted(() =>
  vi.fn<(handler: WebHandler, options?: ServeOptions) => Promise<DevServer>>()
)

vi.mock('@tango-ts/adapters', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tango-ts/adapters')>()
  return {
    ...actual,
    serve: serveMock
  }
})

import {
  DEFAULT_SERVE_HANDLER_PATH,
  loadHandler,
  serveProject
} from '../src/index.js'

const originalCwd = process.cwd()

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'tango-serve-'))
}

afterEach(() => {
  process.chdir(originalCwd)
  serveMock.mockReset()
})

describe('loadHandler', () => {
  it('loads a default exported Web handler', async () => {
    const dir = await tempDir()
    try {
      const path = join(dir, 'handler.mjs')
      await writeFile(
        path,
        "export default function handler() { return Response.json({ ok: true }) }\n"
      )

      const handler = await loadHandler(path)
      const response = await handler(new Request('https://example.test/'))

      expect(await response.json()).toEqual({ ok: true })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('loads a default exported router-like object with handle()', async () => {
    const dir = await tempDir()
    try {
      const path = join(dir, 'router.mjs')
      await writeFile(
        path,
        "export default { handle() { return Response.json({ routed: true }) } }\n"
      )

      const handler = await loadHandler(path)
      const response = await handler(new Request('https://example.test/'))

      expect(await response.json()).toEqual({ routed: true })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reloads a handler module when cache busting changes', async () => {
    const dir = await tempDir()
    try {
      const path = join(dir, 'handler.mjs')
      await writeFile(
        path,
        "export default function handler() { return Response.json({ version: 1 }) }\n"
      )
      const firstHandler = await loadHandler(path, { cacheBust: '1' })
      await writeFile(
        path,
        "export default function handler() { return Response.json({ version: 2 }) }\n"
      )

      const secondHandler = await loadHandler(path, { cacheBust: '2' })

      const firstResponse = await firstHandler(new Request('https://example.test/'))
      const secondResponse = await secondHandler(new Request('https://example.test/'))
      expect(await firstResponse.json()).toEqual({ version: 1 })
      expect(await secondResponse.json()).toEqual({ version: 2 })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})

describe('serveProject', () => {
  it('defaults to the generated project handler path', async () => {
    const dir = await tempDir()
    try {
      await mkdir(join(dir, 'dist'))
      await writeFile(
        join(dir, DEFAULT_SERVE_HANDLER_PATH),
        "export default function handler() { return Response.json({ ok: true }) }\n"
      )
      const servedBodies: unknown[] = []
      serveMock.mockImplementationOnce(async (handler, options) => {
        expect(options).toEqual({ host: '127.0.0.1', port: 0 })
        const response = await handler(new Request('https://example.test/'))
        servedBodies.push(await response.json())
        return {
          server: {} as DevServer['server'],
          url: 'http://127.0.0.1:8000',
          close: async () => {}
        }
      })
      process.chdir(dir)

      await serveProject({ port: 0 })

      expect(serveMock).toHaveBeenCalledTimes(1)
      expect(servedBodies).toEqual([{ ok: true }])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
