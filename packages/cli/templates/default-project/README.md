# __PROJECT_NAME__

A [Tango](https://github.com/bryanhoulton/tango) API project.

## Local development

```sh
yarn install
cp .env.example .env   # adjust if your MySQL differs
yarn dev               # rebuild + reload on changes
```

Check it works:

```sh
curl http://127.0.0.1:8000/health/live/
```

Generate and apply migrations after changing models:

```sh
yarn makemigrations
yarn migrate
```

The OpenAPI schema is served at `GET /openapi.json` (wired in
`src/project.ts` via `addOpenApiRoute`).

## Configuration

All configuration comes from environment variables (see `.env.example`):

- `TANGO_DB_HOST`, `TANGO_DB_PORT`, `TANGO_DB_USER`, `TANGO_DB_PASSWORD`, `TANGO_DB_NAME`
- or a single `TANGO_DATABASE_URL=mysql://user:pass@host:3306/db?ssl=true`
- `TANGO_DB_SSL=true` for managed MySQL that requires TLS
- `TANGO_DB_POOL_SIZE` to tune the connection pool
- `HOST` / `PORT` for the HTTP server

When `NODE_ENV=production`, database settings are required — the server fails at
startup instead of silently using development defaults.

## Deployment

Two paths ship out of the box: serverless on Vercel, or a long-running Node
container. Both run the same `src/project.ts` unchanged.

### Vercel

`api/index.ts` and `vercel.json` are already wired — every path is rewritten
into one function and Tango routes internally (Node.js runtime; the Edge
runtime is not supported because MySQL needs TCP). The `buildCommand` in
`vercel.json` looks odd on purpose: this is a functions-only project, so Vercel
needs a non-empty static output directory (`public/.keep` is a placeholder that
never shadows the API rewrite), and the function itself is compiled by Vercel
directly from `api/index.ts`.

```sh
vercel env add TANGO_DATABASE_URL   # mysql://user:pass@host:3306/db?ssl=true
vercel deploy
```

Notes for serverless MySQL:

- The connection pool defaults to 1 connection per warm instance on Vercel
  (`VERCEL=1` is detected); tune with `TANGO_DB_POOL_SIZE`.
- Use a database that tolerates many connections (PlanetScale, or RDS behind
  RDS Proxy) — each warm function instance holds its own pool.
- **PlanetScale (Vitess) does not support FOREIGN KEY constraints.** Declare
  references with `f.foreignKey(() => Target, 'id', { dbConstraint: false })` —
  joins and typing still work, but migrations skip the constraint DDL
  (Django's `db_constraint=False`).
- Run migrations from CI, **not** from Vercel's build: preview deployments
  share production env vars, and a PR branch must never alter the production
  schema. Example GitHub Action:

```yaml
name: migrate
on:
  push:
    branches: [main]
jobs:
  migrate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: yarn install && yarn run check
      - run: yarn run migrate
        env:
          NODE_ENV: production
          TANGO_DATABASE_URL: ${{ secrets.TANGO_DATABASE_URL }}
```

### Container

The app is a long-running Node process. The shipped `Dockerfile` builds a
production image:

```sh
docker build -t __PROJECT_PACKAGE_NAME__ .
docker run -p 8000:8000 \
  -e TANGO_DB_HOST=... -e TANGO_DB_USER=... \
  -e TANGO_DB_PASSWORD=... -e TANGO_DB_NAME=__PROJECT_DB_NAME__ \
  __PROJECT_PACKAGE_NAME__
```

This works as-is on any container platform (Railway, Render, Fly.io, ECS, ...).
The recommended release pipeline:

1. **CI**: `yarn check` — fails the build when model changes are missing a
   migration.
2. **Release (before traffic shifts)**: `yarn migrate` — applies pending
   migrations. Migrations only ever run at deploy time, never per request.
3. **Run**: the container's default command (`tango serve`). The server honors
   `SIGTERM` by draining in-flight requests and closing the database pool, so
   rolling deploys are zero-drop.

Health checks: use `GET /health/live/` for liveness. Requests are logged as
JSON lines with request IDs (`x-request-id`) by the `requestLog()` middleware
configured in `src/project.ts`.
