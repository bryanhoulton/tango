import type { Kysely } from 'kysely'

import type { WebHandler } from '@tango-ts/adapters'
import type { LooseDatabase } from '@tango-ts/orm'
import { defineServer, mysqlFromEnv } from '@tango-ts/server'

import { app } from './app.js'
import { routes } from './routes.js'

export function createRestDogfoodHandler(db: Kysely<LooseDatabase>): WebHandler {
  return defineServer({ app, routes, database: db })
}

export default defineServer({ app, routes, database: mysqlFromEnv() })
