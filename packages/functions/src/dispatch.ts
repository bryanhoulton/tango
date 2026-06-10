import {
  consoleLogger,
  detailResponse,
  errorFields,
  jsonResponse,
  type Logger,
  type RequestContext
} from '@tango-ts/http'

import type { JsonValue } from './function.js'
import type { FunctionRegistry } from './runtime.js'
import {
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  verifyFunctionRequest
} from './signing.js'

export interface DispatchHandlerOptions {
  readonly registry: FunctionRegistry
  readonly secret: string
  readonly logger?: Logger
  /** Clock override for tests. Defaults to Date.now. */
  readonly now?: () => number
}

/**
 * Handler for `POST /_tango/functions/:app/:name/` — the receiving end of the
 * http transport. Mounted by `defineProject` when the http transport is active;
 * the surrounding server pipeline already establishes the database connection
 * and function runtime scopes.
 *
 * Every rejection is a plain 404 identical to the router's, so the endpoint is
 * indistinguishable from a missing route to unauthenticated callers.
 */
export function createFunctionDispatchHandler(
  options: DispatchHandlerOptions
): (ctx: RequestContext) => Promise<Response> {
  const logger = options.logger ?? consoleLogger()
  return async (ctx) => {
    const appName = ctx.params.app
    const functionName = ctx.params.name
    const timestamp = ctx.request.headers.get(TIMESTAMP_HEADER)
    const signature = ctx.request.headers.get(SIGNATURE_HEADER)
    if (
      appName === undefined ||
      functionName === undefined ||
      timestamp === null ||
      signature === null
    ) {
      return detailResponse('Not found.', 404)
    }
    const body = await ctx.request.text()
    const verified = verifyFunctionRequest({
      secret: options.secret,
      timestamp,
      appName,
      functionName,
      body,
      signature,
      now: options.now
    })
    if (!verified) {
      return detailResponse('Not found.', 404)
    }
    const fn = options.registry.lookup(appName, functionName)
    if (fn === undefined) {
      return detailResponse('Not found.', 404)
    }
    let payload: JsonValue
    try {
      payload = (JSON.parse(body) as { readonly payload?: JsonValue }).payload ?? null
    } catch {
      return detailResponse('Invalid payload.', 400)
    }
    try {
      const result = await fn.run(payload)
      // `undefined` results serialize to `{}`; the http runtime reads them back
      // as `undefined`, preserving void returns across the wire.
      return jsonResponse({ result })
    } catch (err) {
      logger.error('Function invocation failed', {
        function: `${appName}/${functionName}`,
        ...errorFields(err)
      })
      // This channel is authenticated (the signature verified above), so the
      // error message flows back to the internal caller for debugging. It never
      // reaches the public API.
      return jsonResponse(
        {
          detail:
            err instanceof Error ? err.message : 'Function invocation failed.'
        },
        { status: 500 }
      )
    }
  }
}
