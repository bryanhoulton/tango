import { describe, expect, it } from 'vitest'

import { jsonResponse } from '@tango-ts/http'

import { createRouter, defineRoutes, include, route } from '../src/index.js'

describe('createRouter', () => {
  it('builds a router from declarative route definitions', async () => {
    const router = defineRoutes([
      route('GET', '/health/live/', () => jsonResponse({ ok: true }))
    ])

    const response = await router.handle(
      new Request('https://example.test/health/live/')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('registers routables from declarative route definitions', () => {
    const routable = {
      routes: (basePath: string) => [
        {
          method: 'GET' as const,
          path: `${basePath}/`,
          handler: () => jsonResponse({ routed: true })
        }
      ]
    }

    const router = defineRoutes([route('/things', routable)])

    expect(router.routes().map((registered) => [registered.method, registered.path])).toEqual([
      ['GET', '/things/']
    ])
  })

  it('nests route collections under a path prefix', async () => {
    const commerceRoutes = defineRoutes([
      route('GET', '/customers/', () => jsonResponse({ app: 'commerce' }))
    ])
    const rootRoutes = defineRoutes([include('/commerce', commerceRoutes)])

    expect(rootRoutes.routes().map((registered) => [registered.method, registered.path])).toEqual([
      ['GET', '/commerce/customers/']
    ])

    const response = await rootRoutes.handle(
      new Request('https://example.test/commerce/customers/')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ app: 'commerce' })
  })

  it('routes a Web Request and exposes path params/query params', async () => {
    const router = createRouter()
    router.add('GET', '/users/:id/', (ctx) =>
      jsonResponse({
        id: ctx.params['id'],
        search: ctx.query.get('q')
      })
    )

    const response = await router.handle(
      new Request('https://example.test/users/42/?q=ada')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: '42', search: 'ada' })
  })

  it('returns a DRF-like 404 envelope for unmatched routes', async () => {
    const router = createRouter()

    const response = await router.handle(
      new Request('https://example.test/missing/')
    )

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ detail: 'Not found.' })
  })

  it('returns 405 when the path exists for another method', async () => {
    const router = createRouter()
    router.add('GET', '/users/', () => jsonResponse([]))

    const response = await router.handle(
      new Request('https://example.test/users/', { method: 'POST' })
    )

    expect(response.status).toBe(405)
    expect(await response.json()).toEqual({ detail: 'Method not allowed.' })
  })
})
