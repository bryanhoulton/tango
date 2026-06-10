import {
  createRequestContext,
  detailResponse,
  type HttpMethod,
  type RequestContext
} from '@tango-ts/http'

export type Handler = (ctx: RequestContext) => Promise<Response> | Response

export interface Route {
  readonly method: HttpMethod
  readonly path: string
  readonly handler: Handler
  readonly metadata?: unknown
}

export interface Routable {
  routes(basePath: string): readonly Route[]
}

export interface RouteDefinition {
  register(router: Router): void
}

export type RouteSource = Router | Routable | readonly RouteDefinition[]

export interface HandleOptions {
  /** Pre-resolved user placed on every matched route's context. */
  readonly user?: unknown
}

interface Match {
  readonly route: Route
  readonly params: Record<string, string>
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) {
    return `/${path}`
  }
  return path
}

function joinPaths(basePath: string, childPath: string): string {
  const base = normalizePath(basePath).replace(/\/+$/, '')
  const child = normalizePath(childPath)
  return `${base}${child}`
}

function prefixedRoute(basePath: string, route: Route): Route {
  return { ...route, path: joinPaths(basePath, route.path) }
}

function isRouteDefinitions(source: RouteSource): source is readonly RouteDefinition[] {
  return Array.isArray(source)
}

function pathParts(path: string): string[] {
  return normalizePath(path)
    .split('/')
    .filter((part) => part.length > 0)
}

function matchPath(
  pattern: string,
  pathname: string
): Record<string, string> | undefined {
  const patternParts = pathParts(pattern)
  const actualParts = pathParts(pathname)
  if (patternParts.length !== actualParts.length) {
    return undefined
  }
  const params: Record<string, string> = {}
  for (let i = 0; i < patternParts.length; i += 1) {
    const expected = patternParts[i]
    const actual = actualParts[i]
    if (expected === undefined || actual === undefined) {
      return undefined
    }
    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(actual)
    } else if (expected !== actual) {
      return undefined
    }
  }
  return params
}

export class Router {
  private readonly routesList: Route[] = []

  add(method: HttpMethod, path: string, handler: Handler, metadata?: unknown): void {
    this.routesList.push({ method, path: normalizePath(path), handler, metadata })
  }

  register(basePath: string, routable: Routable): void {
    for (const route of routable.routes(normalizePath(basePath))) {
      this.routesList.push(route)
    }
  }

  routes(): readonly Route[] {
    return this.routesList
  }

  private match(request: Request): Match | undefined {
    const url = new URL(request.url)
    const method = request.method.toUpperCase()
    for (const route of this.routesList) {
      const params = matchPath(route.path, url.pathname)
      if (params !== undefined && route.method === method) {
        return { route, params }
      }
    }
    return undefined
  }

  private pathExists(request: Request): boolean {
    const url = new URL(request.url)
    return this.routesList.some(
      (route) => matchPath(route.path, url.pathname) !== undefined
    )
  }

  async handle(request: Request, options: HandleOptions = {}): Promise<Response> {
    const match = this.match(request)
    if (match === undefined) {
      return this.pathExists(request)
        ? detailResponse('Method not allowed.', 405)
        : detailResponse('Not found.', 404)
    }
    const ctx = createRequestContext(request, match.params, { user: options.user })
    return match.route.handler(ctx)
  }
}

export function createRouter(): Router {
  return new Router()
}

export function route(path: string, routable: Routable): RouteDefinition
export function route(
  method: HttpMethod,
  path: string,
  handler: Handler
): RouteDefinition
export function route(
  methodOrPath: string,
  pathOrRoutable: string | Routable,
  handler?: Handler
): RouteDefinition {
  if (typeof pathOrRoutable !== 'string') {
    return include(methodOrPath, pathOrRoutable)
  }
  if (handler === undefined) {
    throw new Error('Route handler is required.')
  }
  return {
    register(router) {
      router.add(methodOrPath as HttpMethod, pathOrRoutable, handler)
    }
  }
}

export function include(basePath: string, source: RouteSource): RouteDefinition {
  return {
    register(router) {
      if (isRouteDefinitions(source)) {
        const child = defineRoutes(source)
        for (const childRoute of child.routes()) {
          router.add(
            childRoute.method,
            prefixedRoute(basePath, childRoute).path,
            childRoute.handler,
            childRoute.metadata
          )
        }
        return
      }
      if (source instanceof Router) {
        for (const childRoute of source.routes()) {
          router.add(
            childRoute.method,
            prefixedRoute(basePath, childRoute).path,
            childRoute.handler,
            childRoute.metadata
          )
        }
        return
      }
      router.register(basePath, source)
    }
  }
}

export function defineRoutes(definitions: readonly RouteDefinition[]): Router {
  const router = createRouter()
  for (const definition of definitions) {
    definition.register(router)
  }
  return router
}
