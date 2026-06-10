# @tango-ts/views

## Responsibility

DRF-style view layer. This package currently owns `ModelViewSet`: mapping collection
and detail routes to ORM + serializer operations. It does not own low-level routing,
HTTP primitives, permissions, authentication, or pagination yet.

## What it responds to

- `RequestContext` from `@tango-ts/http`.
- A model and model serializer.
- Router registration through `routes(basePath)`.

## Functionality

- `modelViewSet({ model, serializer })`.
- `GET /resource/` list.
- `GET /resource/:id/` retrieve.
- `POST /resource/` create.
- `PATCH /resource/:id/` partial update.
- `DELETE /resource/:id/` destroy.
- Custom collection/detail actions via `actions: [...]` (DRF's `@action`), e.g.
  `GET /users/export/` or `POST /users/:id/activate/`:
  - An action's `path` is just the action name (e.g. `'activate'`), never a
    path pattern — the viewset prepends `/:id/` for detail actions itself.
  - Detail handlers receive `(ctx, row)` — the row is resolved DRF-style through
    the scoped queryset (out-of-scope or missing rows 404) and past the
    object-permission pass before the handler runs.
  - Per-action `authentication` and `permissions` replace the viewset-level
    classes for that action (DRF's `@action(permission_classes=...)`).
  - Collection action routes register before the `/:id/` routes, so
    `GET /users/export/` is never captured as a retrieve with id `"export"`.
- Per-action OpenAPI overrides for built-in and custom routes.
- Configured query-param filters for list endpoints, ANDed together via the ORM.
- Optional page/pageSize pagination envelope: `{ count, next, previous, results }`,
  executed in SQL (`COUNT(*)` + ordered `LIMIT`/`OFFSET`) — the table is never
  loaded into memory.
- Declarative `ordering: ['-createdAt']`; paginated lists always have a
  deterministic order (configured ordering, or the primary key).
- Auth and permission hooks (`authenticate`, `permissions`) before view logic.
- Auth classes from `@tango-ts/auth` via `authentication: [...]`, including 401 vs 403
  behavior for missing/invalid credentials vs permission denial.
- Queryset scoping via `queryset: (ctx) => Model.objects.filter({...})` (Django's
  `get_queryset()`): `list` queries the scope and detail actions 404 for rows outside
  it. Request filters compose on top of the scope and can never widen it.
- Object-level permissions for detail actions, checked after the row is fetched and
  before any write: permission classes implementing `hasObjectPermission`, plus the
  `objectPermission: (ctx, row) => boolean` shorthand. Denial is a 403.
- Read-only nested serializers: when the serializer declares `nested: { ... }`,
  list/retrieve/create/PATCH responses carry the nested relations. The viewset
  `selectRelated`s every nested relation path (including deeper nesting like
  `author__organization`), and re-fetches the row after writes so create/update
  responses include nested data. Nested metadata flows into route metadata for
  OpenAPI generation.
- Serializer validation errors returned with status 400.
- PATCH uses partial serializer validation, so omitted fields are not erased.
- Malformed JSON returned as `{ detail: 'Malformed JSON.' }` with status 400.
- Missing objects returned as `{ detail: 'Not found.' }` with status 404.

## Design patterns that matter here

- **Serverless request lifecycle:** views operate on Web request contexts and return Web
  responses.
- **Real production path:** create/list/retrieve flow through serializers and ORM, not
  mocks.
- **Declarative behavior:** filters, pagination, auth, and permissions are configured on
  the viewset; user code should not rewrite request dispatch for common cases.
- **Custom actions:** use explicit action declarations rather than decorators for now;
  each action declares route shape, handler, per-action auth/permissions, and OpenAPI
  metadata in one place. Detail actions go through the same object-resolution path
  as the built-in detail routes, so scoping and object permissions cannot be skipped.
- **DRF auth semantics:** authentication classes may attach `ctx.user`; permission
  classes decide access and produce DRF-like response envelopes.
- **Convention over configuration:** a model + serializer declaration is enough for
  basic CRUD routes.

## Public contract

Everything exported from `src/index.ts`.

## Testing

- Unit (`test/model-viewset.test.ts`): route declaration shape.
- Integration (`test/model-viewset.integration.test.ts`,
  `test/model-viewset-features.integration.test.ts`): real Web `Request` / `Response`
  through router -> viewset -> serializer -> ORM -> MySQL, including filters,
  pagination, permissions, PATCH/DELETE, and malformed JSON.
- Integration (`test/model-viewset-auth.integration.test.ts`): auth classes and
  permission classes over real Web requests.
- Integration (`test/model-viewset-actions.integration.test.ts`): custom action
  semantics — detail object resolution, scoping 404s, object permissions, and
  per-action authentication/permission overrides.
