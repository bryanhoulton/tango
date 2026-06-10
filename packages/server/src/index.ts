import type { Kysely } from 'kysely'

import type { WebHandler } from '@tango-ts/adapters'
import {
  AuthenticationFailed,
  runAuthentication,
  type Authentication
} from '@tango-ts/auth'
import {
  applyMiddleware,
  createRequestContext,
  detailResponse,
  type Middleware
} from '@tango-ts/http'
import {
  createMysqlConnection,
  mysqlConfigFromEnv,
  withConnection,
  type LooseDatabase,
  type MysqlEnvOptions,
  type TangoApp
} from '@tango-ts/orm'
import { createRouter, include, type Router } from '@tango-ts/router'

export interface ServerConfig {
  readonly app?: TangoApp
  readonly routes: Router
  readonly database: Kysely<LooseDatabase>
  /**
   * Middleware applied around routing, outermost-first. Middleware run inside
   * the request's database scope, so they may use the ORM.
   */
  readonly middleware?: readonly Middleware[]
  /**
   * Project-level authentication (DRF's default authentication classes). Runs
   * for every request — viewsets *and* plain routes — and places the resolved
   * user on `ctx.user`. Invalid credentials short-circuit with a 401; absent
   * credentials proceed unauthenticated (permissions decide what that means).
   * Viewsets and `apiView` routes may still declare their own `authentication`
   * to override.
   */
  readonly authentication?: readonly Authentication[]
}

export interface ProjectAppConfig {
  readonly path: string
  readonly app: TangoApp
  readonly routes: Router
}

export interface ProjectConfig {
  readonly name: string
  readonly database: Kysely<LooseDatabase>
  readonly routes?: Router
  readonly apps?: readonly ProjectAppConfig[]
  readonly middleware?: readonly Middleware[]
  /** Project-level authentication classes. See `ServerConfig.authentication`. */
  readonly authentication?: readonly Authentication[]
}

export interface TangoProject extends WebHandler {
  readonly name: string
  readonly routes: Router
  readonly apps: readonly ProjectAppConfig[]
  /** Release held resources (the database pool). Called at process shutdown. */
  dispose(): Promise<void>
}

export type { MysqlEnvOptions }

/**
 * Build a MySQL connection from `TANGO_DB_*` variables or
 * `TANGO_DATABASE_URL`/`DATABASE_URL` (see `mysqlConfigFromEnv` in
 * `@tango-ts/orm` for the resolution rules). Development defaults are refused
 * when `NODE_ENV=production`.
 */
export function mysqlFromEnv(options: MysqlEnvOptions = {}): Kysely<LooseDatabase> {
  return createMysqlConnection(mysqlConfigFromEnv(options))
}

export function defineServer(config: ServerConfig): WebHandler {
  const authentication = config.authentication ?? []
  const routeRequest = async (request: Request): Promise<Response> => {
    if (authentication.length === 0) {
      return config.routes.handle(request)
    }
    // Authentication only reads the request (headers), so it runs before route
    // matching on a context without params.
    const probe = createRequestContext(request, {})
    try {
      const user = await runAuthentication(probe, authentication)
      return config.routes.handle(request, { user })
    } catch (err) {
      if (err instanceof AuthenticationFailed) {
        return detailResponse(err.message, 401)
      }
      throw err
    }
  }
  const handle = applyMiddleware(routeRequest, config.middleware ?? [])
  return (request) => withConnection(config.database, () => handle(request))
}

export function defineProject(config: ProjectConfig): TangoProject {
  const routes = createRouter()
  if (config.routes !== undefined) {
    include('/', config.routes).register(routes)
  }
  for (const app of config.apps ?? []) {
    include(app.path, app.routes).register(routes)
  }
  const handler = defineServer({
    routes,
    database: config.database,
    middleware: config.middleware,
    authentication: config.authentication
  }) as TangoProject
  Object.defineProperty(handler, 'name', {
    value: config.name,
    configurable: true
  })
  Object.defineProperty(handler, 'routes', {
    value: routes,
    enumerable: true
  })
  Object.defineProperty(handler, 'apps', {
    value: [...(config.apps ?? [])],
    enumerable: true
  })
  Object.defineProperty(handler, 'dispose', {
    value: () => config.database.destroy()
  })
  return handler
}

// Middleware and logging are re-exported here so application code can configure
// a project from a single import.
export {
  applyMiddleware,
  bodyLimit,
  consoleLogger,
  cors,
  requestLog,
  securityHeaders
} from '@tango-ts/http'
export type {
  BodyLimitOptions,
  CorsOptions,
  Logger,
  Middleware,
  RequestLogOptions,
  SecurityHeadersOptions
} from '@tango-ts/http'
