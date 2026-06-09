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
- Custom collection/detail actions via `actions: [...]`, e.g. `GET /users/export/`
  or `POST /users/:id/activate/`.
- Per-action OpenAPI overrides for built-in and custom routes.
- Configured query-param filters for list endpoints, ANDed together via the ORM.
- Optional page/pageSize pagination envelope: `{ count, next, previous, results }`.
- Auth and permission hooks (`authenticate`, `permissions`) before view logic.
- Auth classes from `@tango-ts/auth` via `authentication: [...]`, including 401 vs 403
  behavior for missing/invalid credentials vs permission denial.
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
  each action can declare route shape, handler, and OpenAPI metadata in one place.
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
