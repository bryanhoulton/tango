# @tango-ts/functions

## 0.8.0

### Minor Changes

- Internal `@tango-ts/*` dependencies are now `peerDependencies` instead of `dependencies`. Package managers therefore never install nested copies of sibling packages, eliminating the version-skew failures (diverging TS types, duplicate module instances) that previously required `resolutions` workarounds on every version bump.

  Migration: projects must list every `@tango-ts/*` package they transitively use in their own `package.json` — in particular add `@tango-ts/auth` and `@tango-ts/core-types` (peers of server/views/orm), and `@tango-ts/contrib-auth` + `@tango-ts/migrations` if you use the CLI. The scaffold template includes the full set. Existing `resolutions` entries for `@tango-ts/*` can be removed.

## 0.7.0

### Minor Changes

- ed15d6b: Internal serverless functions (`@tango-ts/functions`) and apps as single objects: `defineApp({ name, models, routes, functions, migrationsDir })` declares an app in one place, and `defineProject({ apps: [coreApp] })` wires it without per-app config. Functions live in each app's `functions/` folder, are never exposed as API routes, and run in-process locally or as their own Vercel invocations over a signed internal channel.

### Patch Changes

- @tango-ts/http@0.7.0
- @tango-ts/orm@0.7.0
