import { defineApp } from '@tango-ts/server'

import { functions } from './functions/index.js'
import { models } from './models.js'
import { routes } from './routes.js'

// The whole app in one object: models, routes, and internal functions.
// Mounts at /__APP_NAME__ by default (override with `path`). Add it to the
// project's `apps` list in src/project.ts.
export const app = defineApp({
  name: '__APP_NAME__',
  models,
  routes,
  functions,
  migrationsDir: new URL('./migrations', import.meta.url).pathname
})

export default app
