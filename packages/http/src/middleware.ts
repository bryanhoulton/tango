import { consoleLogger, errorFields, type Logger } from './logger.js'

export type HttpHandler = (request: Request) => Promise<Response> | Response

export type NextHandler = (request: Request) => Promise<Response>

/**
 * A middleware wraps the rest of the pipeline. It may short-circuit (return
 * without calling `next`), rewrite the request, or decorate the response.
 * Middleware operate on Web-standard `Request`/`Response`, so they run on any
 * runtime Tango supports.
 */
export type Middleware = (
  request: Request,
  next: NextHandler
) => Promise<Response> | Response

/**
 * Compose middleware around a handler. The first middleware in the list is the
 * outermost: `applyMiddleware(h, [a, b])` runs a → b → h.
 */
export function applyMiddleware(
  handler: HttpHandler,
  middleware: readonly Middleware[]
): NextHandler {
  return [...middleware].reduceRight<NextHandler>(
    (next, layer) => async (request) => layer(request, next),
    async (request) => handler(request)
  )
}

/** Copy a response so headers are guaranteed mutable. */
function withMutableHeaders(response: Response): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  })
}

// --- CORS --------------------------------------------------------------------

export interface CorsOptions {
  /** Allowed origins, or `'*'` for any. Required — no permissive default. */
  readonly origins: readonly string[] | '*'
  readonly methods?: readonly string[]
  readonly allowedHeaders?: readonly string[]
  readonly exposedHeaders?: readonly string[]
  readonly credentials?: boolean
  readonly maxAgeSeconds?: number
}

const DEFAULT_CORS_METHODS = ['DELETE', 'GET', 'OPTIONS', 'PATCH', 'POST', 'PUT'] as const
const DEFAULT_CORS_HEADERS = ['authorization', 'content-type'] as const

/**
 * CORS middleware. Answers preflight `OPTIONS` requests before routing and
 * decorates actual responses with the allow-origin headers. Origins are matched
 * exactly; with `credentials: true` the origin is always echoed (never `*`),
 * per the Fetch spec.
 */
export function cors(options: CorsOptions): Middleware {
  const methods = (options.methods ?? DEFAULT_CORS_METHODS).join(', ')
  const allowedHeaders = (options.allowedHeaders ?? DEFAULT_CORS_HEADERS).join(', ')
  const maxAge = String(options.maxAgeSeconds ?? 600)

  function allowOrigin(origin: string): string | undefined {
    if (options.origins === '*') {
      return options.credentials === true ? origin : '*'
    }
    return options.origins.includes(origin) ? origin : undefined
  }

  function decorate(headers: Headers, allowed: string): void {
    headers.set('access-control-allow-origin', allowed)
    if (allowed !== '*') {
      headers.append('vary', 'origin')
    }
    if (options.credentials === true) {
      headers.set('access-control-allow-credentials', 'true')
    }
    if (options.exposedHeaders !== undefined) {
      headers.set('access-control-expose-headers', options.exposedHeaders.join(', '))
    }
  }

  return async (request, next) => {
    const origin = request.headers.get('origin')
    if (origin === null) {
      return next(request)
    }
    const allowed = allowOrigin(origin)

    const isPreflight =
      request.method === 'OPTIONS' &&
      request.headers.get('access-control-request-method') !== null
    if (isPreflight) {
      if (allowed === undefined) {
        return new Response(null, { status: 403 })
      }
      const headers = new Headers({
        'access-control-allow-methods': methods,
        'access-control-allow-headers': allowedHeaders,
        'access-control-max-age': maxAge
      })
      decorate(headers, allowed)
      return new Response(null, { status: 204, headers })
    }

    const response = withMutableHeaders(await next(request))
    if (allowed !== undefined) {
      decorate(response.headers, allowed)
    }
    return response
  }
}

// --- Security headers ----------------------------------------------------------

export interface SecurityHeadersOptions {
  /**
   * Strict-Transport-Security. Off by default because it is only correct when
   * the app is actually served over HTTPS for its whole domain.
   */
  readonly hsts?: boolean | { maxAgeSeconds?: number; includeSubDomains?: boolean }
  readonly frameOptions?: 'DENY' | 'SAMEORIGIN' | false
  readonly referrerPolicy?: string | false
}

/**
 * Sets baseline security headers on every response (without overwriting headers
 * a handler already set): `X-Content-Type-Options: nosniff`,
 * `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, and optionally HSTS.
 */
export function securityHeaders(options: SecurityHeadersOptions = {}): Middleware {
  const headers: [string, string][] = [['x-content-type-options', 'nosniff']]
  if (options.frameOptions !== false) {
    headers.push(['x-frame-options', options.frameOptions ?? 'DENY'])
  }
  if (options.referrerPolicy !== false) {
    headers.push(['referrer-policy', options.referrerPolicy ?? 'same-origin'])
  }
  if (options.hsts !== undefined && options.hsts !== false) {
    const hsts = options.hsts === true ? {} : options.hsts
    const maxAge = hsts.maxAgeSeconds ?? 31536000
    const suffix = hsts.includeSubDomains === false ? '' : '; includeSubDomains'
    headers.push(['strict-transport-security', `max-age=${maxAge}${suffix}`])
  }

  return async (request, next) => {
    const response = withMutableHeaders(await next(request))
    for (const [name, value] of headers) {
      if (!response.headers.has(name)) {
        response.headers.set(name, value)
      }
    }
    return response
  }
}

// --- Body size limit -----------------------------------------------------------

export interface BodyLimitOptions {
  readonly maxBytes: number
}

function payloadTooLarge(): Response {
  return new Response(JSON.stringify({ detail: 'Request body too large.' }), {
    status: 413,
    headers: { 'content-type': 'application/json' }
  })
}

/**
 * Rejects request bodies larger than `maxBytes` with a 413. Uses the
 * `Content-Length` header when present, otherwise buffers and measures. The
 * Node adapter additionally enforces a cap while streaming; this middleware
 * makes the limit hold on any runtime.
 */
export function bodyLimit(options: BodyLimitOptions): Middleware {
  return async (request, next) => {
    if (request.method === 'GET' || request.method === 'HEAD' || request.body === null) {
      return next(request)
    }
    const contentLength = request.headers.get('content-length')
    if (contentLength !== null && Number(contentLength) > options.maxBytes) {
      return payloadTooLarge()
    }
    if (contentLength !== null) {
      return next(request)
    }
    const body = await request.arrayBuffer()
    if (body.byteLength > options.maxBytes) {
      return payloadTooLarge()
    }
    return next(new Request(request, { body }))
  }
}

// --- Request logging -------------------------------------------------------------

export interface RequestLogOptions {
  readonly logger?: Logger
}

/**
 * Structured request logging with request IDs. Reuses an incoming
 * `x-request-id` (set by most load balancers) or generates one, sets it on the
 * response, and logs method/path/status/duration. Errors are logged with the
 * request ID and rethrown so the adapter's error handling still applies.
 */
export function requestLog(options: RequestLogOptions = {}): Middleware {
  const logger = options.logger ?? consoleLogger()
  return async (request, next) => {
    const start = Date.now()
    const requestId = request.headers.get('x-request-id') ?? crypto.randomUUID()
    const { method } = request
    const path = new URL(request.url).pathname
    try {
      const response = withMutableHeaders(await next(request))
      response.headers.set('x-request-id', requestId)
      logger.info('request', {
        method,
        path,
        status: response.status,
        durationMs: Date.now() - start,
        requestId
      })
      return response
    } catch (err) {
      logger.error('request failed', {
        method,
        path,
        durationMs: Date.now() - start,
        requestId,
        ...errorFields(err)
      })
      throw err
    }
  }
}
