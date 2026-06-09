import { describe, expect, it } from 'vitest'

import { vercelHandler } from '../src/vercel.js'

describe('vercelHandler', () => {
  it('exposes the project as a Vercel fetch web handler', async () => {
    const handler = vercelHandler((request) => {
      const url = new URL(request.url)
      return Response.json({ pathname: url.pathname, method: request.method })
    })

    const response = await handler.fetch(
      new Request('https://shop.vercel.app/core/posts/', { method: 'GET' })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      pathname: '/core/posts/',
      method: 'GET'
    })
  })

  it('propagates handler rejections to the platform', async () => {
    const handler = vercelHandler(() => {
      throw new Error('boom')
    })
    await expect(
      handler.fetch(new Request('https://shop.vercel.app/'))
    ).rejects.toThrow('boom')
  })
})
