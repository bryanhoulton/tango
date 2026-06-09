import { defineProject, mysqlFromEnv } from '@tango-ts/server'

import { app as coreApp } from './apps/core/app.js'
import { routes as coreRoutes } from './apps/core/routes.js'
import { routes } from './routes.js'

export const project = defineProject({
  name: '__PROJECT_NAME__',
  database: mysqlFromEnv({ projectName: '__PROJECT_NAME__' }),
  routes,
  apps: [{ path: '/core', app: coreApp, routes: coreRoutes }]
})

export default project
