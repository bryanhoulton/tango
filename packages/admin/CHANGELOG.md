# @tango-ts/admin

## 0.9.0

## 0.8.1

## 0.8.0

### Minor Changes

- Admin functions: `addAdminRoutes` now exposes staff-runnable functions (every
  function owned by the project's apps by default, or an explicit `functions`
  list). Each function gets a `POST /functions/:app/:name/` endpoint guarded by
  the admin's authentication/permission classes, and the UI lists them in a new
  Functions sidebar section with a run screen (`#/f/<app>/<name>`) that submits a
  JSON payload and shows the result. The sidebar now also groups models by their
  owning app (Django-style admin index), and the document title reflects the
  project's admin site title.
- Internal `@tango-ts/*` dependencies are now `peerDependencies` instead of `dependencies`. Package managers therefore never install nested copies of sibling packages, eliminating the version-skew failures (diverging TS types, duplicate module instances) that previously required `resolutions` workarounds on every version bump.

  Migration: projects must list every `@tango-ts/*` package they transitively use in their own `package.json` — in particular add `@tango-ts/auth` and `@tango-ts/core-types` (peers of server/views/orm), and `@tango-ts/contrib-auth` + `@tango-ts/migrations` if you use the CLI. The scaffold template includes the full set. Existing `resolutions` entries for `@tango-ts/*` can be removed.

## 0.7.0

### Patch Changes

- Updated dependencies [ed15d6b]
  - @tango-ts/server@0.7.0
  - @tango-ts/auth@0.7.0
  - @tango-ts/contrib-auth@0.7.0
  - @tango-ts/core-types@0.7.0
  - @tango-ts/http@0.7.0
  - @tango-ts/orm@0.7.0
  - @tango-ts/router@0.7.0
  - @tango-ts/serializers@0.7.0
  - @tango-ts/views@0.7.0

## 0.6.0

### Minor Changes

- 2bf9fef: Add `.choices([...])` field modifier (Django's `choices`): pure metadata with no DDL change. The field's TypeScript type narrows to the literal union, serializers reject values outside the set, OpenAPI emits an `enum`, and the admin renders choice fields as selects in both list filters and forms.

### Patch Changes

- Updated dependencies [2bf9fef]
  - @tango-ts/orm@0.6.0
  - @tango-ts/serializers@0.6.0
  - @tango-ts/views@0.6.0
  - @tango-ts/auth@0.6.0
  - @tango-ts/contrib-auth@0.6.0
  - @tango-ts/core-types@0.6.0
  - @tango-ts/http@0.6.0
  - @tango-ts/router@0.6.0
  - @tango-ts/server@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies
  - @tango-ts/auth@0.5.0
  - @tango-ts/http@0.5.0
  - @tango-ts/router@0.5.0
  - @tango-ts/server@0.5.0
  - @tango-ts/views@0.5.0
  - @tango-ts/contrib-auth@0.5.0
  - @tango-ts/core-types@0.5.0
  - @tango-ts/orm@0.5.0
  - @tango-ts/serializers@0.5.0
