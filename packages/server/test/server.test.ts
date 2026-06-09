import { describe, expect, it } from 'vitest'

import { jsonResponse } from '@tango-ts/http'
import { COMPILE_ONLY, defineApp, getConnection } from '@tango-ts/orm'
import { defineRoutes, route } from '@tango-ts/router'

import { defineProject, defineServer } from '../src/index.js'

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
      database: COMPILE_ONLY,
      apps: [{ path: '/commerce', app: commerceApp, routes: commerceRoutes }]
    })

    const response = await handler(
      new Request('https://example.test/commerce/customers/')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ app: 'commerce' })
  })
})
