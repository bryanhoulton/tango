# @tango-ts/functions

## 0.7.0

### Minor Changes

- ed15d6b: Internal serverless functions (`@tango-ts/functions`) and apps as single objects: `defineApp({ name, models, routes, functions, migrationsDir })` declares an app in one place, and `defineProject({ apps: [coreApp] })` wires it without per-app config. Functions live in each app's `functions/` folder, are never exposed as API routes, and run in-process locally or as their own Vercel invocations over a signed internal channel.

### Patch Changes

- @tango-ts/http@0.7.0
- @tango-ts/orm@0.7.0
