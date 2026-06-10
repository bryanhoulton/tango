# @tango-ts/cli

## Responsibility

Management commands for Tango. This package loads an explicitly registered Tango app,
generates TypeScript migration files, checks for missing migrations, applies
migrations through the `@tango-ts/migrations` executor, and starts a local dev server
for Web handlers. It owns command orchestration; it does not own schema diffing, SQL
rendering, ORM behavior, or adapter internals.

## What it responds to

- A `TangoApp` from `defineApp({ models, migrationsDir })`.
- `startproject`, `startapp`, `makemigrations`, `check`, `migrate`,
  `createsuperuser`, and `serve` commands.
- A deploy-time database connection for `migrate`.
- A Web handler module for `serve`.

## Functionality

- `loadApp(path)` — dynamic app-module loading for the command wrapper.
- `loadMigrations(dir)` — loads generated TS/JS migration files.
- `makemigrations(...)` — builds the current model snapshot, diffs from the latest
  source migration snapshot, and writes a typed TS migration file.
- `checkMigrations(...)` — fails when models changed without a migration.
- `ensureMysqlDatabase(...)` — creates the configured MySQL database when the
  server connection succeeds but the database does not exist yet. Carries the
  configured TLS settings, and tolerates managed MySQL that forbids
  `CREATE DATABASE` (PlanetScale) as long as the target database is reachable.
- `migrateApp(...)` — applies generated migrations via the shared executor.
- `createSuperuserCommand(...)` / `tango createsuperuser --email ... --password ...`
  — bootstraps an `isStaff` + `isSuperuser` user via `@tango-ts/contrib-auth`
  (password may come from `TANGO_SUPERUSER_PASSWORD` to stay out of shell
  history). Requires the contrib-auth migrations to be applied.
- `loadHandler(path)` — loads a default/exported Web handler or router-like object
  with `handle(request)`.
- `runServer(...)` — the `tango serve` implementation: serves the built handler,
  blocks until `SIGINT`/`SIGTERM`, drains in-flight requests (with a force-close
  timeout), and calls the project's `dispose()` to release the database pool.
- `runDevServer(...)` — watches source files, runs the configured build command, and
  reloads the built handler after successful rebuilds.
- `startProject(...)` — copies the default project template to a target directory,
  including deployment assets (`Dockerfile`, `.dockerignore`, `.env.example`,
  `.gitignore`, `README.md`, and the Vercel entrypoint `api/index.ts` +
  `vercel.json`). Dotfiles are stored as `__DOT__name` in the template because
  npm mangles real dotfiles when packing.
- `startApp(...)` — copies the default app template to a target directory.
- `mysqlConnectionOptionsFromEnv(...)` — delegates to the ORM's
  `mysqlConfigFromEnv`, sharing URL/TLS/fail-loud-in-production resolution with
  `mysqlFromEnv`.

Scaffold usage:

```sh
yarn dlx @tango-ts/cli startproject shop
yarn tango startapp billing --directory src/apps/billing
```

Scaffolds are copied from `templates/default-project` and `templates/default-app`, so
the generated layout is easy to inspect and evolve.

Server usage:

```sh
tango serve
tango serve --handler ./dist/server.js --host 127.0.0.1 --port 8000
tango dev --handler ./dist/server.js --watch ./src --build "yarn clean && yarn build"
```

In generated projects, `tango serve` defaults to `./dist/project.js`. When
`--host`/`--port` are not passed, `tango serve` reads `HOST`/`PORT` from the
environment (container platforms set `PORT`), defaulting to `127.0.0.1:8000`.

The handler module can export a Web handler:

```ts
export default async function handler(request: Request): Promise<Response> {
  return router.handle(request)
}
```

or a router-like object:

```ts
export default router
```

## Design patterns that matter here

- **Explicit registry:** no filesystem model scanning; the app tells the CLI exactly
  which models exist.
- **No destructive guessing:** rename candidates fail loudly unless explicit hints are
  provided. Interactive prompting will sit on top of the same `renames` option.
- **Deploy-time only:** `migrate` is for CI/CD or local dev, never request handling.
- **Typed migration files:** generated files export `migration` and `snapshotAfter`.
- **Source migration truth:** generated projects read/check/write migrations in `src`,
  then clean and build before running compiled migrations from `dist`.
- **Database creation before migrate:** `tango migrate` connects at the server level,
  creates the target database if needed, then reconnects to that database.
- **Web handler boundary:** `serve` loads a Web handler and delegates Node IO to
  `@tango-ts/adapters`.
- **Template-based scaffolding:** `startproject` and `startapp` copy real template
  directories instead of generating files from hidden strings.

## Public contract

Everything re-exported from `src/index.ts`. `src/main.ts` is only the process wrapper.

## Testing

- Unit (`test/makemigrations.test.ts`): generation, load-back, check failure, and
  rename-candidate behavior.
- Unit (`test/serve.test.ts`): handler module loading for functions and router-like
  objects.
- Unit (`test/scaffold.test.ts`): default project/app templates are copied and
  placeholder names are applied.
- Integration: `@tango-ts/migrations` owns the real MySQL executor round-trip.
