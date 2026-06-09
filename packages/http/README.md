# @tango-ts/http

## Responsibility

Runtime-agnostic Web `Request` / `Response` primitives for Tango. This package owns
request context creation, lazy JSON parsing, and JSON/detail response helpers. It does
not own routing, view dispatch, ORM access, or platform adapters.

## What it responds to

- A Web-standard `Request`.
- Route params from the router.

## Functionality

- `RequestContext` with `request`, `params`, `query`, optional `user`, and lazy `json()`.
- `jsonResponse(body, { status, headers })`.
- `detailResponse(detail, status)`.
- `createRequestContext(request, params)`.

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

Covered through `@tango-ts/router` and `@tango-ts/views` tests, including real Web
`Request` / `Response` integration.
