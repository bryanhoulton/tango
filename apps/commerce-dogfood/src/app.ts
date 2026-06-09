import { defineApp } from '@tango-ts/orm'

import { models } from './models.js'

export const app = defineApp({
  name: 'commerce-dogfood',
  models,
  migrationsDir: new URL('../migrations', import.meta.url).pathname
})

export default app
