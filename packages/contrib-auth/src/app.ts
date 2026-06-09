import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineApp } from '@tango-ts/orm'

import { models } from './models.js'

/**
 * The auth app as consumed by the Tango CLI. The shipped migrations live
 * inside the installed package, so applying them is:
 *
 * ```sh
 * tango migrate --app node_modules/@tango-ts/contrib-auth/dist/app.js
 * ```
 *
 * This module touches `node:path`/`node:url` and is deliberately separate from
 * the runtime entrypoint (`@tango-ts/contrib-auth`), which stays runtime-agnostic.
 */
export const app = defineApp({
  name: 'auth',
  models,
  migrationsDir: join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations')
})

export default app
