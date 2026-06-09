import type { Kysely } from 'kysely'

import {
  createMysqlConnection,
  type LooseDatabase,
  type TangoApp
} from '@tango-ts/orm'
import { migrateApp } from '@tango-ts/cli'

export interface DbConfig {
  readonly host: string
  readonly port: number
  readonly user: string
  readonly password: string
}

export function dbConfig(): DbConfig {
  return {
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango'
  }
}

export function databaseConnection(database: string): Kysely<LooseDatabase> {
  return createMysqlConnection({ ...dbConfig(), database })
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function prepareMigratedDatabase(
  app: TangoApp,
  database: string
): Promise<Kysely<LooseDatabase>> {
  let lastError: unknown

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const db = databaseConnection(database)
    try {
      await migrateApp({ app, db })
      return db
    } catch (err) {
      lastError = err
      await db.destroy()
      await wait(500 * (attempt + 1))
    }
  }

  throw lastError
}
