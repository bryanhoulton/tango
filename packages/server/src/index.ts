import type { Kysely } from 'kysely'

import type { WebHandler } from '@tango-ts/adapters'
import {
  AuthenticationFailed,
  runAuthentication,
  type Authentication
} from '@tango-ts/auth'
import {
  createFunctionDispatchHandler,
  createFunctionRegistry,
  functionRuntimeFromEnv,
  FUNCTIONS_PATH_PREFIX,
  withFunctionRuntime,
  type AnyTangoFunction,
  type FunctionRuntime,
  type FunctionsOverrides
} from '@tango-ts/functions'
import {
  applyMiddleware,
  createRequestContext,
  detailResponse,
  type Middleware
} from '@tango-ts/http'
import {
  createMysqlConnection,
  defineApp as defineOrmApp,
  mysqlConfigFromEnv,
  withConnection,
  type AnyModel,
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
  /**
   * Function runtime placed in request scope so `fn.invoke()`/`fn.defer()`
   * work inside routes and middleware. Wired by `defineProject` when apps
   * register functions.
   */
  readonly functionRuntime?: FunctionRuntime
}

export interface AppConfig {
  readonly name: string
  /** Where the app's routes mount on the project. Defaults to `/<name>`. */
  readonly path?: string
  readonly models?: readonly AnyModel[]
  readonly routes?: Router
  /**
   * Internal serverless functions owned by this app (its `functions/` folder).
   * Never exposed as API routes — invokable only from inside Tango logic via
   * `fn.invoke()` / `fn.defer()`.
   */
  readonly functions?: readonly AnyTangoFunction[]
  /** Directory where generated migration files live. CLI-only metadata. */
  readonly migrationsDir?: string
}

/**
 * A self-contained app: models, routes, functions, and migration metadata.
 * Satisfies the ORM's `TangoApp` contract, so the CLI's migration commands
 * consume the same module (`tango migrate --app ./dist/apps/core/app.js`).
 */
export interface ProjectApp extends TangoApp {
  readonly path: string
  readonly routes: Router
  readonly functions: readonly AnyTangoFunction[]
}

/**
 * Declare an app as one object: models, routes, and functions together. The
 * project then just lists apps — no per-app wiring at the project level.
 */
export function defineApp(config: AppConfig): ProjectApp {
  // The ORM registry validates duplicate model tables and carries the
  // CLI-facing migration metadata.
  const app = defineOrmApp({
    name: config.name,
    models: config.models ?? [],
    migrationsDir: config.migrationsDir
  })
  return {
    ...app,
    path: config.path ?? `/${config.name}`,
    routes: config.routes ?? createRouter(),
    functions: config.functions ?? []
  }
}

export interface ProjectConfig {
  readonly name: string
  readonly database: Kysely<LooseDatabase>
  readonly routes?: Router
  readonly apps?: readonly ProjectApp[]
  readonly middleware?: readonly Middleware[]
  /** Project-level authentication classes. See `ServerConfig.authentication`. */
  readonly authentication?: readonly Authentication[]
  /**
   * Overrides for the env-derived function transport (`TANGO_FUNCTIONS_*`).
   * Only consulted when apps register functions.
   */
  readonly functions?: FunctionsOverrides
}

export interface TangoProject extends WebHandler {
  readonly name: string
  readonly routes: Router
  readonly apps: readonly ProjectApp[]
  /**
   * Release held resources: drain deferred function work, then close the
   * database pool. Called at process shutdown.
   */
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
  const runtime = config.functionRuntime
  const scoped =
    runtime === undefined
      ? handle
      : (request: Request) => withFunctionRuntime(runtime, () => handle(request))
  return (request) => withConnection(config.database, () => scoped(request))
}

export function defineProject(config: ProjectConfig): TangoProject {
  const routes = createRouter()
  if (config.routes !== undefined) {
    include('/', config.routes).register(routes)
  }
  for (const app of config.apps ?? []) {
    include(app.path, app.routes).register(routes)
  }

  const registrations = (config.apps ?? [])
    .filter((app) => app.functions.length > 0)
    .map((app) => ({ appName: app.name, functions: app.functions }))
  let functionRuntime: FunctionRuntime | undefined
  if (registrations.length > 0) {
    const registry = createFunctionRegistry(registrations)
    const resolved = functionRuntimeFromEnv({
      registry,
      database: config.database,
      overrides: config.functions
    })
    functionRuntime = resolved.runtime
    if (resolved.transport === 'http' && resolved.secret !== undefined) {
      // The receiving end of the http transport. Inline transport mounts
      // nothing — functions then have no HTTP surface at all.
      routes.add(
        'POST',
        `${FUNCTIONS_PATH_PREFIX}/:app/:name/`,
        createFunctionDispatchHandler({ registry, secret: resolved.secret })
      )
    }
  }

  const handler = defineServer({
    routes,
    database: config.database,
    middleware: config.middleware,
    authentication: config.authentication,
    functionRuntime
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
    value: async () => {
      // Deferred function work first — it may still need the database.
      await functionRuntime?.drain()
      await config.database.destroy()
    }
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
