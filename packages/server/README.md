# @tango-ts/server

## Responsibility

Declarative server entrypoint helpers for Tango apps. This package owns the
user-facing app declaration (`defineApp`), hides the low-level
`withConnection(db, () => router.handle(request))` wiring behind `defineServer`, and
provides `mysqlFromEnv()` for local/dev defaults. It does not own HTTP adapters,
routing, views, ORM behavior, or migrations.

## What it responds to

- App declarations from `defineApp(...)`.
- A declarative router from `defineRoutes(...)`.
- A Kysely database connection.

## Functionality

- `defineApp({ name, path?, models, routes, functions, migrationsDir })` -> a
  self-contained app: models, mounted routes (defaults to `/<name>`), and
  internal functions in one object. Satisfies the ORM's `TangoApp` contract, so
  the CLI's migration commands consume the same module.
- `defineServer({ app, routes, database, middleware, authentication, functionRuntime })` -> Web handler.
- `defineProject({ name, database, routes, apps, middleware, authentication, functions })` ->
  named Web handler for a root project; `apps` is just a list of `defineApp`
  results. Middleware run outermost-first, inside the request's database scope.
  Registers each app's internal functions and (under the http transport) mounts
  the signed dispatch route. The handler exposes `dispose()`, which drains
  deferred function work and releases the database pool at process shutdown.
- `authentication` (project-level, DRF's default authentication classes): runs for
  every request — viewsets *and* plain routes — and places the resolved user on
  `ctx.user`. Invalid credentials short-circuit with a 401; absent credentials
  proceed unauthenticated. Viewsets and `apiView` routes may declare their own
  `authentication` to override.
- `mysqlFromEnv()` -> MySQL connection from `TANGO_DB_*` env vars or
  `TANGO_DATABASE_URL`/`DATABASE_URL`, with TLS (`TANGO_DB_SSL`) and pool sizing
  (`TANGO_DB_POOL_SIZE`). Refuses development defaults when `NODE_ENV=production`.
- `mysqlFromEnv({ projectName })` -> uses the project name as the fallback database
  name when `TANGO_DB_NAME` is not configured.
- Re-exports the middleware built-ins (`cors`, `securityHeaders`, `bodyLimit`,
  `requestLog`, `consoleLogger`) so projects configure everything from one import.

## Design patterns that matter here

- **Clear developer surface:** an app is one object (models + routes + functions);
  the project is a list of apps; framework code owns the request/database scope wiring.
- **Nested apps:** each app carries its own mount path (defaulting to its name).
- **Project metadata:** project names are carried by the returned handler and can be
  reused by OpenAPI, database defaults, logging, and future tooling.
- **Serverless-safe:** still returns a Web handler, so adapters can wrap it for local
  Node, Lambda, Vercel, or Workers.
- **No hidden migrations:** server creation does not run migrations.

## Public contract

Everything exported from `src/index.ts`.

## Testing

- Unit (`test/server.test.ts`): verifies `defineServer` provides request-scoped ORM
  connection context to route handlers.
