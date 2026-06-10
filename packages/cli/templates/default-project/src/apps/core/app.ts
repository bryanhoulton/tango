import { defineApp } from '@tango-ts/server'

import { functions } from './functions/index.js'
import { models } from './models.js'
import { routes } from './routes.js'

// The whole app in one object: models, routes, and internal functions.
// Mounts at /core by default (override with `path`).
export const app = defineApp({
  name: 'core',
  models,
  routes,
  functions,
  migrationsDir: new URL('./migrations', import.meta.url).pathname
})

export default app
