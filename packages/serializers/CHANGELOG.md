# @tango-ts/serializers

## 0.9.0

### Minor Changes

- DX fixes from the latest feedback round:

  - **snake_case FK relation names**: `tag_id`/`customer_id` columns now expose the
    logical relation name (`tag`, `customer`) for filters, `selectRelated`, and
    nested serializer keys — matching the existing `tagId` -> `tag` behavior.
  - **Null FKs render as `null`**: a nullable FK with no row now inflates and
    serializes as `null` instead of an object whose columns are all null. The
    relation is typed `| null` end-to-end (ORM rows, serializer output, OpenAPI
    schemas emit `type: ['object', 'null']`).
  - **Typed `ctx.user`**: `RequestContext<User>`, `Authentication<User>`, and the
    pipeline thread the authenticated user's type into `apiView` handlers,
    viewset actions, `queryset`, `objectPermission`, and permission predicates.
    `authTokenAuthentication()` is `Authentication<PublicUser>`, so
    `ctx.user?.id` works without casts.
  - **Action `path` validation**: viewset action paths must be plain URL
    segments (`'close'`); paths containing `:` params (e.g. `'/:id/close/'`)
    now throw at route build time with a pointer to the right shape.

## 0.8.1

## 0.8.0

### Minor Changes

- Internal `@tango-ts/*` dependencies are now `peerDependencies` instead of `dependencies`. Package managers therefore never install nested copies of sibling packages, eliminating the version-skew failures (diverging TS types, duplicate module instances) that previously required `resolutions` workarounds on every version bump.

  Migration: projects must list every `@tango-ts/*` package they transitively use in their own `package.json` — in particular add `@tango-ts/auth` and `@tango-ts/core-types` (peers of server/views/orm), and `@tango-ts/contrib-auth` + `@tango-ts/migrations` if you use the CLI. The scaffold template includes the full set. Existing `resolutions` entries for `@tango-ts/*` can be removed.

- Nested serializers: `modelSerializer` accepts a `nested` map of relation name
  to child serializer (DRF's `author = AuthorSerializer(read_only=True)`).
  Nested output is read-only — `serialize` renders the related row through the
  child serializer (null for a missing nullable relation), input silently
  ignores nested keys to match the DRF oracle, and the `nested` keys are
  type-checked against the model's relations so `serialize` requires rows shaped
  like `selectRelated` results. OpenAPI response schemas now include the nested
  object schemas (marked `readOnly`), recursing through deeper nesting.

## 0.7.0

### Patch Changes

- @tango-ts/core-types@0.7.0
- @tango-ts/orm@0.7.0

## 0.6.0

### Minor Changes

- 2bf9fef: Add `.choices([...])` field modifier (Django's `choices`): pure metadata with no DDL change. The field's TypeScript type narrows to the literal union, serializers reject values outside the set, OpenAPI emits an `enum`, and the admin renders choice fields as selects in both list filters and forms.

### Patch Changes

- Updated dependencies [2bf9fef]
  - @tango-ts/orm@0.6.0
  - @tango-ts/core-types@0.6.0

## 0.5.0

### Patch Changes

- @tango-ts/core-types@0.5.0
- @tango-ts/orm@0.5.0

## 0.4.0

### Patch Changes

- @tango-ts/core-types@0.4.0
- @tango-ts/orm@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies
  - @tango-ts/orm@0.3.0
  - @tango-ts/core-types@0.3.0

## 0.2.2

### Patch Changes

- @tango-ts/core-types@0.2.2
- @tango-ts/orm@0.2.2

## 0.2.1

### Patch Changes

- @tango-ts/core-types@0.2.1
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
  - @tango-ts/orm@0.2.0
  - @tango-ts/core-types@0.2.0

## 0.1.2

### Patch Changes

- @tango-ts/core-types@0.1.2
- @tango-ts/orm@0.1.2

## 0.1.1

### Patch Changes

- @tango-ts/core-types@0.1.1
- @tango-ts/orm@0.1.1

## 0.1.0

### Minor Changes

- Publish the first public Tango package release.

### Patch Changes

- Updated dependencies
  - @tango-ts/core-types@0.1.0
  - @tango-ts/orm@0.1.0
