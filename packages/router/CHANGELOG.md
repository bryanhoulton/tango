# @tango-ts/router

## 0.8.0

### Minor Changes

- Internal `@tango-ts/*` dependencies are now `peerDependencies` instead of `dependencies`. Package managers therefore never install nested copies of sibling packages, eliminating the version-skew failures (diverging TS types, duplicate module instances) that previously required `resolutions` workarounds on every version bump.

  Migration: projects must list every `@tango-ts/*` package they transitively use in their own `package.json` — in particular add `@tango-ts/auth` and `@tango-ts/core-types` (peers of server/views/orm), and `@tango-ts/contrib-auth` + `@tango-ts/migrations` if you use the CLI. The scaffold template includes the full set. Existing `resolutions` entries for `@tango-ts/*` can be removed.

## 0.7.0

### Patch Changes

- @tango-ts/http@0.7.0

## 0.6.0

### Patch Changes

- @tango-ts/http@0.6.0

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

### Patch Changes

- Updated dependencies
  - @tango-ts/http@0.2.0

## 0.1.2

### Patch Changes

- @tango-ts/http@0.1.2

## 0.1.1

### Patch Changes

- @tango-ts/http@0.1.1

## 0.1.0

### Minor Changes

- Publish the first public Tango package release.

### Patch Changes

- Updated dependencies
  - @tango-ts/http@0.1.0
