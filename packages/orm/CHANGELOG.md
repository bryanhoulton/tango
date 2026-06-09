# @tango-ts/orm

## 0.4.0

### Patch Changes

- @tango-ts/core-types@0.4.0

## 0.3.0

### Minor Changes

- Production feedback from a real Vercel + PlanetScale deployment:

  - `f.foreignKey(..., { dbConstraint: false })` (Django's `db_constraint=False`)
    keeps the reference for joins/typing but skips FOREIGN KEY DDL — required on
    PlanetScale (Vitess), which rejects FK constraints.
  - `ensureMysqlDatabase` (used by `tango migrate`) now carries TLS settings onto
    the server-level connection, and tolerates managed MySQL that forbids
    `CREATE DATABASE` as long as the target database is reachable.
  - Boolean columns now come back from MySQL as `true`/`false` instead of
    tinyint `0`/`1` — a driver-level cast in `createMysqlConnection`, so the
    ORM, viewsets, and serializer output all see real booleans.
  - New `addOpenApiRoute(project)` in `@tango-ts/openapi` serves the generated
    OpenAPI 3.1 document (default `GET /openapi.json`); generated projects now
    wire it up out of the box.

### Patch Changes

- @tango-ts/core-types@0.3.0

## 0.2.2

### Patch Changes

- @tango-ts/core-types@0.2.2

## 0.2.1

### Patch Changes

- @tango-ts/core-types@0.2.1

## 0.2.0

### Minor Changes

- Production hardening and out-of-the-box Vercel deployment.

  - ORM: `QuerySet.orderBy/limit/offset/count`; viewset pagination now runs in SQL
    (`COUNT(*)` + ordered `LIMIT/OFFSET`) with deterministic ordering.
  - Middleware pipeline (`defineProject({ middleware })`) with built-ins: `cors`
    (incl. `OPTIONS` preflights), `securityHeaders`, `bodyLimit`, `requestLog`
    (structured logs with request IDs), plus a `Logger` contract.
  - Adapters: unhandled errors are logged instead of swallowed; streaming request
    body size cap (413); `@tango-ts/adapters/vercel` subpath export with
    `vercelHandler` for Vercel's Node runtime fetch handlers.
  - Config: shared `mysqlConfigFromEnv` with `TANGO_DATABASE_URL`/`DATABASE_URL`,
    TLS (`TANGO_DB_SSL`) and pool sizing (`TANGO_DB_POOL_SIZE`); refuses dev
    defaults when `NODE_ENV=production`; defaults to 1 pooled connection per
    instance on Vercel.
  - Serializers: `datetime`/`date` fields accept ISO 8601 strings over JSON.
  - Views/auth: per-request queryset scoping (`queryset` option; out-of-scope rows 404) and object-level permissions (`hasObjectPermission` on permission
    classes, `objectPermission` option).
  - CLI: `tango serve` reads `HOST`/`PORT`, drains in-flight requests on SIGTERM,
    and disposes the database pool; generated projects ship a Dockerfile,
    `.env.example`, `.gitignore`, `start` script, deploy guide, and a pre-wired
    Vercel entrypoint (`api/index.ts` + `vercel.json`).

### Patch Changes

- @tango-ts/core-types@0.2.0

## 0.1.2

### Patch Changes

- @tango-ts/core-types@0.1.2

## 0.1.1

### Patch Changes

- @tango-ts/core-types@0.1.1

## 0.1.0

### Minor Changes

- Publish the first public Tango package release.

### Patch Changes

- Updated dependencies
  - @tango-ts/core-types@0.1.0
