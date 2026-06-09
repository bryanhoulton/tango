import type { Kysely } from 'kysely'
import { describe, expect, it, vi } from 'vitest'

import type { LooseDatabase } from '@tango-ts/orm'
import {
  ensureMysqlDatabase,
  mysqlConnectionOptionsFromEnv,
  type MysqlConnectionOptions
} from '../src/index.js'

describe('mysqlConnectionOptionsFromEnv', () => {
  it('uses local development defaults', () => {
    expect(mysqlConnectionOptionsFromEnv({})).toEqual({
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: 'tango',
      database: 'tango_test'
    })
  })

  it('reads configured database connection values', () => {
    expect(
      mysqlConnectionOptionsFromEnv({
        TANGO_DB_HOST: 'db.example.test',
        TANGO_DB_PORT: '3306',
        TANGO_DB_USER: 'tango_user',
        TANGO_DB_PASSWORD: 'secret',
        TANGO_DB_NAME: 'app_db'
      })
    ).toEqual({
      host: 'db.example.test',
      port: 3306,
      user: 'tango_user',
      password: 'secret',
      database: 'app_db'
    })
  })
})

describe('ensureMysqlDatabase', () => {
  it('creates the target database from a server-level connection', async () => {
    const destroyed: string[] = []
    const serverDb = {
      destroy: () => {
        destroyed.push('server')
        return Promise.resolve()
      }
    } as Kysely<LooseDatabase>
    const createServerConnection = vi.fn(() => serverDb)
    const executeCreateDatabase = vi.fn(async () => {})
    const options: MysqlConnectionOptions = {
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: 'tango',
      database: 'shop'
    }

    await ensureMysqlDatabase(
      options,
      createServerConnection,
      executeCreateDatabase
    )

    expect(createServerConnection).toHaveBeenCalledWith({
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: 'tango'
    })
    expect(executeCreateDatabase).toHaveBeenCalledWith(serverDb, 'shop')
    expect(destroyed).toEqual(['server'])
  })
})
