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
  readonly database: Kysely<LooseDatabase>
  readonly routes?: Router
  readonly apps?: readonly ProjectAppConfig[]
}

export interface MysqlEnvOptions {
  readonly host?: string
  readonly port?: number
  readonly user?: string
  readonly password?: string
  readonly database?: string
}

export function mysqlFromEnv(options: MysqlEnvOptions = {}): Kysely<LooseDatabase> {
  return createMysqlConnection({
    host: options.host ?? process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: options.port ?? Number(process.env.TANGO_DB_PORT ?? 3307),
    user: options.user ?? process.env.TANGO_DB_USER ?? 'root',
    password: options.password ?? process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: options.database ?? process.env.TANGO_DB_NAME ?? 'tango_test'
  })
}

export function defineServer(config: ServerConfig): WebHandler {
  return (request) =>
    withConnection(config.database, () => config.routes.handle(request))
}

export function defineProject(config: ProjectConfig): WebHandler {
  const routes = createRouter()
  if (config.routes !== undefined) {
    include('/', config.routes).register(routes)
  }
  for (const app of config.apps ?? []) {
    include(app.path, app.routes).register(routes)
  }
  return defineServer({ routes, database: config.database })
}
