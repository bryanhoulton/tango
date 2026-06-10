# @tango-ts/migrations

## 0.7.0

### Patch Changes

- @tango-ts/core-types@0.7.0
- @tango-ts/orm@0.7.0

## 0.6.0

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
