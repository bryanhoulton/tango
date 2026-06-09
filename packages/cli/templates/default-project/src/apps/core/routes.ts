import { jsonResponse } from '@tango-ts/http'
import { defineRoutes, route } from '@tango-ts/router'

export const routes = defineRoutes([
  route('GET', '/health/live/', () => jsonResponse({ ok: true }))
])

export default routes
