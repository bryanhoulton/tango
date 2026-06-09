# Tango

**Django REST Framework, rebuilt in TypeScript, for serverless APIs.**

Tango is the product name. The npm packages currently live under the
`@tango-ts/*` scope, but the framework should be described as Tango unless you are
talking about a specific package.

Tango exists for developers who want the Django + DRF way of building APIs:
declare a model, derive validation and serialization from that model, register a
viewset, and get typed CRUD endpoints without rewriting the same shape in five
places. The core is TypeScript-first, MySQL/PlanetScale-oriented, and built around
Web-standard `Request` / `Response` handlers so the same app can run locally today
and behind serverless adapters later.

Tango is still early. The ORM, migrations, serializers, router, viewsets, auth
primitives, OpenAPI generation, Node/local adapter, and CLI scaffolding exist.
Admin, caching, and more deployment adapters are part of the direction, not the
current quickstart surface.

## Start A Project

Create a project with the CLI:

```sh
yarn dlx @tango-ts/cli startproject shop
cd shop
yarn install
```

The generated project is intentionally small:

```txt
shop/
  package.json
  tsconfig.json
  src/
    project.ts
    routes.ts
    apps/
      core/
        app.ts
        models.ts
        serializers.ts
        routes.ts
        migrations/
```

Run it locally:

```sh
yarn serve
```

Then check the default health route:

```sh
curl http://127.0.0.1:8000/health/live/
curl http://127.0.0.1:8000/core/health/live/
```

`src/project.ts` is the project entrypoint. It creates a Web handler by combining
the root routes, nested apps, and the database connection:

```ts
import { defineProject, mysqlFromEnv } from '@tango-ts/server'

import { app as coreApp } from './apps/core/app.js'
import { routes as coreRoutes } from './apps/core/routes.js'
import { routes } from './routes.js'

export const project = defineProject({
  name: 'shop',
  database: mysqlFromEnv({ projectName: 'shop' }),
  routes,
  apps: [{ path: '/core', app: coreApp, routes: coreRoutes }]
})

export default project
```

## Key Concepts

**Project:** the root Web handler. It wires database access, root routes, and
nested apps together.

**App:** a focused domain module with models, serializers, routes, and migrations.
The starter project includes a `core` app. Add more apps as the project grows.

**Model:** the single source of truth for persistence and types. Query shapes,
insert shapes, filters, serializers, migrations, and OpenAPI metadata derive from
the model.

**Serializer:** the DRF-style boundary for validation and output. Application code
does not hand-write DTO types for normal model resources.

**Viewset:** the common CRUD behavior for a model resource. A model plus serializer
is enough for list, retrieve, create, patch, and delete routes.

**Router:** explicit route registration over Web-standard requests. There is no
filesystem routing or Express-style request object.

**Migrations:** generated from model snapshots and applied at deploy time or during
local setup. They are never run during request handling.

## Build The First Resource

Start with a model in `src/apps/core/models.ts`:

```ts
import { f, model } from '@tango-ts/orm'

export const Post = model('posts', {
  id: f.int().primaryKey().autoIncrement(),
  title: f.varchar(255),
  body: f.text(),
  published: f.boolean().default(false)
})

export const models = [Post] as const
```

Add a serializer in `src/apps/core/serializers.ts`:

```ts
import { modelSerializer } from '@tango-ts/serializers'

import { Post } from './models.js'

export const PostSerializer = modelSerializer(Post, {
  fields: ['id', 'title', 'body', 'published'] as const,
  readOnlyFields: ['id'] as const
})
```

Register a viewset in `src/apps/core/routes.ts`:

```ts
import { defineRoutes, route } from '@tango-ts/router'
import { modelViewSet } from '@tango-ts/views'

import { Post } from './models.js'
import { PostSerializer } from './serializers.js'

export const routes = defineRoutes([
  route('/posts', modelViewSet({ model: Post, serializer: PostSerializer }))
])

export default routes
```

Generate and apply the migration:

```sh
yarn makemigrations
yarn migrate
```

By default, `mysqlFromEnv()` reads `TANGO_DB_HOST`, `TANGO_DB_PORT`,
`TANGO_DB_USER`, `TANGO_DB_PASSWORD`, and `TANGO_DB_NAME`. If `TANGO_DB_NAME` is
not set, the generated project derives a database name from the project name.

Start the app and try the resource:

```sh
yarn serve
curl http://127.0.0.1:8000/core/posts/
curl -X POST http://127.0.0.1:8000/core/posts/ \
  -H 'content-type: application/json' \
  -d '{"title":"First post","body":"Hello from Tango."}'
```

## Add Another App

Apps keep domains separate without creating another service. From inside a Tango
project:

```sh
yarn tango startapp billing --directory src/apps/billing
```

Then import the new app and routes in `src/project.ts` and add it to `apps`:

```ts
import { app as billingApp } from './apps/billing/app.js'
import { routes as billingRoutes } from './apps/billing/routes.js'

export const project = defineProject({
  name: 'shop',
  database: mysqlFromEnv({ projectName: 'shop' }),
  routes,
  apps: [
    { path: '/core', app: coreApp, routes: coreRoutes },
    { path: '/billing', app: billingApp, routes: billingRoutes }
  ]
})
```

Each app owns its own migration directory. For now, generated scripts target the
starter `core` app; additional apps should get their own migration scripts or CI
steps.

## Deployment

Generated projects ship a `Dockerfile`, `.env.example`, and a `start` script, so
the supported deployment today is a long-running Node container (Railway,
Render, Fly.io, ECS, ...). The release pipeline:

1. Build the project with `yarn build`.
2. Run `tango check` in CI to fail when model changes are missing migrations.
3. Run `tango migrate` during deployment, before traffic reaches the new code.
4. Run `tango serve` (the container default command). It reads `HOST`/`PORT`
   from the environment, drains in-flight requests on `SIGTERM`, and closes the
   database pool on shutdown.

Database settings come from `TANGO_DB_*` variables or a single
`TANGO_DATABASE_URL` (`mysql://user:pass@host:3306/db?ssl=true`). TLS is
enabled with `TANGO_DB_SSL=true`. When `NODE_ENV=production`, missing database
configuration fails at startup instead of falling back to development defaults.

Production middleware (request logging with request IDs, security headers,
CORS, body-size limits) is configured declaratively on the project:

```ts
import { cors, defineProject, requestLog, securityHeaders } from '@tango-ts/server'

export const project = defineProject({
  // ...
  middleware: [requestLog(), securityHeaders(), cors({ origins: ['https://app.example.com'] })]
})
```

The important constraint is that Tango apps are Web handlers and migrations are
deploy-time commands. Request handling should stay stateless and should not run
schema changes.

## Working On Tango Itself

This repository is the Tango monorepo. Package-level READMEs explain each package
in more detail. Useful root commands:

```sh
yarn build
yarn typecheck
yarn lint
yarn test
yarn db:up
yarn test:integration
```

Read [`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md) before contributing. It is
the project constitution: strict types, no `any`, serverless-first behavior,
declarative APIs, and tests that overlap real production paths.
