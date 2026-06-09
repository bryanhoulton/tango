# @tango-ts/orm

## Responsibility

The runtime ORM. Turns a declarative model definition into a typed, lazy query API
(`Model.objects.filter(...).get()`, `.create(...)`) and compiles it to SQL via
[Kysely](https://kysely.dev/) for MySQL. Owns field builders, the model/manager,
the lazy QuerySet, Django-style lookups, and the request-scoped connection. Does
**not** own migrations (schema diff/DDL) or serialization — those are sibling packages.

## What it responds to

- A model declared with `model(name, { ...f.* fields })`.
- Filter objects (`Lookups<F>`), insert objects (`InferInsert<F>`), inferred from the
  model by `@tango-ts/core-types`.
- An active connection provided per request via `withConnection(db, () => ...)`.

## Functionality

- `f.*` — field builders (`int`, `float`, `varchar`, `text`, `boolean`, `datetime`,
  `date`, `foreignKey`) with `.nullable()`, `.primaryKey()`, `.autoIncrement()`,
  `.unique()`, `.default()`, `.autoNow()/.autoNowAdd()`. `f.foreignKey` accepts
  `{ dbConstraint: false }` (Django's `db_constraint=False`) to keep the
  reference for joins/typing while skipping FOREIGN KEY DDL — required on
  PlanetScale (Vitess), which rejects FK constraints.
- `model()` / `Manager` — `all`, `filter`, `exclude`, `get`, `count`, `create`,
  `update`, `delete`, `selectRelated`.
- `QuerySet` — lazy + immutable; thenable (awaiting it runs the query); `.compile()`
  to SQL with no DB; `.orderBy('name', '-createdAt')`, `.limit(n)`, `.offset(n)`,
  and `.count()` (SQL `COUNT(*)`, with `.compileCount()` for assertions).
- Lookups: `exact`, `in`, `isnull`, `gt/gte/lt/lte`, `contains`, `icontains`,
  `startswith`, `endswith` (case-sensitivity matches Django on MySQL).
- Relation traversal for FK fields by convention: `authorId` exposes `author`, so
  `Post.objects.filter({ author__email__icontains: 'x' })` compiles to a join.
- Nested FK traversal: `Book.objects.filter({ author__organization__name: 'Labs' })`.
- Explicit reverse relations via `r.hasMany`, e.g. `Organization.objects.filter({
  authors__name__icontains: 'ada' })`.
- `selectRelated('author')` and `selectRelated('author__organization')` eager-load FK
  targets and inflate joined columns into nested objects on each result row.
- `withConnection` / `getConnection` / `createMysqlConnection`, and `COMPILE_ONLY`.
- `atomic(fn)` — runs ORM work inside a transaction scoped to the current connection.
- `mysqlConfigFromEnv(options?, env?)` — the single resolution path for database
  configuration: explicit options > `TANGO_DATABASE_URL`/`DATABASE_URL` >
  `TANGO_DB_*` variables > development defaults. Supports TLS (`TANGO_DB_SSL`)
  and pool sizing (`TANGO_DB_POOL_SIZE`), and refuses development defaults when
  `NODE_ENV=production`.

## Design patterns that matter here

- **Inferred types (P2):** `Manager`/`QuerySet` carry `InferSelect`/`Lookups` from the
  model. Relation lookups and `selectRelated` row shapes are inferred from FK targets.
  Never accept or return a hand-written row type.
- **Lazy + immutable:** building never executes; chaining returns new QuerySets.
- **Serverless (P5):** the connection is request-scoped via `AsyncLocalStorage`; no
  module-level mutable connection. `COMPILE_ONLY` is pure/immutable, so it is allowed.
- **Atomic transactions:** `atomic(...)` rebinds the request-scoped connection to a
  Kysely transaction for the callback, so normal manager/queryset calls participate.
- **Declarative (P4):** the public surface is builders + config. Internal Kysely usage
  is the one place we bridge to a loosely-typed DB, isolated in `connection.ts`/`queryset.ts`.
- **No `any`:** the internal bridge uses `unknown`-typed `LooseDatabase`, never `any`.

## Public contract

Everything re-exported from `src/index.ts`. The internal `LooseDatabase` bridge is
exported for adapters/tests but is not the user-facing API.

## Testing

- Unit (`test/queryset.test.ts`): asserts compiled SQL + parameters for each lookup,
  nested FK join, reverse join, and selected relation join, using `COMPILE_ONLY` (no DB).
- Type-level (`test/model.test-d.ts`): asserts `objects.filter`/`create` inference and
  that invalid lookups / wrong value types / unknown nested or reverse relations fail
  to compile.
- Integration (`test/db.integration.test.ts`): real MySQL — create, filter, get,
  update/delete helpers, transaction commit/rollback, nested relation traversal,
  reverse relation traversal, nested `selectRelated`, thenable execution. Never skips
  when the DB is down; it fails loudly.
