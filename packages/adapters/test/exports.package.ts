import { describe, expect, it } from 'vitest'

describe('published adapters package', () => {
  it('resolves the ./vercel subpath export from the built artifact', async () => {
    // No vitest alias here: this resolves through package.json "exports" → dist.
    const mod = await import('@tango-ts/adapters/vercel')
    const handler = mod.vercelHandler(() => Response.json({ ok: true }))
    const response = await handler.fetch(new Request('https://shop.vercel.app/'))
    expect(await response.json()).toEqual({ ok: true })
  })
})
