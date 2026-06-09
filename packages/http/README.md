# @tango-ts/http

## Responsibility

Runtime-agnostic Web `Request` / `Response` primitives for Tango. This package owns
request context creation, lazy JSON parsing, JSON/detail response helpers, the
middleware pipeline with its production built-ins (CORS, security headers, body-size
limits, request logging), and the `Logger` contract. It does not own routing, view
dispatch, ORM access, or platform adapters.

## What it responds to

- A Web-standard `Request`.
- Route params from the router.

## Functionality

- `RequestContext` with `request`, `params`, `query`, optional `user`, and lazy `json()`.
- `jsonResponse(body, { status, headers })`.
- `detailResponse(detail, status)`.
- `createRequestContext(request, params)`.
- `Middleware` + `applyMiddleware(handler, middleware)` — Web-standard middleware
  composition, outermost-first.
- Built-in middleware: `cors(...)` (including `OPTIONS` preflights), `securityHeaders(...)`,
  `bodyLimit({ maxBytes })`, `requestLog(...)` (structured logs with `x-request-id`).
- `Logger` contract, `consoleLogger()` (JSON lines), `errorFields(err)`.

## Design patterns that matter here

- **Serverless:** only Web platform types; no Express, Node server objects, or mutable
  process state.
- **Lazy parsing:** request JSON is parsed only when a view asks for it.
- **Auth handoff:** view/auth layers may attach `user`; HTTP itself does not decide
  authentication.
- **Small core:** platform adapters should wrap this package, not change it.

## Public contract

Everything exported from `src/index.ts`.

## Testing

- Unit (`test/middleware.test.ts`): middleware composition order, CORS preflight and
  response decoration, security headers, body limits, and request logging.
- Also covered through `@tango-ts/router` and `@tango-ts/views` tests, including real
  Web `Request` / `Response` integration.
