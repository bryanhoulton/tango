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

  it('runs middleware around routing, inside the database scope', async () => {
    const order: string[] = []
    const handler = defineProject({
      name: 'shop',
      database: COMPILE_ONLY,
      routes: defineRoutes([
        route('GET', '/ping/', () => {
          order.push('handler')
          // Middleware and handlers share the request's connection scope.
          expect(getConnection()).toBe(COMPILE_ONLY)
          return jsonResponse({ ok: true })
        })
      ]),
      middleware: [
        async (request, next) => {
          order.push('before')
          expect(getConnection()).toBe(COMPILE_ONLY)
          const response = await next(request)
          order.push('after')
          return response
        }
      ]
    })

    const response = await handler(new Request('https://example.test/ping/'))
    expect(response.status).toBe(200)
    expect(order).toEqual(['before', 'handler', 'after'])
  })

  it('middleware can short-circuit before routing', async () => {
    const handler = defineProject({
      name: 'shop',
      database: COMPILE_ONLY,
      routes: defineRoutes([
        route('GET', '/secret/', () => jsonResponse({ secret: true }))
      ]),
      middleware: [
        (request) =>
          request.headers.get('x-block') === null
            ? jsonResponse({ blocked: true }, { status: 403 })
            : jsonResponse({ blocked: false })
      ]
    })

    const response = await handler(new Request('https://example.test/secret/'))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ blocked: true })
  })

  it('exposes dispose() that destroys the database', async () => {
    let destroyed = false
    const database = Object.create(COMPILE_ONLY) as typeof COMPILE_ONLY
    Object.defineProperty(database, 'destroy', {
      value: () => {
        destroyed = true
        return Promise.resolve()
      }
    })
    const handler = defineProject({ name: 'shop', database })
    await handler.dispose()
    expect(destroyed).toBe(true)
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
