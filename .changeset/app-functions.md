---
'@tango-ts/functions': minor
'@tango-ts/server': minor
'@tango-ts/cli': minor
---

Internal serverless functions (`@tango-ts/functions`) and apps as single objects: `defineApp({ name, models, routes, functions, migrationsDir })` declares an app in one place, and `defineProject({ apps: [coreApp] })` wires it without per-app config. Functions live in each app's `functions/` folder, are never exposed as API routes, and run in-process locally or as their own Vercel invocations over a signed internal channel.
