# @tango-ts/views

## 0.8.0

### Minor Changes

- Custom viewset actions get full DRF `@action` semantics. Detail action handlers
  now receive `(ctx, row)` with the row resolved through the scoped queryset
  (missing or out-of-scope rows 404) and past the object-permission pass. Actions
  may declare per-action `authentication` and `permissions` that replace the
  viewset-level classes, and `detail` defaults to `false`. Collection action
  routes now register before the `/:id/` routes so `GET /users/export/` is never
  captured as a retrieve.
- Internal `@tango-ts/*` dependencies are now `peerDependencies` instead of `dependencies`. Package managers therefore never install nested copies of sibling packages, eliminating the version-skew failures (diverging TS types, duplicate module instances) that previously required `resolutions` workarounds on every version bump.

  Migration: projects must list every `@tango-ts/*` package they transitively use in their own `package.json` — in particular add `@tango-ts/auth` and `@tango-ts/core-types` (peers of server/views/orm), and `@tango-ts/contrib-auth` + `@tango-ts/migrations` if you use the CLI. The scaffold template includes the full set. Existing `resolutions` entries for `@tango-ts/*` can be removed.

## 0.7.0

### Patch Changes

- @tango-ts/auth@0.7.0
- @tango-ts/core-types@0.7.0
- @tango-ts/http@0.7.0
- @tango-ts/orm@0.7.0
- @tango-ts/router@0.7.0
- @tango-ts/serializers@0.7.0

## 0.6.0

### Minor Changes

- 2bf9fef: Add `.choices([...])` field modifier (Django's `choices`): pure metadata with no DDL change. The field's TypeScript type narrows to the literal union, serializers reject values outside the set, OpenAPI emits an `enum`, and the admin renders choice fields as selects in both list filters and forms.

### Patch Changes

- Updated dependencies [2bf9fef]
  - @tango-ts/orm@0.6.0
  - @tango-ts/serializers@0.6.0
  - @tango-ts/auth@0.6.0
  - @tango-ts/core-types@0.6.0
  - @tango-ts/http@0.6.0
  - @tango-ts/router@0.6.0

## 0.5.0

### Minor Changes

- Authentication now works everywhere, not just inside viewsets:

  - `defineServer`/`defineProject` accept `authentication` (project-level
    default authentication classes, DRF-style). The resolved user is placed on
    `ctx.user` for every route and viewset; invalid credentials 401 globally.
  - New `apiView(options, handler)` in `@tango-ts/auth` — DRF's `@api_view` for
    plain routes, running the same authentication + permission pipeline as
    `ModelViewSet`.
  - `ModelViewSet` now falls back to `ctx.user` when it declares no
    authentication of its own, and dispatches through the shared pipeline
    (`runAuthentication`/`checkPermissions`/`checkObjectPermissions`).
  - New `tango createsuperuser --email ... --password ...` CLI command (password
    may come from `TANGO_SUPERUSER_PASSWORD`) to bootstrap the first admin user.
  - `@tango-ts/contrib-auth`'s `GET /me/` is now an `apiView`.

### Patch Changes

- Updated dependencies
  - @tango-ts/auth@0.5.0
  - @tango-ts/http@0.5.0
  - @tango-ts/router@0.5.0
  - @tango-ts/core-types@0.5.0
  - @tango-ts/orm@0.5.0
  - @tango-ts/serializers@0.5.0

## 0.4.0

### Patch Changes

- @tango-ts/auth@0.4.0
- @tango-ts/core-types@0.4.0
- @tango-ts/http@0.4.0
- @tango-ts/orm@0.4.0
- @tango-ts/router@0.4.0
- @tango-ts/serializers@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies
  - @tango-ts/orm@0.3.0
  - @tango-ts/auth@0.3.0
  - @tango-ts/core-types@0.3.0
  - @tango-ts/http@0.3.0
  - @tango-ts/router@0.3.0
  - @tango-ts/serializers@0.3.0

## 0.2.2

### Patch Changes

- @tango-ts/auth@0.2.2
- @tango-ts/core-types@0.2.2
- @tango-ts/http@0.2.2
- @tango-ts/orm@0.2.2
- @tango-ts/router@0.2.2
- @tango-ts/serializers@0.2.2

## 0.2.1

### Patch Changes

- @tango-ts/auth@0.2.1
- @tango-ts/core-types@0.2.1
- @tango-ts/http@0.2.1
- @tango-ts/orm@0.2.1
- @tango-ts/router@0.2.1
- @tango-ts/serializers@0.2.1

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
  - @tango-ts/auth@0.2.0
  - @tango-ts/http@0.2.0
  - @tango-ts/orm@0.2.0
  - @tango-ts/serializers@0.2.0
  - @tango-ts/core-types@0.2.0
  - @tango-ts/router@0.2.0

## 0.1.2

### Patch Changes

- @tango-ts/auth@0.1.2
- @tango-ts/core-types@0.1.2
- @tango-ts/http@0.1.2
- @tango-ts/orm@0.1.2
- @tango-ts/router@0.1.2
- @tango-ts/serializers@0.1.2

## 0.1.1

### Patch Changes

- @tango-ts/auth@0.1.1
- @tango-ts/core-types@0.1.1
- @tango-ts/http@0.1.1
- @tango-ts/orm@0.1.1
- @tango-ts/router@0.1.1
- @tango-ts/serializers@0.1.1

## 0.1.0

### Minor Changes

- Publish the first public Tango package release.

### Patch Changes

- Updated dependencies
  - @tango-ts/auth@0.1.0
  - @tango-ts/core-types@0.1.0
  - @tango-ts/http@0.1.0
  - @tango-ts/orm@0.1.0
  - @tango-ts/router@0.1.0
  - @tango-ts/serializers@0.1.0
