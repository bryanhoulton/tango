import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { loadHandler } from '../src/index.js'

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'tango-serve-'))
}

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
})
