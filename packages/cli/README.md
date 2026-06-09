# @tango-ts/cli

## Responsibility

Management commands for Tango. This package loads an explicitly registered Tango app,
generates TypeScript migration files, checks for missing migrations, applies
migrations through the `@tango-ts/migrations` executor, and starts a local dev server
for Web handlers. It owns command orchestration; it does not own schema diffing, SQL
rendering, ORM behavior, or adapter internals.

## What it responds to

- A `TangoApp` from `defineApp({ models, migrationsDir })`.
- `startproject`, `startapp`, `makemigrations`, `check`, `migrate`, and `serve`
  commands.
- A deploy-time database connection for `migrate`.
- A Web handler module for `serve`.

## Functionality

- `loadApp(path)` — dynamic app-module loading for the command wrapper.
- `loadMigrations(dir)` — loads generated TS/JS migration files.
- `makemigrations(...)` — builds the current model snapshot, diffs from the latest
  migration snapshot, and writes a typed TS migration file.
- `checkMigrations(...)` — fails when models changed without a migration.
- `migrateApp(...)` — applies generated migrations via the shared executor.
- `loadHandler(path)` — loads a default/exported Web handler or router-like object
  with `handle(request)`.
- `startProject(...)` — copies the default project template to a target directory.
- `startApp(...)` — copies the default app template to a target directory.

Scaffold usage:

```sh
yarn dlx @tango-ts/cli startproject shop
yarn tango startapp billing --directory src/apps/billing
```

Scaffolds are copied from `templates/default-project` and `templates/default-app`, so
the generated layout is easy to inspect and evolve.

Local dev server usage:

```sh
tango serve --handler ./dist/server.js --host 127.0.0.1 --port 8000
```

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
