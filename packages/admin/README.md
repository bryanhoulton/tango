# @tango-ts/admin

Schema-driven admin API for Tango — Django admin, split in half for
serverless.

This package is the server half: pure JSON endpoints (model metadata,
staff-gated auth, CRUD viewsets). The browser half is `@tango-ts/admin-ui`, a
prebuilt React SPA served as static assets. Server code must never import the
UI package — that separation is what keeps the Vercel function bundle free of
React, and it is enforced by lint, manifest, and bundle-trace guards in this
repo.

## Usage

```ts
import { addAdminRoutes, adminModel } from '@tango-ts/admin'
import { defineProject } from '@tango-ts/server'

import { Post } from './apps/core/models.js'

export const project = defineProject({ ... })

addAdminRoutes(project, {
  models: [
    adminModel(Post, {
      listDisplay: ['id', 'title', 'published'],
      searchFields: ['title'],
      listFilters: ['published']
    })
  ]
})
```

The UI sidebar groups models by app. `addAdminRoutes` resolves each model's
app from the project's app registry (`project.apps`), so models registered
through `defineApp` are grouped automatically; pass
`adminModel(Post, { app: 'blog' })` to override, and models owned by no app
fall into an "Other" section.

The sidebar also lists the project's functions (`defineApp({ ..., functions })`)
in a Functions section. Staff can run one from the UI with a JSON payload; the
invocation goes through the project's configured function transport, exactly
like `fn.invoke()` from application code. Pass `functions` to `addAdminRoutes`
to expose a different set (or `[]` to hide them).

Auth is the contrib-auth token model: create a staff user with
`createSuperuser(...)`, log in at `POST /admin/api/auth/login/`, and every
admin endpoint requires `Authorization: Bearer tango_...` plus
`isStaff`/`isSuperuser`.

## Routes

Mounted under `/admin/api` by default:

| Route | Purpose |
| --- | --- |
| `POST /auth/login/` | Staff-only login → `{ token, user }` |
| `POST /auth/logout/` | Revoke the presented token |
| `GET /auth/me/` | The authenticated admin user |
| `GET /meta/` | Site schema — models, fields, relations, list config |
| `POST /functions/:app/:name/` | Run an admin-exposed function: `{ payload }` → `{ result }` |
| `GET/POST /<table>/` | List (paginated) and create |
| `GET/PATCH/DELETE /<table>/:id/` | Retrieve, partial update, delete |

The CRUD endpoints are regular `modelViewSet`s configured with full-field
serializers, admin authentication, and `icontains` filters for each
`searchFields` entry — pagination, filtering, and ordering behave exactly like
any other Tango viewset.

## The meta document

`GET /meta/` returns everything the generic UI needs: each model's fields
(type, nullable, read-only, required, max length, choices), foreign keys
resolved to their admin endpoints with a display field for pickers, list
configuration, and pagination. The UI is identical for every project; all
per-project shape lives in this document.

Fields declared with `.choices([...])` carry their allowed values into the
meta document — the UI renders them as selects, both as list filters and as
form inputs.
