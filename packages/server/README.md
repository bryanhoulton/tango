# @tango-ts/server

## Responsibility

Declarative server entrypoint helpers for Tango apps. This package hides the low-level
`withConnection(db, () => router.handle(request))` wiring behind `defineServer`, and
provides `mysqlFromEnv()` for local/dev defaults. It does not own HTTP adapters,
routing, views, ORM behavior, or migrations.

## What it responds to

- A Tango app (`defineApp(...)`) when available.
- A declarative router from `defineRoutes(...)`.
- A Kysely database connection.

## Functionality

- `defineServer({ app, routes, database })` -> Web handler.
- `defineProject({ name, database, routes, apps })` -> named Web handler for a root
  project with nested apps.
- `mysqlFromEnv()` -> MySQL connection using `TANGO_DB_*` env vars.
- `mysqlFromEnv({ projectName })` -> uses the project name as the fallback database
  name when `TANGO_DB_NAME` is not configured.

## Design patterns that matter here

- **Clear developer surface:** app code declares app, routes, and server; framework code
  owns the request/database scope wiring.
- **Nested apps:** project code composes app declarations and route collections under
  path prefixes.
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
