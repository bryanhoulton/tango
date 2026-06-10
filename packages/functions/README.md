# @tango-ts/functions

## Responsibility

Internal serverless functions for Tango apps. Each app declares typed units of
work in its `functions/` folder, registered on the app itself
(`defineApp({ ..., functions })`) and invoked from inside Tango logic with
`fn.invoke(payload)` (awaited, typed result) or `fn.defer(payload)`
(fire-and-forget). They are never part of the
public API surface. This package owns the function definition, the per-project
registry, the transports (inline and signed http self-invocation), the HMAC
protocol, and the dispatch handler. It does not own route mounting or the
request pipeline — `@tango-ts/server` wires those.

## What it responds to

- `fn.invoke()` / `fn.defer()` calls from routes, viewsets, middleware, or
  other functions.
- Signed `POST /_tango/functions/:app/:name/` requests (the receiving end of
  the http transport).

## Functionality

- `defineFunction({ name, handler })` — payload and result types inferred from
  the handler; both are constrained to `JsonValue` at the type level so
  non-serializable types fail to compile.
- `createFunctionRegistry(registrations)` — explicit per-app registration, no
  filesystem discovery (deterministic serverless bundles, like `defineApp`).
- `withFunctionRuntime` / `getFunctionRuntime` — request-scoped transport via
  `AsyncLocalStorage`, mirroring the ORM's `withConnection`.
- `createInlineRuntime` — in-process execution (local default). Runs handlers
  in a fresh connection scope, so an `invoke` inside `atomic()` does not join
  the caller's transaction — matching production semantics.
- `createHttpRuntime` — signed POST back to this deployment (Vercel default),
  so each invocation gets its own timeout/memory budget.
- `createFunctionDispatchHandler` — verifies HMAC (timestamp + app + name +
  raw body, ±5 min replay window, constant-time compare) and executes; every
  rejection is a router-identical 404.
- `functionRuntimeFromEnv` — transport resolution: `TANGO_FUNCTIONS_TRANSPORT`
  (defaults to `http` on Vercel, `inline` elsewhere), `TANGO_FUNCTIONS_SECRET`
  (required for http; fails at startup), `TANGO_FUNCTIONS_URL` (defaults to
  `https://$VERCEL_URL`).
- `defer` keeps work alive via Vercel's `waitUntil` when present (read from the
  runtime global, no platform dependency); runtimes expose `drain()` and the
  project's `dispose()` awaits it during graceful shutdown.

## Design patterns that matter here

- **Not callable by API:** the dispatch endpoint only exists under the http
  transport, lives under the reserved `/_tango/` prefix, answers 404 to
  anything unsigned, and is never emitted by the OpenAPI generator.
- **Serverless-first:** no worker loop, no queue, no module-level mutable
  state. Every execution is a stateless invocation; the platform is the
  executor.
- **Ambient context:** the transport is request-scoped, never global, so warm
  instances cannot leak runtimes across requests.
- **Trusted channel, typed boundary:** payloads are validated by the compiler
  at the call site and authenticated by HMAC on the wire; runtime schema
  validation can layer on later without contract changes.

## Public contract

Everything exported from `src/index.ts`.

## Testing

- Unit (`test/functions.test.ts`): signing round-trip/tamper/replay, registry
  duplicate rejection, inline and http runtimes (loopback fetch through the
  real dispatch handler), defer/drain semantics, env resolution, nested
  invocation.
- Type-level (`test/functions.test-d.ts`): payload/result inference; Date,
  Map, and function payloads fail to compile.
- Integration (`test/functions.integration.test.ts`): the full production
  path over real sockets and a real MySQL — route handler → signed POST to the
  project's own server → dispatch → ORM write — plus unsigned-request
  rejection and deferred-work completion.
- The dispatch mount, request-pipeline scoping, and `dispose()` drain are
  covered in `@tango-ts/server` tests; OpenAPI invisibility in
  `@tango-ts/openapi` tests.
