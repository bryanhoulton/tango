import { describe, expect, it } from 'vitest'

import { createNodeServer, serve, type WebHandler } from '../src/index.js'

const handler: WebHandler = async (request) => {
  const url = new URL(request.url)
  const body = request.method === 'POST' ? await request.text() : null
  return Response.json({
    method: request.method,
    pathname: url.pathname,
    search: url.searchParams.get('q'),
    header: request.headers.get('x-test'),
    body
  })
}

describe('Node adapter', () => {
  it('serves a Web Request handler over a local HTTP server', async () => {
    const devServer = await serve(handler, { host: '127.0.0.1', port: 0 })
    try {
      const response = await fetch(`${devServer.url}/hello/?q=ada`, {
        method: 'POST',
        headers: { 'x-test': 'ok' },
        body: 'payload'
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        method: 'POST',
        pathname: '/hello/',
        search: 'ada',
        header: 'ok',
        body: 'payload'
      })
    } finally {
      await devServer.close()
    }
  })

  it('returns a JSON 500 envelope when the handler throws', async () => {
    const server = createNodeServer(() => {
      throw new Error('boom')
    })
    const devServer = await serve(server, { host: '127.0.0.1', port: 0 })
    try {
      const response = await fetch(devServer.url)
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ detail: 'Internal server error.' })
    } finally {
      await devServer.close()
    }
  })
})
