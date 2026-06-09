// Vercel adapter. Imported via `@tango-ts/adapters/vercel` so Vercel's bundler
// never pulls in the Node HTTP server from the package root. Type-only imports
// keep this module free of runtime Node dependencies.
import type { WebHandler } from './index.js'

export interface VercelFetchHandler {
  fetch: WebHandler
}

/**
 * Wrap a Tango project (or any Web handler) in Vercel's `fetch` web-handler
 * export for the Node.js runtime:
 *
 * ```ts
 * // api/index.ts
 * import { vercelHandler } from '@tango-ts/adapters/vercel'
 * import { project } from '../src/project.js'
 *
 * export default vercelHandler(project)
 * ```
 *
 * Pair with a `vercel.json` rewrite that funnels every path into this single
 * function — Tango owns all routing internally. Node runtime only: the ORM's
 * mysql2 driver needs TCP sockets, which the Edge runtime does not provide.
 */
export function vercelHandler(handler: WebHandler): VercelFetchHandler {
  // Async so synchronous throws become rejections, which the platform reports
  // as a function error instead of an unhandled exception at call time.
  return { fetch: async (request) => handler(request) }
}
