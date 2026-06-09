# @tango-ts/cli

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

- Updated dependencies
  - @tango-ts/orm@0.3.0
  - @tango-ts/migrations@0.3.0
  - @tango-ts/adapters@0.3.0

## 0.2.2

### Patch Changes

- Generated `vercel.json` now writes a placeholder file into the static output
  directory (`mkdir -p public && touch public/.keep`). Vercel rejects an empty
  output directory ("Output Directory is empty"), and a dotfile placeholder is
  the one kind of static file that can never shadow the catch-all API rewrite.
  - @tango-ts/adapters@0.2.2
  - @tango-ts/migrations@0.2.2
  - @tango-ts/orm@0.2.2

## 0.2.1

### Patch Changes

- Fix Vercel deploys of generated projects: `vercel.json` now sets
  `buildCommand: "mkdir -p public"` and `outputDirectory: "public"`. Without
  them, Vercel ran the package.json build script and then failed looking for a
  `public` static output directory in this functions-only project.
  - @tango-ts/adapters@0.2.1
  - @tango-ts/migrations@0.2.1
  - @tango-ts/orm@0.2.1

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
  - @tango-ts/adapters@0.2.0
  - @tango-ts/orm@0.2.0
  - @tango-ts/migrations@0.2.0

## 0.1.2

### Patch Changes

- Add an explicit `rootDir` to generated project TypeScript config for TS6.
  - @tango-ts/adapters@0.1.2
  - @tango-ts/migrations@0.1.2
  - @tango-ts/orm@0.1.2

## 0.1.1

### Patch Changes

- Fix generated projects so packaged CLI scaffolds include root config files and `tango serve` works with the default generated handler.
  - @tango-ts/adapters@0.1.1
  - @tango-ts/migrations@0.1.1
  - @tango-ts/orm@0.1.1

## 0.1.0

### Minor Changes

- Publish the first public Tango package release.

### Patch Changes

- Updated dependencies
  - @tango-ts/adapters@0.1.0
  - @tango-ts/migrations@0.1.0
  - @tango-ts/orm@0.1.0
