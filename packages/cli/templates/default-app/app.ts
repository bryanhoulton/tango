import { defineApp } from '@tango-ts/orm'

import { models } from './models.js'

export const app = defineApp({
  name: '__APP_NAME__',
  models,
  migrationsDir: new URL('./migrations', import.meta.url).pathname
})

export default app
