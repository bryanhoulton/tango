import { describe, expect, it, vi } from 'vitest'

import { createRequestContext, type Logger } from '@tango-ts/http'
import { COMPILE_ONLY, getConnection } from '@tango-ts/orm'

import {
  createFunctionDispatchHandler,
  createFunctionRegistry,
  createHttpRuntime,
  createInlineRuntime,
  defineFunction,
  FunctionInvocationError,
  functionDispatchPath,
  functionRuntimeFromEnv,
  getFunctionRuntime,
  SIGNATURE_HEADER,
  signFunctionRequest,
  TIMESTAMP_HEADER,
  VERCEL_PROTECTION_BYPASS_HEADER,
  verifyFunctionRequest,
  withFunctionRuntime,
  type FetchLike,
  type FunctionRuntime,
  type JsonResult
} from '../src/index.js'

const silentLogger: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined
}

function signedRequest(options: {
  secret: string
  appName: string
  functionName: string
  payload: unknown
  timestamp?: string
  tamper?: (init: {
    body: string
    headers: Record<string, string>
  }) => { body: string; headers: Record<string, string> }
}): Request {
  const body = JSON.stringify({ payload: options.payload })
  const timestamp = options.timestamp ?? String(Math.floor(Date.now() / 1000))
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: signFunctionRequest({
      secret: options.secret,
      timestamp,
      appName: options.appName,
      functionName: options.functionName,
      body
    })
  }
  const final = options.tamper?.({ body, headers }) ?? { body, headers }
  return new Request(
    `https://example.test${functionDispatchPath(options.appName, options.functionName)}`,
    { method: 'POST', headers: final.headers, body: final.body }
  )
}

describe('signing', () => {
  const input = {
    secret: 's3cret',
    timestamp: String(Math.floor(Date.now() / 1000)),
    appName: 'core',
    functionName: 'sendEmail',
    body: '{"payload":{"userId":1}}'
  }

  it('verifies a signature it produced', () => {
    const signature = signFunctionRequest(input)
    expect(verifyFunctionRequest({ ...input, signature })).toBe(true)
  })

  it('rejects a tampered body', () => {
    const signature = signFunctionRequest(input)
    expect(
      verifyFunctionRequest({
        ...input,
        body: '{"payload":{"userId":2}}',
        signature
      })
    ).toBe(false)
  })

  it('rejects the wrong secret', () => {
    const signature = signFunctionRequest(input)
    expect(
      verifyFunctionRequest({ ...input, secret: 'other', signature })
    ).toBe(false)
  })

  it('rejects timestamps outside the replay window', () => {
    const stale = String(Math.floor(Date.now() / 1000) - 600)
    const signature = signFunctionRequest({ ...input, timestamp: stale })
    expect(
      verifyFunctionRequest({ ...input, timestamp: stale, signature })
    ).toBe(false)
  })

  it('rejects non-numeric timestamps and malformed signatures', () => {
    expect(
      verifyFunctionRequest({ ...input, timestamp: 'soon', signature: 'ab' })
    ).toBe(false)
    expect(
      verifyFunctionRequest({ ...input, signature: 'not-hex' })
    ).toBe(false)
  })
})

describe('registry', () => {
  it('rejects duplicate names within an app', () => {
    const a = defineFunction({ name: 'work', handler: (p: null) => Promise.resolve(p) })
    const b = defineFunction({ name: 'work', handler: (p: null) => Promise.resolve(p) })
    expect(() =>
      createFunctionRegistry([{ appName: 'core', functions: [a, b] }])
    ).toThrow('Duplicate function "work" registered for app "core".')
  })

  it('rejects registering the same function under two apps', () => {
    const fn = defineFunction({ name: 'work', handler: (p: null) => Promise.resolve(p) })
    expect(() =>
      createFunctionRegistry([
        { appName: 'core', functions: [fn] },
        { appName: 'billing', functions: [fn] }
      ])
    ).toThrow('already registered under app "core"')
  })

  it('throws a registration hint for unknown functions', () => {
    const registry = createFunctionRegistry([])
    const stray = defineFunction({ name: 'stray', handler: (p: null) => Promise.resolve(p) })
    expect(() => registry.addressOf(stray)).toThrow(
      'not registered with this project'
    )
  })
})

describe('runtime scope', () => {
  it('invoke() outside a runtime scope throws loudly', async () => {
    const fn = defineFunction({
      name: 'lonely',
      handler: (p: null) => Promise.resolve(p)
    })
    await expect(fn.invoke(null)).rejects.toThrow(
      'No Tango function runtime in scope.'
    )
    expect(() => getFunctionRuntime()).toThrow(
      'No Tango function runtime in scope.'
    )
  })
})

describe('inline runtime', () => {
  function inlineSetup<R extends JsonResult>(
    handler: (payload: { value: number }) => Promise<R>
  ) {
    const fn = defineFunction({ name: 'work', handler })
    const registry = createFunctionRegistry([
      { appName: 'core', functions: [fn] }
    ])
    const runtime = createInlineRuntime({
      registry,
      database: COMPILE_ONLY,
      logger: silentLogger
    })
    return { fn, runtime }
  }

  it('invoke() runs the handler in a fresh connection scope and returns the result', async () => {
    const { fn, runtime } = inlineSetup((payload) => {
      // The function body must be able to use the ORM without ceremony.
      expect(getConnection()).toBe(COMPILE_ONLY)
      return Promise.resolve({ doubled: payload.value * 2 })
    })
    const result = await withFunctionRuntime(runtime, () =>
      fn.invoke({ value: 21 })
    )
    expect(result).toEqual({ doubled: 42 })
  })

  it('invoke() rejects unregistered functions', async () => {
    const { runtime } = inlineSetup((p) => Promise.resolve(p))
    const stray = defineFunction({
      name: 'stray',
      handler: (p: null) => Promise.resolve(p)
    })
    await expect(
      withFunctionRuntime(runtime, () => stray.invoke(null))
    ).rejects.toThrow('not registered with this project')
  })

  it('defer() never throws at the call site, logs failures, and drain() awaits completion', async () => {
    const error = vi.fn()
    const completed: number[] = []
    const fn = defineFunction({
      name: 'work',
      handler: async (payload: { value: number }) => {
        await new Promise((resolve) => setTimeout(resolve, 10))
        if (payload.value < 0) {
          throw new Error('negative')
        }
        completed.push(payload.value)
      }
    })
    const registry = createFunctionRegistry([
      { appName: 'core', functions: [fn] }
    ])
    const runtime = createInlineRuntime({
      registry,
      database: COMPILE_ONLY,
      logger: { ...silentLogger, error }
    })

    await withFunctionRuntime(runtime, () => {
      fn.defer({ value: 7 })
      fn.defer({ value: -1 })
      return Promise.resolve()
    })
    await runtime.drain()

    expect(completed).toEqual([7])
    expect(error).toHaveBeenCalledWith(
      'Deferred function failed',
      expect.objectContaining({ function: 'core/work' })
    )
  })
})

describe('http runtime + dispatch handler', () => {
  function httpSetup(options?: { secret?: string; dispatchSecret?: string }) {
    const secret = options?.secret ?? 'shared-secret'
    const fn = defineFunction({
      name: 'work',
      handler: (payload: { value: number }) => {
        if (payload.value < 0) {
          throw new Error('negative input rejected')
        }
        return Promise.resolve({ doubled: payload.value * 2 })
      }
    })
    const voidFn = defineFunction({
      name: 'fireAndForget',
      handler: (payload: { value: number }): Promise<undefined> => {
        void payload
        return Promise.resolve(undefined)
      }
    })
    const registry = createFunctionRegistry([
      { appName: 'core', functions: [fn, voidFn] }
    ])
    const dispatch = createFunctionDispatchHandler({
      registry,
      secret: options?.dispatchSecret ?? secret,
      logger: silentLogger
    })
    // Loopback fetch: routes the runtime's POST straight into the dispatch
    // handler, exactly as the catch-all rewrite does on Vercel.
    const fetchImpl: FetchLike = async (url, init) => {
      const request = new Request(url, init)
      const parts = url.pathname.split('/').filter((part) => part.length > 0)
      const app = parts[2] ?? ''
      const name = parts[3] ?? ''
      return dispatch(createRequestContext(request, { app, name }))
    }
    const runtime = createHttpRuntime({
      registry,
      baseUrl: 'https://example.test',
      secret,
      logger: silentLogger,
      fetchImpl
    })
    return { fn, voidFn, runtime, dispatch, secret, registry }
  }

  it('invoke() round-trips payload and result over the signed channel', async () => {
    const { fn, runtime } = httpSetup()
    const result = await withFunctionRuntime(runtime, () =>
      fn.invoke({ value: 21 })
    )
    expect(result).toEqual({ doubled: 42 })
  })

  it('void results survive the wire as undefined', async () => {
    const { voidFn, runtime } = httpSetup()
    const result = await withFunctionRuntime(runtime, () =>
      voidFn.invoke({ value: 1 })
    )
    expect(result).toBeUndefined()
  })

  it('handler errors propagate to the caller as FunctionInvocationError', async () => {
    const { fn, runtime } = httpSetup()
    await expect(
      withFunctionRuntime(runtime, () => fn.invoke({ value: -1 }))
    ).rejects.toThrow(FunctionInvocationError)
    await expect(
      withFunctionRuntime(runtime, () => fn.invoke({ value: -1 }))
    ).rejects.toThrow('negative input rejected')
  })

  it('a wrong secret on the caller side surfaces as a 404 invocation error', async () => {
    const { fn, runtime } = httpSetup({
      secret: 'caller-secret',
      dispatchSecret: 'server-secret'
    })
    await expect(
      withFunctionRuntime(runtime, () => fn.invoke({ value: 1 }))
    ).rejects.toThrow('status 404')
  })

  it('defer() completes work before drain() resolves', async () => {
    const { voidFn, runtime } = httpSetup()
    await withFunctionRuntime(runtime, () => {
      voidFn.defer({ value: 5 })
      return Promise.resolve()
    })
    await expect(runtime.drain()).resolves.toBeUndefined()
  })

  it('configured headers are sent on every dispatch, signature headers winning', async () => {
    const fn = defineFunction({
      name: 'work',
      handler: (p: { value: number }) => Promise.resolve(p)
    })
    const registry = createFunctionRegistry([
      { appName: 'core', functions: [fn] }
    ])
    const seen: Record<string, string>[] = []
    const fetchImpl: FetchLike = (url, init) => {
      void url
      seen.push(init.headers)
      return Promise.resolve(
        new Response(JSON.stringify({ result: null }), { status: 200 })
      )
    }
    const runtime = createHttpRuntime({
      registry,
      baseUrl: 'https://example.test',
      secret: 'shared-secret',
      headers: {
        [VERCEL_PROTECTION_BYPASS_HEADER]: 'bypass-secret',
        [SIGNATURE_HEADER]: 'must-not-override'
      },
      logger: silentLogger,
      fetchImpl
    })
    await withFunctionRuntime(runtime, () => fn.invoke({ value: 1 }))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.[VERCEL_PROTECTION_BYPASS_HEADER]).toBe('bypass-secret')
    expect(seen[0]?.[SIGNATURE_HEADER]).not.toBe('must-not-override')
  })

  it('a 401 from in front of the deployment surfaces the protection hint', async () => {
    const fn = defineFunction({
      name: 'work',
      handler: (p: { value: number }) => Promise.resolve(p)
    })
    const registry = createFunctionRegistry([
      { appName: 'core', functions: [fn] }
    ])
    // Vercel Deployment Protection rejects before the request reaches the
    // deployment: an HTML body and a bare 401, never our JSON envelope.
    const fetchImpl: FetchLike = () =>
      Promise.resolve(
        new Response('<html>Authentication Required</html>', {
          status: 401,
          statusText: 'Unauthorized'
        })
      )
    const runtime = createHttpRuntime({
      registry,
      baseUrl: 'https://shop.vercel.app',
      secret: 'shared-secret',
      logger: silentLogger,
      fetchImpl
    })
    const invocation = withFunctionRuntime(runtime, () =>
      fn.invoke({ value: 1 })
    )
    await expect(invocation).rejects.toThrow(FunctionInvocationError)
    await expect(
      withFunctionRuntime(runtime, () => fn.invoke({ value: 1 }))
    ).rejects.toThrow(/Deployment Protection.*VERCEL_AUTOMATION_BYPASS_SECRET/s)
  })
})

describe('dispatch handler rejections', () => {
  const fn = defineFunction({
    name: 'work',
    handler: (p: { value: number }) => Promise.resolve(p)
  })
  const registry = createFunctionRegistry([{ appName: 'core', functions: [fn] }])
  const dispatch = createFunctionDispatchHandler({
    registry,
    secret: 'shared-secret',
    logger: silentLogger
  })

  async function dispatchRequest(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname
    const parts = path.split('/').filter((part) => part.length > 0)
    return dispatch(
      createRequestContext(request, { app: parts[2] ?? '', name: parts[3] ?? '' })
    )
  }

  it('unsigned requests get the router-identical 404', async () => {
    const response = await dispatchRequest(
      new Request('https://example.test/_tango/functions/core/work/', {
        method: 'POST',
        body: JSON.stringify({ payload: { value: 1 } })
      })
    )
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ detail: 'Not found.' })
  })

  it('tampered bodies get a 404', async () => {
    const response = await dispatchRequest(
      signedRequest({
        secret: 'shared-secret',
        appName: 'core',
        functionName: 'work',
        payload: { value: 1 },
        tamper: ({ headers }) => ({
          body: JSON.stringify({ payload: { value: 999 } }),
          headers
        })
      })
    )
    expect(response.status).toBe(404)
  })

  it('replayed (stale) timestamps get a 404', async () => {
    const response = await dispatchRequest(
      signedRequest({
        secret: 'shared-secret',
        appName: 'core',
        functionName: 'work',
        payload: { value: 1 },
        timestamp: String(Math.floor(Date.now() / 1000) - 600)
      })
    )
    expect(response.status).toBe(404)
  })

  it('correctly signed requests for unknown functions get a 404', async () => {
    const response = await dispatchRequest(
      signedRequest({
        secret: 'shared-secret',
        appName: 'core',
        functionName: 'missing',
        payload: { value: 1 }
      })
    )
    expect(response.status).toBe(404)
  })

  it('valid signatures execute the function', async () => {
    const response = await dispatchRequest(
      signedRequest({
        secret: 'shared-secret',
        appName: 'core',
        functionName: 'work',
        payload: { value: 3 }
      })
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ result: { value: 3 } })
  })
})

describe('functionRuntimeFromEnv', () => {
  const fn = defineFunction({ name: 'work', handler: (p: null) => Promise.resolve(p) })
  const registry = createFunctionRegistry([{ appName: 'core', functions: [fn] }])

  function resolve(env: Record<string, string | undefined>) {
    return functionRuntimeFromEnv({
      registry,
      database: COMPILE_ONLY,
      logger: silentLogger,
      env
    })
  }

  it('defaults to inline locally', () => {
    expect(resolve({}).transport).toBe('inline')
  })

  it('defaults to http on Vercel', () => {
    const resolved = resolve({
      VERCEL: '1',
      VERCEL_URL: 'shop.vercel.app',
      TANGO_FUNCTIONS_SECRET: 's3cret'
    })
    expect(resolved.transport).toBe('http')
    expect(resolved.secret).toBe('s3cret')
  })

  it('http transport without a secret fails at startup', () => {
    expect(() => resolve({ VERCEL: '1', VERCEL_URL: 'shop.vercel.app' })).toThrow(
      'TANGO_FUNCTIONS_SECRET is required'
    )
  })

  it('http transport without a resolvable URL fails at startup', () => {
    expect(() =>
      resolve({ TANGO_FUNCTIONS_TRANSPORT: 'http', TANGO_FUNCTIONS_SECRET: 's' })
    ).toThrow('Cannot resolve the function dispatch URL')
  })

  it('rejects unknown transports', () => {
    expect(() => resolve({ TANGO_FUNCTIONS_TRANSPORT: 'queue' })).toThrow(
      'Invalid TANGO_FUNCTIONS_TRANSPORT "queue"'
    )
  })

  it('sends the Vercel protection bypass header when the platform provides the secret', async () => {
    const seen: Record<string, string>[] = []
    const fetchImpl: FetchLike = (url, init) => {
      void url
      seen.push(init.headers)
      return Promise.resolve(
        new Response(JSON.stringify({ result: null }), { status: 200 })
      )
    }
    const resolved = functionRuntimeFromEnv({
      registry,
      database: COMPILE_ONLY,
      logger: silentLogger,
      env: {
        VERCEL: '1',
        VERCEL_URL: 'shop.vercel.app',
        TANGO_FUNCTIONS_SECRET: 's3cret',
        VERCEL_AUTOMATION_BYPASS_SECRET: 'bypass-secret'
      },
      fetchImpl
    })
    await withFunctionRuntime(resolved.runtime, () => fn.invoke(null))
    expect(seen[0]?.[VERCEL_PROTECTION_BYPASS_HEADER]).toBe('bypass-secret')
  })

  it('omits the bypass header when the platform secret is absent', async () => {
    const seen: Record<string, string>[] = []
    const fetchImpl: FetchLike = (url, init) => {
      void url
      seen.push(init.headers)
      return Promise.resolve(
        new Response(JSON.stringify({ result: null }), { status: 200 })
      )
    }
    const resolved = functionRuntimeFromEnv({
      registry,
      database: COMPILE_ONLY,
      logger: silentLogger,
      env: {
        VERCEL: '1',
        VERCEL_URL: 'shop.vercel.app',
        TANGO_FUNCTIONS_SECRET: 's3cret'
      },
      fetchImpl
    })
    await withFunctionRuntime(resolved.runtime, () => fn.invoke(null))
    expect(seen[0]).not.toHaveProperty(VERCEL_PROTECTION_BYPASS_HEADER)
  })

  it('explicit overrides beat the environment', () => {
    const resolved = functionRuntimeFromEnv({
      registry,
      database: COMPILE_ONLY,
      logger: silentLogger,
      overrides: { transport: 'http', secret: 's', url: 'http://127.0.0.1:8000' },
      env: { TANGO_FUNCTIONS_TRANSPORT: 'inline' }
    })
    expect(resolved.transport).toBe('http')
  })
})

describe('nested invocation', () => {
  it('a function can invoke another function (runtime scope propagates)', async () => {
    const inner = defineFunction({
      name: 'inner',
      handler: (payload: { value: number }) =>
        Promise.resolve({ value: payload.value + 1 })
    })
    const outer = defineFunction({
      name: 'outer',
      handler: async (payload: { value: number }) => inner.invoke(payload)
    })
    const registry = createFunctionRegistry([
      { appName: 'core', functions: [inner, outer] }
    ])
    const runtime: FunctionRuntime = createInlineRuntime({
      registry,
      database: COMPILE_ONLY,
      logger: silentLogger
    })
    const result = await withFunctionRuntime(runtime, () =>
      outer.invoke({ value: 1 })
    )
    expect(result).toEqual({ value: 2 })
  })
})
