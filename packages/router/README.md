# @tango-ts/router

## Responsibility

Serverless-friendly routing for Tango. This package matches Web `Request` paths and
methods, extracts path params, builds `RequestContext`, and dispatches handlers. It
does not own view behavior, serialization, database access, or platform adapters.

## What it responds to

- A Web-standard `Request`.
- Routes registered directly with `add(...)` or from a routable viewset via
  `register(...)`.

## Functionality

- `createRouter()`.
- `defineRoutes([...])`.
- `route('/base', viewset)` for routables.
- `route('GET', '/path/', handler)` for direct handlers.
- `include('/prefix', routes)` for nesting app route collections under project-level
  prefixes.
- `router.add(method, path, handler)`.
- `router.register(basePath, routable)`.
- `router.handle(request)` returning a Web `Response`.
- DRF-like `{ detail }` envelopes for 404 and 405.

## Design patterns that matter here

- **Web-only core:** no Express-style request/response objects.
- **Deterministic routes:** route definitions are explicit; no filesystem routing.
- **Declarative app surface:** prefer `defineRoutes([route(...)])` in application code;
  `createRouter()` remains the lower-level primitive.
- **Nested apps:** app-level routes can be composed at the project root with
  `include(...)`, preserving route metadata for OpenAPI.
- **No request globals:** database/auth state is supplied outside the router lifecycle.

## Public contract

Everything exported from `src/index.ts`.

## Testing

- Unit (`test/router.test.ts`): declarative route definitions, path params, query
  params, 404, and 405 behavior.
- Integration coverage through `@tango-ts/views` ModelViewSet tests.
