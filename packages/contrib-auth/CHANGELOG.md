# @tango-ts/contrib-auth

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
