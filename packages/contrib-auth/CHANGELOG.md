# @tango-ts/contrib-auth

## 0.6.0

### Patch Changes

- Updated dependencies [2bf9fef]
  - @tango-ts/orm@0.6.0
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

## 0.4.0

### Minor Changes

- New batteries-included auth app: built-in `User` and `AuthToken` models with
  shipped migrations, Django-format PBKDF2-SHA256 password hashing, hashed
  opaque bearer tokens (`tango_` prefix, optional expiry, lastUsedAt tracking),
  `createUser`/`createSuperuser`/`authenticateUser` helpers,
  `authTokenAuthentication()` for viewsets, and `authRoutes()` providing
  `POST /login/`, `POST /logout/`, and `GET /me/`.

### Patch Changes

- @tango-ts/auth@0.4.0
- @tango-ts/core-types@0.4.0
- @tango-ts/http@0.4.0
- @tango-ts/orm@0.4.0
- @tango-ts/router@0.4.0
