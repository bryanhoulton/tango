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
  `.unique()`, `.default()`, `.autoNow()/.autoNowAdd()`.
- `model()` / `Manager` — `all`, `filter`, `exclude`, `get`, `create`,
  `selectRelated`.
- `QuerySet` — lazy + immutable; thenable (awaiting it runs the query); `.compile()`
  to SQL with no DB.
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

## Design patterns that matter here

- **Inferred types (P2):** `Manager`/`QuerySet` carry `InferSelect`/`Lookups` from the
  model. Relation lookups and `selectRelated` row shapes are inferred from FK targets.
  Never accept or return a hand-written row type.
- **Lazy + immutable:** building never executes; chaining returns new QuerySets.
- **Serverless (P5):** the connection is request-scoped via `AsyncLocalStorage`; no
  module-level mutable connection. `COMPILE_ONLY` is pure/immutable, so it is allowed.
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
  nested relation traversal, reverse relation traversal, nested `selectRelated`,
  thenable execution. Never skips when the DB is down; it fails loudly.
