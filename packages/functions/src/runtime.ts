import { AsyncLocalStorage } from 'node:async_hooks'

import type { Kysely } from 'kysely'

import { consoleLogger, errorFields, type Logger } from '@tango-ts/http'
import { withConnection, type LooseDatabase } from '@tango-ts/orm'

import type { AnyTangoFunction, JsonResult, JsonValue } from './function.js'
import {
  functionDispatchPath,
  SIGNATURE_HEADER,
  signFunctionRequest,
  TIMESTAMP_HEADER
} from './signing.js'

export interface FunctionRegistration {
  readonly appName: string
  readonly functions: readonly AnyTangoFunction[]
}

export interface FunctionAddress {
  readonly appName: string
  readonly functionName: string
}

/**
 * Maps registered functions to their app-qualified address and back. Built once
 * at project definition from the explicit per-app registration lists — no
 * filesystem discovery, so serverless bundles stay deterministic (same rationale
 * as `defineApp`).
 */
export class FunctionRegistry {
  private readonly byName = new Map<string, AnyTangoFunction>()
  private readonly byFunction = new Map<AnyTangoFunction, FunctionAddress>()

  constructor(registrations: readonly FunctionRegistration[]) {
    for (const { appName, functions } of registrations) {
      for (const fn of functions) {
        const key = `${appName}/${fn.name}`
        if (this.byName.has(key)) {
          throw new Error(
            `Duplicate function "${fn.name}" registered for app "${appName}".`
          )
        }
        const existing = this.byFunction.get(fn)
        if (existing !== undefined) {
          throw new Error(
            `Function "${fn.name}" is already registered under app "${existing.appName}". Register each function exactly once.`
          )
        }
        this.byName.set(key, fn)
        this.byFunction.set(fn, { appName, functionName: fn.name })
      }
    }
  }

  get size(): number {
    return this.byName.size
  }

  lookup(appName: string, functionName: string): AnyTangoFunction | undefined {
    return this.byName.get(`${appName}/${functionName}`)
  }

  addressOf(fn: AnyTangoFunction): FunctionAddress {
    const address = this.byFunction.get(fn)
    if (address === undefined) {
      throw new Error(
        `Function "${fn.name}" is not registered with this project. Add it to the app's functions list: defineApp({ ..., functions }).`
      )
    }
    return address
  }
}

export function createFunctionRegistry(
  registrations: readonly FunctionRegistration[]
): FunctionRegistry {
  return new FunctionRegistry(registrations)
}

/**
 * The transport behind `fn.invoke()` / `fn.defer()`. Created per project and
 * placed in request scope by the server, mirroring the ORM's `withConnection`.
 */
export interface FunctionRuntime {
  readonly invoke: (
    fn: AnyTangoFunction,
    payload: JsonValue
  ) => Promise<JsonResult>
  readonly defer: (fn: AnyTangoFunction, payload: JsonValue) => void
  /** Await deferred work still in flight. Called during graceful shutdown. */
  readonly drain: () => Promise<void>
}

// Request-scoped runtime, same pattern (and rationale) as the ORM's connection
// storage: keeps `fn.invoke(payload)` ergonomic without threading a runtime
// everywhere, while never holding mutable module-level state (P5).
const storage = new AsyncLocalStorage<FunctionRuntime>()

/** Run `fn` with `runtime` as the active function runtime for everything inside it. */
export function withFunctionRuntime<T>(
  runtime: FunctionRuntime,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(runtime, fn)
}

/** Get the active runtime, or throw if execution isn't inside `withFunctionRuntime`. */
export function getFunctionRuntime(): FunctionRuntime {
  const runtime = storage.getStore()
  if (runtime === undefined) {
    throw new Error(
      'No Tango function runtime in scope. Functions can only be invoked inside a running project (defineProject wires the runtime per request), or inside withFunctionRuntime(runtime, () => ...).'
    )
  }
  return runtime
}

/** Thrown by the http transport when the dispatched invocation fails. */
export class FunctionInvocationError extends Error {
  constructor(
    readonly functionName: string,
    readonly status: number,
    detail: string
  ) {
    super(`Function "${functionName}" failed with status ${status}: ${detail}`)
    this.name = 'FunctionInvocationError'
  }
}

interface VercelRequestContext {
  readonly waitUntil?: (promise: Promise<unknown>) => void
}

interface VercelRequestContextHolder {
  readonly get?: () => VercelRequestContext | undefined
}

/**
 * Hand a promise to Vercel's `waitUntil` when running there, so deferred work
 * survives past the response. Reads the runtime-provided global directly (the
 * same source `@vercel/functions` uses) to avoid a platform dependency in core.
 */
function vercelWaitUntil(promise: Promise<unknown>): void {
  const holder = (
    globalThis as { readonly [key: symbol]: VercelRequestContextHolder | undefined }
  )[Symbol.for('@vercel/request-context')]
  if (holder === undefined || typeof holder.get !== 'function') {
    return
  }
  const context = holder.get()
  if (context !== undefined && typeof context.waitUntil === 'function') {
    context.waitUntil(promise)
  }
}

class DeferredTracker {
  private readonly pending = new Set<Promise<void>>()

  track(promise: Promise<void>): void {
    this.pending.add(promise)
    void promise.finally(() => this.pending.delete(promise))
    vercelWaitUntil(promise)
  }

  async drain(): Promise<void> {
    // Deferred work may defer more work; loop until quiescent.
    while (this.pending.size > 0) {
      await Promise.allSettled([...this.pending])
    }
  }
}

function deferredFailureLogger(
  logger: Logger,
  address: FunctionAddress
): (err: unknown) => void {
  return (err) => {
    logger.error('Deferred function failed', {
      function: `${address.appName}/${address.functionName}`,
      ...errorFields(err)
    })
  }
}

export interface InlineRuntimeOptions {
  readonly registry: FunctionRegistry
  readonly database: Kysely<LooseDatabase>
  readonly logger?: Logger
}

/**
 * In-process transport — the local default. Executes the handler directly, but
 * in a *fresh* connection scope: on Vercel an invocation is a separate function
 * instance and never joins the caller's transaction, so inline execution must
 * not either (calling `invoke` inside `atomic()` does not extend the transaction).
 */
export function createInlineRuntime(
  options: InlineRuntimeOptions
): FunctionRuntime {
  const logger = options.logger ?? consoleLogger()
  const tracker = new DeferredTracker()

  const execute = (
    fn: AnyTangoFunction,
    payload: JsonValue
  ): Promise<JsonResult> => {
    // Validate registration so a function missing from the project config
    // fails identically under both transports.
    options.registry.addressOf(fn)
    return withConnection(options.database, () => fn.run(payload))
  }

  return {
    invoke: execute,
    defer(fn, payload) {
      const address = options.registry.addressOf(fn)
      tracker.track(
        execute(fn, payload).then(
          () => undefined,
          deferredFailureLogger(logger, address)
        )
      )
    },
    drain: () => tracker.drain()
  }
}

/**
 * The slice of fetch the http transport needs. Narrower than `typeof fetch` so
 * test doubles stay trivial and DOM/undici `Request` type differences never leak
 * into the contract.
 */
export type FetchLike = (
  url: URL,
  init: {
    readonly method: string
    readonly headers: Record<string, string>
    readonly body: string
  }
) => Promise<Response>

/**
 * Header that bypasses Vercel Deployment Protection. Sent on every dispatch
 * when `VERCEL_AUTOMATION_BYPASS_SECRET` is available — without it, the
 * self-invocation to `https://$VERCEL_URL` is rejected at Vercel's edge (401)
 * before it ever reaches the deployment, on any protected URL.
 */
export const VERCEL_PROTECTION_BYPASS_HEADER = 'x-vercel-protection-bypass'

export interface HttpRuntimeOptions {
  readonly registry: FunctionRegistry
  /** Base URL of this deployment, e.g. `https://$VERCEL_URL`. */
  readonly baseUrl: string
  readonly secret: string
  /**
   * Extra headers sent on every dispatch request, e.g. the Vercel deployment
   * protection bypass header. Signature headers always win on conflict.
   */
  readonly headers?: Readonly<Record<string, string>>
  readonly logger?: Logger
  /** Fetch override for tests. Defaults to the global fetch. */
  readonly fetchImpl?: FetchLike
  /** Clock override for tests. Defaults to Date.now. */
  readonly now?: () => number
}

async function responseDetail(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { readonly detail?: unknown }
    if (typeof data.detail === 'string') {
      return data.detail
    }
  } catch {
    // Non-JSON error body; fall through to the status text.
  }
  return response.statusText === '' ? 'Unknown error.' : response.statusText
}

/**
 * The dispatch endpoint never answers 401/403 (rejections are router-identical
 * 404s, and project auth is bypassed for the reserved prefix), so either status
 * means something in front of the deployment intercepted the self-invocation —
 * on Vercel, almost always Deployment Protection on the `*.vercel.app` URL.
 */
function interceptionHint(status: number): string {
  if (status !== 401 && status !== 403) {
    return ''
  }
  return (
    ' The dispatch endpoint never returns this status, so the request was' +
    ' intercepted before reaching the deployment — most likely Vercel' +
    ' Deployment Protection. Enable "Protection Bypass for Automation" in the' +
    ' Vercel project settings (the transport sends' +
    ` ${VERCEL_PROTECTION_BYPASS_HEADER} automatically when` +
    ' VERCEL_AUTOMATION_BYPASS_SECRET is set), or point TANGO_FUNCTIONS_URL' +
    ' at an unprotected URL.'
  )
}

/**
 * Signed self-invocation transport — the Vercel default. Each `invoke` becomes
 * a POST to this deployment's internal dispatch endpoint, so the work runs as
 * its own serverless invocation with its own timeout and memory budget.
 */
export function createHttpRuntime(options: HttpRuntimeOptions): FunctionRuntime {
  const logger = options.logger ?? consoleLogger()
  const fetchImpl = options.fetchImpl ?? fetch
  const now = options.now ?? Date.now
  const tracker = new DeferredTracker()

  const execute = async (
    fn: AnyTangoFunction,
    payload: JsonValue
  ): Promise<JsonResult> => {
    const address = options.registry.addressOf(fn)
    const body = JSON.stringify({ payload })
    const timestamp = String(Math.floor(now() / 1000))
    const signature = signFunctionRequest({
      secret: options.secret,
      timestamp,
      appName: address.appName,
      functionName: address.functionName,
      body
    })
    const url = new URL(
      functionDispatchPath(address.appName, address.functionName),
      options.baseUrl
    )
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        ...options.headers,
        'content-type': 'application/json',
        [TIMESTAMP_HEADER]: timestamp,
        [SIGNATURE_HEADER]: signature
      },
      body
    })
    if (!response.ok) {
      throw new FunctionInvocationError(
        `${address.appName}/${address.functionName}`,
        response.status,
        `${await responseDetail(response)}${interceptionHint(response.status)}`
      )
    }
    const data = (await response.json()) as { readonly result?: JsonValue }
    return data.result
  }

  return {
    invoke: execute,
    defer(fn, payload) {
      const address = options.registry.addressOf(fn)
      tracker.track(
        execute(fn, payload).then(
          () => undefined,
          deferredFailureLogger(logger, address)
        )
      )
    },
    drain: () => tracker.drain()
  }
}
