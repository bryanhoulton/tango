import { addOpenApiRoute } from '@tango-ts/openapi'
import {
  defineProject,
  mysqlFromEnv,
  requestLog,
  securityHeaders
} from '@tango-ts/server'

import { app as coreApp } from './apps/core/app.js'
import { routes as coreRoutes } from './apps/core/routes.js'
import { routes } from './routes.js'

export const project = defineProject({
  name: '__PROJECT_NAME__',
  database: mysqlFromEnv({ projectName: '__PROJECT_NAME__' }),
  // Outermost-first. Add cors({ origins: [...] }) here when a browser app
  // calls this API from another origin.
  middleware: [requestLog(), securityHeaders()],
  routes,
  apps: [{ path: '/core', app: coreApp, routes: coreRoutes }]
})

// Serves the generated schema at GET /openapi.json.
addOpenApiRoute(project)

export default project
