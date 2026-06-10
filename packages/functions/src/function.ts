import { getFunctionRuntime } from './runtime.js'

/**
 * A JSON-serializable value. Function payloads and results cross an HTTP
 * boundary on serverless platforms, so they must round-trip through JSON. The
 * constraint is enforced at the type level: passing a Date, Map, or class
 * instance fails to compile instead of corrupting silently at runtime.
 *
 * Note: object payloads should be declared with type aliases or inline object
 * types. Interfaces lack the implicit index signature TypeScript needs to
 * check assignability against `JsonValue`.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue | undefined }

/** What a function may return: any JSON value, or nothing. */
export type JsonResult = JsonValue | undefined | void

export interface TangoFunctionConfig<
  P extends JsonValue,
  R extends JsonResult
> {
  /** Unique within the app that registers this function. */
  readonly name: string
  readonly handler: (payload: P) => Promise<R>
}

/**
 * The type-erased view of a function — what registries and the dispatch layer
 * operate on. `TangoFunction<P, R>` is not assignable to `TangoFunction<JsonValue,
 * JsonResult>` (handlers are contravariant in their payload), so registration
 * lists use this shape instead.
 */
export interface AnyTangoFunction {
  readonly name: string
  /**
   * Execute the handler directly. This is the dispatch-layer entrypoint;
   * application code calls `invoke()`/`defer()` so the configured transport
   * decides where the work runs.
   */
  readonly run: (payload: JsonValue) => Promise<JsonResult>
}

export interface TangoFunction<P extends JsonValue, R extends JsonResult>
  extends AnyTangoFunction {
  /**
   * Run the function and await its typed result. Inline transport executes
   * in-process in a fresh connection scope; http transport offloads to a
   * separate serverless invocation with its own timeout and memory budget.
   * Must be called inside a running Tango project (the runtime is request-scoped).
   */
  readonly invoke: (payload: P) => Promise<R>
  /**
   * Fire-and-forget. Errors are logged, never thrown at the call site. On
   * Vercel the work is kept alive via the platform's `waitUntil`; locally it is
   * drained on graceful shutdown.
   */
  readonly defer: (payload: P) => void
}

/**
 * Define an internal serverless function. These live in an app's `functions/`
 * folder, are registered on the app (`defineApp({ ..., functions })`), and are
 * never part of the public API — they can only be invoked from inside Tango
 * logic.
 */
export function defineFunction<P extends JsonValue, R extends JsonResult>(
  config: TangoFunctionConfig<P, R>
): TangoFunction<P, R> {
  const fn: TangoFunction<P, R> = {
    name: config.name,
    // The wire side hands us JsonValue; the only producer is the typed
    // invoke()/defer() below, over an authenticated channel, so the cast is
    // the trusted-boundary equivalent of deserialization.
    run: (payload) => config.handler(payload as P),
    async invoke(payload: P): Promise<R> {
      return (await getFunctionRuntime().invoke(fn, payload)) as R
    },
    defer(payload: P): void {
      getFunctionRuntime().defer(fn, payload)
    }
  }
  return fn
}
