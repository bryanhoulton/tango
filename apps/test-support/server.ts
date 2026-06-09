import type { Kysely } from 'kysely'

import { serve, type DevServer, type WebHandler } from '@tango-ts/adapters'
import { defineServer } from '@tango-ts/server'
import type { LooseDatabase, TangoApp } from '@tango-ts/orm'
import type { Router } from '@tango-ts/router'

import { prepareMigratedDatabase } from './database.js'

export interface StartedDogfoodApp {
  readonly url: string
  readonly db?: Kysely<LooseDatabase>
  close(): Promise<void>
}

export interface StartInjectedDogfoodAppOptions {
  readonly app: TangoApp
  readonly database: string
  readonly routes: Router
}

export interface StartHandlerDogfoodAppOptions {
  readonly handler: WebHandler
}

export type StartDogfoodAppOptions =
  | StartInjectedDogfoodAppOptions
  | StartHandlerDogfoodAppOptions

export async function startDogfoodApp(
  options: StartDogfoodAppOptions
): Promise<StartedDogfoodApp> {
  if ('handler' in options) {
    const server = await serve(options.handler, { host: '127.0.0.1', port: 0 })
    return {
      url: server.url,
      async close(): Promise<void> {
        await server.close()
      }
    }
  }

  const db = await prepareMigratedDatabase(options.app, options.database)
  let server: DevServer | undefined
  try {
    const handler = defineServer({
      app: options.app,
      routes: options.routes,
      database: db
    })
    server = await serve(handler, { host: '127.0.0.1', port: 0 })
    return {
      url: server.url,
      db,
      async close(): Promise<void> {
        if (server !== undefined) {
          await server.close()
        }
        await db.destroy()
      }
    }
  } catch (err) {
    await db.destroy()
    throw err
  }
}
