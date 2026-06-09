import { describe, expect, it } from 'vitest'

import { mysqlConfigFromEnv } from '../src/index.js'

describe('mysqlConfigFromEnv', () => {
  it('falls back to docker-compose development defaults outside production', () => {
    expect(mysqlConfigFromEnv({}, {})).toEqual({
      host: '127.0.0.1',
      port: 3307,
      user: 'root',
      password: 'tango',
      database: 'tango_test'
    })
  })

  it('reads TANGO_DB_* variables', () => {
    expect(
      mysqlConfigFromEnv(
        {},
        {
          TANGO_DB_HOST: 'db.internal',
          TANGO_DB_PORT: '3306',
          TANGO_DB_USER: 'app',
          TANGO_DB_PASSWORD: 's3cret',
          TANGO_DB_NAME: 'shop'
        }
      )
    ).toEqual({
      host: 'db.internal',
      port: 3306,
      user: 'app',
      password: 's3cret',
      database: 'shop'
    })
  })

  it('derives the database name from the project name', () => {
    const config = mysqlConfigFromEnv({ projectName: 'My Shop!' }, {})
    expect(config.database).toBe('my_shop')
  })

  it('parses TANGO_DATABASE_URL including ssl', () => {
    expect(
      mysqlConfigFromEnv(
        {},
        {
          TANGO_DATABASE_URL:
            'mysql://app:p%40ss@db.example.com:3306/shop?ssl=true'
        }
      )
    ).toEqual({
      host: 'db.example.com',
      port: 3306,
      user: 'app',
      password: 'p@ss',
      database: 'shop',
      ssl: { rejectUnauthorized: true }
    })
  })

  it('lets explicit options override the URL', () => {
    const config = mysqlConfigFromEnv(
      { database: 'override' },
      { DATABASE_URL: 'mysql://app:pw@db.example.com/shop' }
    )
    expect(config.database).toBe('override')
    expect(config.host).toBe('db.example.com')
  })

  it('defaults to one pooled connection per instance on Vercel', () => {
    expect(mysqlConfigFromEnv({}, { VERCEL: '1' }).connectionLimit).toBe(1)
    // Explicit tuning always wins over the platform default.
    expect(
      mysqlConfigFromEnv({}, { VERCEL: '1', TANGO_DB_POOL_SIZE: '4' })
        .connectionLimit
    ).toBe(4)
    expect(mysqlConfigFromEnv({}, {}).connectionLimit).toBeUndefined()
  })

  it('supports TANGO_DB_SSL and TANGO_DB_POOL_SIZE', () => {
    const config = mysqlConfigFromEnv(
      {},
      { TANGO_DB_SSL: 'skip-verify', TANGO_DB_POOL_SIZE: '4' }
    )
    expect(config.ssl).toEqual({ rejectUnauthorized: false })
    expect(config.connectionLimit).toBe(4)
  })

  it('rejects invalid ssl, port, and pool size values loudly', () => {
    expect(() => mysqlConfigFromEnv({}, { TANGO_DB_SSL: 'maybe' })).toThrow(
      /TANGO_DB_SSL/
    )
    expect(() => mysqlConfigFromEnv({}, { TANGO_DB_PORT: 'abc' })).toThrow(
      /TANGO_DB_PORT/
    )
    expect(() => mysqlConfigFromEnv({}, { TANGO_DB_POOL_SIZE: '0' })).toThrow(
      /TANGO_DB_POOL_SIZE/
    )
  })

  it('rejects non-mysql URLs', () => {
    expect(() =>
      mysqlConfigFromEnv({}, { TANGO_DATABASE_URL: 'postgres://a:b@c/d' })
    ).toThrow(/mysql:\/\//)
  })

  it('refuses development defaults in production', () => {
    expect(() => mysqlConfigFromEnv({}, { NODE_ENV: 'production' })).toThrow(
      /TANGO_DB_HOST, TANGO_DB_USER, TANGO_DB_PASSWORD, TANGO_DB_NAME/
    )
  })

  it('accepts a fully configured production environment', () => {
    expect(
      mysqlConfigFromEnv(
        { projectName: 'shop' },
        {
          NODE_ENV: 'production',
          TANGO_DB_HOST: 'db.internal',
          TANGO_DB_USER: 'app',
          TANGO_DB_PASSWORD: 's3cret'
        }
      )
    ).toEqual({
      host: 'db.internal',
      port: 3307,
      user: 'app',
      password: 's3cret',
      database: 'shop'
    })
  })

  it('treats a production URL as full configuration', () => {
    const config = mysqlConfigFromEnv(
      {},
      {
        NODE_ENV: 'production',
        DATABASE_URL: 'mysql://app:pw@db.example.com:3306/shop?ssl=true'
      }
    )
    expect(config.host).toBe('db.example.com')
    expect(config.ssl).toEqual({ rejectUnauthorized: true })
  })
})
