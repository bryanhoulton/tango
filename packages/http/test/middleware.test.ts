import { describe, expect, it } from 'vitest'

import {
  applyMiddleware,
  bodyLimit,
  cors,
  jsonResponse,
  requestLog,
  securityHeaders,
  type Logger,
  type Middleware
} from '../src/index.js'

const okHandler = (): Response => jsonResponse({ ok: true })

function capturingLogger(): { logger: Logger; lines: { level: string; fields: Record<string, unknown> }[] } {
  const lines: { level: string; fields: Record<string, unknown> }[] = []
  const log =
    (level: string) =>
    (message: string, fields?: Record<string, unknown>): void => {
      lines.push({ level, fields: { message, ...fields } })
    }
  return {
    lines,
    logger: {
      debug: log('debug'),
      info: log('info'),
      warn: log('warn'),
      error: log('error')
    }
  }
}

describe('applyMiddleware', () => {
  it('runs middleware outermost-first and can rewrite request and response', async () => {
    const order: string[] = []
    const outer: Middleware = async (request, next) => {
      order.push('outer-in')
      const response = await next(request)
      order.push('outer-out')
      return response
    }
    const inner: Middleware = async (request, next) => {
      order.push('inner-in')
      const response = await next(request)
      order.push('inner-out')
      return response
    }
    const handler = applyMiddleware(() => {
      order.push('handler')
      return jsonResponse({ ok: true })
    }, [outer, inner])

    const response = await handler(new Request('https://api.test/'))
    expect(response.status).toBe(200)
    expect(order).toEqual(['outer-in', 'inner-in', 'handler', 'inner-out', 'outer-out'])
  })
})

describe('cors', () => {
  const handler = applyMiddleware(okHandler, [
    cors({ origins: ['https://app.example.com'] })
  ])

  it('answers preflight OPTIONS without reaching the handler', async () => {
    const handlerThatThrows = applyMiddleware(() => {
      throw new Error('router should never see preflights')
    }, [cors({ origins: ['https://app.example.com'] })])

    const response = await handlerThatThrows(
      new Request('https://api.test/posts/', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.example.com',
          'access-control-request-method': 'POST'
        }
      })
    )

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com'
    )
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'authorization'
    )
  })

  it('rejects preflights from unlisted origins', async () => {
    const response = await handler(
      new Request('https://api.test/posts/', {
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.example.com',
          'access-control-request-method': 'POST'
        }
      })
    )
    expect(response.status).toBe(403)
  })

  it('decorates actual responses for allowed origins only', async () => {
    const allowed = await handler(
      new Request('https://api.test/', {
        headers: { origin: 'https://app.example.com' }
      })
    )
    expect(allowed.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com'
    )
    expect(allowed.headers.get('vary')).toBe('origin')

    const denied = await handler(
      new Request('https://api.test/', {
        headers: { origin: 'https://evil.example.com' }
      })
    )
    expect(denied.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('never sends * when credentials are allowed', async () => {
    const credentialed = applyMiddleware(okHandler, [
      cors({ origins: '*', credentials: true })
    ])
    const response = await credentialed(
      new Request('https://api.test/', {
        headers: { origin: 'https://app.example.com' }
      })
    )
    expect(response.headers.get('access-control-allow-origin')).toBe(
      'https://app.example.com'
    )
    expect(response.headers.get('access-control-allow-credentials')).toBe('true')
  })

  it('passes non-CORS requests through untouched', async () => {
    const response = await handler(new Request('https://api.test/'))
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('securityHeaders', () => {
  it('sets baseline headers without overwriting handler-set values', async () => {
    const handler = applyMiddleware(
      () => jsonResponse({ ok: true }, { headers: { 'x-frame-options': 'SAMEORIGIN' } }),
      [securityHeaders()]
    )
    const response = await handler(new Request('https://api.test/'))
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(response.headers.get('referrer-policy')).toBe('same-origin')
    expect(response.headers.get('strict-transport-security')).toBeNull()
  })

  it('adds HSTS when opted in', async () => {
    const handler = applyMiddleware(okHandler, [securityHeaders({ hsts: true })])
    const response = await handler(new Request('https://api.test/'))
    expect(response.headers.get('strict-transport-security')).toBe(
      'max-age=31536000; includeSubDomains'
    )
  })
})

describe('bodyLimit', () => {
  const handler = applyMiddleware(async (request) => {
    const body = await request.text()
    return jsonResponse({ length: body.length })
  }, [bodyLimit({ maxBytes: 10 })])

  it('rejects oversized bodies via content-length with 413', async () => {
    const response = await handler(
      new Request('https://api.test/', {
        method: 'POST',
        headers: { 'content-length': '11' },
        body: 'x'.repeat(11)
      })
    )
    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({ detail: 'Request body too large.' })
  })

  it('rejects oversized bodies without content-length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(11)))
        controller.close()
      }
    })
    // Streaming request bodies have no content-length header.
    const request = new Request('https://api.test/', {
      method: 'POST',
      body: stream,
      // @ts-expect-error duplex is required by undici for stream bodies but
      // missing from the lib.dom RequestInit type.
      duplex: 'half'
    })
    request.headers.delete('content-length')
    const response = await handler(request)
    expect(response.status).toBe(413)
  })

  it('lets small bodies through intact', async () => {
    const response = await handler(
      new Request('https://api.test/', { method: 'POST', body: 'small' })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ length: 5 })
  })
})

describe('requestLog', () => {
  it('logs method, path, status, duration, and request id', async () => {
    const { logger, lines } = capturingLogger()
    const handler = applyMiddleware(okHandler, [requestLog({ logger })])

    const response = await handler(
      new Request('https://api.test/posts/?page=2', {
        headers: { 'x-request-id': 'req-123' }
      })
    )

    expect(response.headers.get('x-request-id')).toBe('req-123')
    expect(lines).toHaveLength(1)
    const entry = lines[0]
    expect(entry?.level).toBe('info')
    expect(entry?.fields).toMatchObject({
      message: 'request',
      method: 'GET',
      path: '/posts/',
      status: 200,
      requestId: 'req-123'
    })
  })

  it('generates a request id when none is provided', async () => {
    const { logger } = capturingLogger()
    const handler = applyMiddleware(okHandler, [requestLog({ logger })])
    const response = await handler(new Request('https://api.test/'))
    expect(response.headers.get('x-request-id')).toMatch(/[0-9a-f-]{36}/)
  })

  it('logs failures with the error and rethrows', async () => {
    const { logger, lines } = capturingLogger()
    const handler = applyMiddleware(() => {
      throw new Error('boom')
    }, [requestLog({ logger })])

    await expect(handler(new Request('https://api.test/'))).rejects.toThrow('boom')
    expect(lines[0]?.level).toBe('error')
    expect(lines[0]?.fields).toMatchObject({ message: 'request failed', error: 'boom' })
  })
})
