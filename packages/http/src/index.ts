export type HttpMethod = 'DELETE' | 'GET' | 'OPTIONS' | 'PATCH' | 'POST' | 'PUT'

export { consoleLogger, errorFields } from './logger.js'
export type { LogFields, Logger, LogLevel } from './logger.js'
export {
  applyMiddleware,
  bodyLimit,
  cors,
  requestLog,
  securityHeaders
} from './middleware.js'
export type {
  BodyLimitOptions,
  CorsOptions,
  HttpHandler,
  Middleware,
  NextHandler,
  RequestLogOptions,
  SecurityHeadersOptions
} from './middleware.js'

export interface RequestContext {
  readonly request: Request
  readonly params: Record<string, string>
  readonly query: URLSearchParams
  readonly user?: unknown
  json(): Promise<unknown>
}

export interface JsonResponseOptions {
  readonly status?: number
  readonly headers?: HeadersInit
}

export function jsonResponse(
  body: unknown,
  options: JsonResponseOptions = {}
): Response {
  const headers = new Headers(options.headers)
  if (!headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }
  return new Response(JSON.stringify(body), {
    status: options.status ?? 200,
    headers
  })
}

export function detailResponse(detail: string, status: number): Response {
  return jsonResponse({ detail }, { status })
}

export interface RequestContextOptions {
  /** Pre-resolved user (e.g. from project-level authentication). */
  readonly user?: unknown
}

export function createRequestContext(
  request: Request,
  params: Record<string, string>,
  options: RequestContextOptions = {}
): RequestContext {
  const url = new URL(request.url)
  let parsed: Promise<unknown> | undefined

  return {
    request,
    params,
    query: url.searchParams,
    user: options.user,
    json(): Promise<unknown> {
      parsed ??= request.json()
      return parsed
    }
  }
}
