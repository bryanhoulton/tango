# @tango-ts/openapi

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

- Updated dependencies [ed15d6b]
  - @tango-ts/server@0.7.0
  - @tango-ts/orm@0.7.0
  - @tango-ts/router@0.7.0
  - @tango-ts/views@0.7.0

## 0.6.0

### Minor Changes

- 2bf9fef: Add `.choices([...])` field modifier (Django's `choices`): pure metadata with no DDL change. The field's TypeScript type narrows to the literal union, serializers reject values outside the set, OpenAPI emits an `enum`, and the admin renders choice fields as selects in both list filters and forms.

### Patch Changes

- Updated dependencies [2bf9fef]
  - @tango-ts/orm@0.6.0
  - @tango-ts/views@0.6.0
  - @tango-ts/router@0.6.0
  - @tango-ts/server@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies
  - @tango-ts/router@0.5.0
  - @tango-ts/server@0.5.0
  - @tango-ts/views@0.5.0
  - @tango-ts/orm@0.5.0

## 0.4.0

### Patch Changes

- @tango-ts/orm@0.4.0
- @tango-ts/router@0.4.0
- @tango-ts/server@0.4.0
- @tango-ts/views@0.4.0

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
  - @tango-ts/router@0.3.0
  - @tango-ts/server@0.3.0
  - @tango-ts/views@0.3.0

## 0.2.2

### Patch Changes

- @tango-ts/orm@0.2.2
- @tango-ts/router@0.2.2
- @tango-ts/server@0.2.2
- @tango-ts/views@0.2.2

## 0.2.1

### Patch Changes

- @tango-ts/orm@0.2.1
- @tango-ts/router@0.2.1
- @tango-ts/server@0.2.1
- @tango-ts/views@0.2.1

## 0.2.0

### Patch Changes

- Updated dependencies
  - @tango-ts/orm@0.2.0
  - @tango-ts/server@0.2.0
  - @tango-ts/views@0.2.0
  - @tango-ts/router@0.2.0

## 0.1.2

### Patch Changes

- @tango-ts/orm@0.1.2
- @tango-ts/router@0.1.2
- @tango-ts/server@0.1.2
- @tango-ts/views@0.1.2

## 0.1.1

### Patch Changes

- @tango-ts/orm@0.1.1
- @tango-ts/router@0.1.1
- @tango-ts/server@0.1.1
- @tango-ts/views@0.1.1

## 0.1.0

### Minor Changes

- Publish the first public Tango package release.

### Patch Changes

- Updated dependencies
  - @tango-ts/orm@0.1.0
  - @tango-ts/router@0.1.0
  - @tango-ts/server@0.1.0
  - @tango-ts/views@0.1.0
