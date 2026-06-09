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

  it('carries TLS settings onto the server-level connection', async () => {
    // PlanetScale and other managed MySQL reject plaintext connections, so
    // dropping ssl here makes `tango migrate` unusable against them.
    const serverDb = {
      destroy: () => Promise.resolve()
    } as Kysely<LooseDatabase>
    const createServerConnection = vi.fn(() => serverDb)
    const options: MysqlConnectionOptions = {
      host: 'aws.connect.psdb.cloud',
      port: 3306,
      user: 'user',
      password: 'pscale_pw',
      database: 'shop',
      ssl: { rejectUnauthorized: true }
    }

    await ensureMysqlDatabase(options, createServerConnection, () =>
      Promise.resolve()
    )

    expect(createServerConnection).toHaveBeenCalledWith({
      host: 'aws.connect.psdb.cloud',
      port: 3306,
      user: 'user',
      password: 'pscale_pw',
      ssl: { rejectUnauthorized: true }
    })
  })

  it('tolerates CREATE DATABASE being forbidden when the database is reachable', async () => {
    // PlanetScale (Vitess) forbids CREATE DATABASE — databases are branches.
    // As long as the target database answers queries, migrate can proceed.
    const destroyed: string[] = []
    const makeDb = (label: string): Kysely<LooseDatabase> =>
      ({
        destroy: () => {
          destroyed.push(label)
          return Promise.resolve()
        }
      }) as Kysely<LooseDatabase>
    const createServerConnection = vi.fn(
      (connectionOptions: Partial<MysqlConnectionOptions>) =>
        makeDb(connectionOptions.database === undefined ? 'server' : 'target')
    )
    const executeCreateDatabase = vi.fn(() =>
      Promise.reject(new Error('CREATE DATABASE is not allowed'))
    )
    const executeProbe = vi.fn(() => Promise.resolve())
    const options: MysqlConnectionOptions = {
      host: 'aws.connect.psdb.cloud',
      port: 3306,
      user: 'user',
      password: 'pscale_pw',
      database: 'shop'
    }

    await expect(
      ensureMysqlDatabase(
        options,
        createServerConnection,
        executeCreateDatabase,
        executeProbe
      )
    ).resolves.toBeUndefined()
    expect(executeProbe).toHaveBeenCalledTimes(1)
    expect(destroyed).toEqual(['target', 'server'])
  })

  it('rethrows the CREATE DATABASE error when the database is unreachable', async () => {
    const serverDb = { destroy: () => Promise.resolve() } as Kysely<LooseDatabase>
    const createServerConnection = vi.fn(() => serverDb)
    const createError = new Error('Access denied for CREATE DATABASE')
    const executeCreateDatabase = vi.fn(() => Promise.reject(createError))
    const executeProbe = vi.fn(() =>
      Promise.reject(new Error('Unknown database "shop"'))
    )
    const options: MysqlConnectionOptions = {
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: 'tango',
      database: 'shop'
    }

    await expect(
      ensureMysqlDatabase(
        options,
        createServerConnection,
        executeCreateDatabase,
        executeProbe
      )
    ).rejects.toBe(createError)
  })
})
