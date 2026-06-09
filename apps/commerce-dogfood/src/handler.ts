import { defineServer, mysqlFromEnv } from '@tango-ts/server'

import { app } from './app.js'
import { routes } from './routes.js'

export default defineServer({ app, routes, database: mysqlFromEnv() })
