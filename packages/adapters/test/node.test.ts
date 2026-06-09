import { describe, expect, it } from 'vitest'

import type { Logger } from '@tango-ts/http'

import { createNodeServer, serve, type WebHandler } from '../src/index.js'

function capturingLogger(): {
  logger: Logger
  errors: Record<string, unknown>[]
} {
  const errors: Record<string, unknown>[] = []
  const noop = (): void => undefined
  return {
    errors,
    logger: {
      debug: noop,
      info: noop,
      warn: noop,
      error: (message, fields) => {
        errors.push({ message, ...fields })
      }
    }
  }
}

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

  it('returns a JSON 500 envelope and logs the error when the handler throws', async () => {
    const { logger, errors } = capturingLogger()
    const server = createNodeServer(() => {
      throw new Error('boom')
    }, { logger })
    const devServer = await serve(server, { host: '127.0.0.1', port: 0 })
    try {
      const response = await fetch(`${devServer.url}/explode/`)
      expect(response.status).toBe(500)
      expect(await response.json()).toEqual({ detail: 'Internal server error.' })
      expect(errors).toHaveLength(1)
      expect(errors[0]).toMatchObject({
        message: 'Unhandled error while handling request',
        method: 'GET',
        path: '/explode/',
        error: 'boom'
      })
    } finally {
      await devServer.close()
    }
  })

  it('rejects request bodies above maxBodyBytes with a 413', async () => {
    const { logger, errors } = capturingLogger()
    const devServer = await serve(handler, {
      host: '127.0.0.1',
      port: 0,
      logger,
      maxBodyBytes: 16
    })
    try {
      const tooLarge = await fetch(devServer.url, {
        method: 'POST',
        body: 'x'.repeat(17)
      })
      expect(tooLarge.status).toBe(413)
      expect(await tooLarge.json()).toEqual({ detail: 'Request body too large.' })
      // An oversized body is a client error, not an operator-visible failure.
      expect(errors).toHaveLength(0)

      const fits = await fetch(devServer.url, {
        method: 'POST',
        body: 'x'.repeat(16)
      })
      expect(fits.status).toBe(200)
    } finally {
      await devServer.close()
    }
  })
})
