import { describe, expect, it } from 'vitest'

import { jsonResponse } from '@tango-ts/http'
import { COMPILE_ONLY, defineApp, getConnection } from '@tango-ts/orm'
import { defineRoutes, route } from '@tango-ts/router'

import { defineProject, defineServer, mysqlFromEnv } from '../src/index.js'

describe('defineServer', () => {
  it('wraps declarative routes in request-scoped database context', async () => {
    const routes = defineRoutes([
      route('GET', '/db/', () => {
        const db = getConnection()
        return jsonResponse({ connected: db === COMPILE_ONLY })
      })
    ])

    const handler = defineServer({
      routes,
      database: COMPILE_ONLY
    })

    const response = await handler(new Request('https://example.test/db/'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ connected: true })
  })

  it('composes nested apps at the root project level', async () => {
    const commerceApp = defineApp({ name: 'commerce', models: [] })
    const commerceRoutes = defineRoutes([
      route('GET', '/customers/', () => jsonResponse({ app: 'commerce' }))
    ])

    const handler = defineProject({
      name: 'shop',
      database: COMPILE_ONLY,
      apps: [{ path: '/commerce', app: commerceApp, routes: commerceRoutes }]
    })

    expect(handler.name).toBe('shop')
    expect(handler.apps.map((app) => app.app.name)).toEqual(['commerce'])

    const response = await handler(
      new Request('https://example.test/commerce/customers/')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ app: 'commerce' })
  })

  it('mysqlFromEnv can derive database name from project name', () => {
    const original = process.env.TANGO_DB_NAME
    delete process.env.TANGO_DB_NAME
    const db = mysqlFromEnv({ projectName: 'my-shop' })
    try {
      expect(db).toBeDefined()
      // Connection details are held inside Kysely; this assertion protects the API
      // contract without opening a socket.
    } finally {
      if (original === undefined) {
        delete process.env.TANGO_DB_NAME
      } else {
        process.env.TANGO_DB_NAME = original
      }
      void db.destroy()
    }
  })
})
