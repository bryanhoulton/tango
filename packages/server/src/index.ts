import type { Kysely } from 'kysely'

import type { WebHandler } from '@tango-ts/adapters'
import {
  createMysqlConnection,
  withConnection,
  type LooseDatabase,
  type TangoApp
} from '@tango-ts/orm'
import { createRouter, include, type Router } from '@tango-ts/router'

export interface ServerConfig {
  readonly app?: TangoApp
  readonly routes: Router
  readonly database: Kysely<LooseDatabase>
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
}

export interface TangoProject extends WebHandler {
  readonly name: string
  readonly routes: Router
  readonly apps: readonly ProjectAppConfig[]
}

export interface MysqlEnvOptions {
  readonly projectName?: string
  readonly host?: string
  readonly port?: number
  readonly user?: string
  readonly password?: string
  readonly database?: string
}

function databaseNameFromProject(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'tango'
}

export function mysqlFromEnv(options: MysqlEnvOptions = {}): Kysely<LooseDatabase> {
  return createMysqlConnection({
    host: options.host ?? process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: options.port ?? Number(process.env.TANGO_DB_PORT ?? 3307),
    user: options.user ?? process.env.TANGO_DB_USER ?? 'root',
    password: options.password ?? process.env.TANGO_DB_PASSWORD ?? 'tango',
    database:
      options.database ??
      process.env.TANGO_DB_NAME ??
      (options.projectName === undefined
        ? 'tango_test'
        : databaseNameFromProject(options.projectName))
  })
}

export function defineServer(config: ServerConfig): WebHandler {
  return (request) =>
    withConnection(config.database, () => config.routes.handle(request))
}

export function defineProject(config: ProjectConfig): TangoProject {
  const routes = createRouter()
  if (config.routes !== undefined) {
    include('/', config.routes).register(routes)
  }
  for (const app of config.apps ?? []) {
    include(app.path, app.routes).register(routes)
  }
  const handler = defineServer({ routes, database: config.database }) as TangoProject
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
  return handler
}
