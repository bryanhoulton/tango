# @tango-ts/functions

## 0.9.0

## 0.8.1

### Patch Changes

- Fix http function transport failing behind Vercel Deployment Protection. The self-invocation to `https://$VERCEL_URL` was intercepted at Vercel's edge with a 401 before reaching the deployment (the dispatch endpoint itself never returns 401). The http transport now sends `x-vercel-protection-bypass` automatically when `VERCEL_AUTOMATION_BYPASS_SECRET` is set (enable "Protection Bypass for Automation" in the Vercel project settings), `createHttpRuntime` accepts an extra `headers` option, and 401/403 dispatch failures explain the interception and how to fix it. Also documents the viewset action `path` field as the bare action name (e.g. `'close'`) — the viewset prepends `/:id/` for detail actions itself.

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
