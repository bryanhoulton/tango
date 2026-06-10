# @tango-ts/adapters

## 0.7.0

### Patch Changes

- @tango-ts/http@0.7.0

## 0.6.0

### Patch Changes

- @tango-ts/http@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies
  - @tango-ts/http@0.5.0

## 0.4.0

### Patch Changes

- @tango-ts/http@0.4.0

## 0.3.0

### Patch Changes

- @tango-ts/http@0.3.0

## 0.2.2

### Patch Changes

- @tango-ts/http@0.2.2

## 0.2.1

### Patch Changes

- @tango-ts/http@0.2.1

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

- Updated dependencies
  - @tango-ts/http@0.2.0

## 0.1.2

## 0.1.1

## 0.1.0

### Minor Changes

- Publish the first public Tango package release.
