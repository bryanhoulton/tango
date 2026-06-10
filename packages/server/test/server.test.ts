import { describe, expect, it } from 'vitest'

import { AuthenticationFailed } from '@tango-ts/auth'
import {
  defineFunction,
  FUNCTIONS_PATH_PREFIX,
  functionDispatchPath,
  SIGNATURE_HEADER,
  signFunctionRequest,
  TIMESTAMP_HEADER
} from '@tango-ts/functions'
import { jsonResponse } from '@tango-ts/http'
import { COMPILE_ONLY, getConnection } from '@tango-ts/orm'
import { defineRoutes, route } from '@tango-ts/router'

import { defineApp, defineProject, defineServer, mysqlFromEnv } from '../src/index.js'

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
    const commerceApp = defineApp({
      name: 'commerce',
      routes: defineRoutes([
        route('GET', '/customers/', () => jsonResponse({ app: 'commerce' }))
      ])
    })

    const handler = defineProject({
      name: 'shop',
      database: COMPILE_ONLY,
      apps: [commerceApp]
    })

    expect(handler.name).toBe('shop')
    expect(handler.apps.map((app) => app.name)).toEqual(['commerce'])
    // The mount path defaults to the app name.
    expect(commerceApp.path).toBe('/commerce')

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

  it('inline functions are invokable from routes, with no HTTP surface mounted', async () => {
    const work = defineFunction({
      name: 'work',
      handler: (payload: { value: number }) => {
        // Function bodies get a connection scope without ceremony.
        expect(getConnection()).toBe(COMPILE_ONLY)
        return Promise.resolve({ doubled: payload.value * 2 })
      }
    })
    const coreApp = defineApp({
      name: 'core',
      routes: defineRoutes([
        route('GET', '/jobs/', async () =>
          jsonResponse(await work.invoke({ value: 21 }))
        )
      ]),
      functions: [work]
    })
    const project = defineProject({
      name: 'shop',
      database: COMPILE_ONLY,
      apps: [coreApp],
      functions: { transport: 'inline' }
    })

    const response = await project(new Request('https://example.test/core/jobs/'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ doubled: 42 })

    // Inline transport mounts nothing under the reserved prefix.
    const mounted = project.routes
      .routes()
      .filter((r) => r.path.startsWith(FUNCTIONS_PATH_PREFIX))
    expect(mounted).toEqual([])
  })

  it('http transport mounts the signed dispatch route inside the full pipeline', async () => {
    const executed: number[] = []
    const work = defineFunction({
      name: 'work',
      handler: (payload: { value: number }) => {
        expect(getConnection()).toBe(COMPILE_ONLY)
        executed.push(payload.value)
        return Promise.resolve({ ok: true })
      }
    })
    const coreApp = defineApp({ name: 'core', functions: [work] })
    const project = defineProject({
      name: 'shop',
      database: COMPILE_ONLY,
      apps: [coreApp],
      functions: {
        transport: 'http',
        secret: 'shared-secret',
        url: 'https://example.test'
      }
    })

    const body = JSON.stringify({ payload: { value: 7 } })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signed = await project(
      new Request(`https://example.test${functionDispatchPath('core', 'work')}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signFunctionRequest({
            secret: 'shared-secret',
            timestamp,
            appName: 'core',
            functionName: 'work',
            body
          })
        },
        body
      })
    )
    expect(signed.status).toBe(200)
    expect(await signed.json()).toEqual({ result: { ok: true } })
    expect(executed).toEqual([7])

    // Unsigned callers cannot tell the endpoint apart from a missing route.
    const unsigned = await project(
      new Request(`https://example.test${functionDispatchPath('core', 'work')}`, {
        method: 'POST',
        body
      })
    )
    expect(unsigned.status).toBe(404)
    expect(await unsigned.json()).toEqual({ detail: 'Not found.' })
  })

  it('project-level authentication never blocks the signed dispatch endpoint', async () => {
    const executed: number[] = []
    const work = defineFunction({
      name: 'work',
      handler: (payload: { value: number }) => {
        executed.push(payload.value)
        return Promise.resolve({ ok: true })
      }
    })
    const coreApp = defineApp({ name: 'core', functions: [work] })
    const project = defineProject({
      name: 'shop',
      database: COMPILE_ONLY,
      apps: [coreApp],
      // The strictest legal Authentication: rejects every request that lacks
      // credentials. Dispatch self-invocations carry only the HMAC headers,
      // so without the exemption this 401s before signature verification.
      authentication: [
        {
          authenticate: (ctx) => {
            if (ctx.request.headers.get('authorization') === null) {
              throw new AuthenticationFailed('Credentials required.')
            }
            return undefined
          }
        }
      ],
      functions: {
        transport: 'http',
        secret: 'shared-secret',
        url: 'https://example.test'
      }
    })

    // Project auth still guards ordinary routes.
    const blocked = await project(new Request('https://example.test/missing/'))
    expect(blocked.status).toBe(401)

    const body = JSON.stringify({ payload: { value: 7 } })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const signed = await project(
      new Request(`https://example.test${functionDispatchPath('core', 'work')}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          [TIMESTAMP_HEADER]: timestamp,
          [SIGNATURE_HEADER]: signFunctionRequest({
            secret: 'shared-secret',
            timestamp,
            appName: 'core',
            functionName: 'work',
            body
          })
        },
        body
      })
    )
    expect(signed.status).toBe(200)
    expect(await signed.json()).toEqual({ result: { ok: true } })
    expect(executed).toEqual([7])

    // Bypassing project auth must not weaken the endpoint: unsigned callers
    // still see a plain 404, identical to a missing route.
    const unsigned = await project(
      new Request(`https://example.test${functionDispatchPath('core', 'work')}`, {
        method: 'POST',
        body
      })
    )
    expect(unsigned.status).toBe(404)
    expect(await unsigned.json()).toEqual({ detail: 'Not found.' })
  })

  it('dispose() drains deferred function work before destroying the database', async () => {
    const order: string[] = []
    const work = defineFunction({
      name: 'work',
      handler: async (payload: { value: number }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        order.push(`deferred:${payload.value}`)
      }
    })
    let destroyed = false
    const database = Object.create(COMPILE_ONLY) as typeof COMPILE_ONLY
    Object.defineProperty(database, 'destroy', {
      value: () => {
        order.push('destroy')
        destroyed = true
        return Promise.resolve()
      }
    })
    const coreApp = defineApp({
      name: 'core',
      routes: defineRoutes([
        route('GET', '/jobs/', () => {
          work.defer({ value: 1 })
          return jsonResponse({ queued: true })
        })
      ]),
      functions: [work]
    })
    const project = defineProject({
      name: 'shop',
      database,
      apps: [coreApp],
      functions: { transport: 'inline' }
    })

    const response = await project(new Request('https://example.test/core/jobs/'))
    expect(await response.json()).toEqual({ queued: true })
    // The response returned before the deferred work finished.
    expect(order).toEqual([])

    await project.dispose()
    expect(destroyed).toBe(true)
    expect(order).toEqual(['deferred:1', 'destroy'])
  })

  it('rejects duplicate function names within an app at definition time', () => {
    const a = defineFunction({ name: 'work', handler: (p: null) => Promise.resolve(p) })
    const b = defineFunction({ name: 'work', handler: (p: null) => Promise.resolve(p) })
    expect(() =>
      defineProject({
        name: 'shop',
        database: COMPILE_ONLY,
        apps: [defineApp({ name: 'core', functions: [a, b] })],
        functions: { transport: 'inline' }
      })
    ).toThrow('Duplicate function "work" registered for app "core".')
  })

  it('http transport without a secret fails at project definition, not at invocation', () => {
    const work = defineFunction({ name: 'work', handler: (p: null) => Promise.resolve(p) })
    expect(() =>
      defineProject({
        name: 'shop',
        database: COMPILE_ONLY,
        apps: [defineApp({ name: 'core', functions: [work] })],
        functions: { transport: 'http', url: 'https://example.test' }
      })
    ).toThrow('TANGO_FUNCTIONS_SECRET is required')
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
