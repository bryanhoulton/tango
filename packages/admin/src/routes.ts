import {
  AuthenticationFailed,
  IsAdminUser,
  type Authentication,
  type Permission
} from '@tango-ts/auth'
import {
  authenticateUser,
  authTokenAuthentication,
  issueToken,
  publicUser,
  revokeToken,
  User,
  type IssueTokenOptions
} from '@tango-ts/contrib-auth'
import type { HashPasswordOptions } from '@tango-ts/contrib-auth'
import {
  detailResponse,
  jsonResponse,
  type RequestContext
} from '@tango-ts/http'
import { createRouter, include, type Router } from '@tango-ts/router'
import type { TangoProject } from '@tango-ts/server'

import type {
  AdminModelDefinition,
  AdminPagination,
  AdminViewSetContext
} from './config.js'
import { buildAdminMeta, type AdminMetaDocument } from './meta.js'

export interface AdminOptions {
  /** Registered models, from `adminModel(...)`. */
  readonly models: readonly AdminModelDefinition[]
  /** Site title shown by the UI. `addAdminRoutes` defaults to the project name. */
  readonly title?: string
  /**
   * Authentication classes for every admin endpoint. Defaults to the
   * contrib-auth Bearer token model.
   */
  readonly authentication?: readonly Authentication[]
  /** Permissions for every admin endpoint. Defaults to `[IsAdminUser]`. */
  readonly permissions?: readonly Permission[]
  /** List pagination. Defaults to 25 per page, capped at 200. */
  readonly pagination?: AdminPagination
  /** Applied to tokens minted by the admin login. */
  readonly token?: IssueTokenOptions
  /** Password hashing overrides (tests lower iterations for speed). */
  readonly hashing?: HashPasswordOptions
}

const DEFAULT_PAGINATION: AdminPagination = { pageSize: 25, maxPageSize: 200 }

/** `my-shop` / `my_shop` → `My Shop Admin` (the default site title). */
function defaultSiteTitle(projectName: string): string {
  const words = projectName
    .split(/[-_\s]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  return `${words.join(' ')} Admin`.trim()
}

interface Credentials {
  readonly email: string
  readonly password: string
}

function credentialsFrom(payload: unknown): Credentials | undefined {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined
  }
  const record = payload as Record<string, unknown>
  const email = record['email']
  const password = record['password']
  if (typeof email !== 'string' || email.length === 0) {
    return undefined
  }
  if (typeof password !== 'string' || password.length === 0) {
    return undefined
  }
  return { email, password }
}

function bearerToken(ctx: RequestContext): string | undefined {
  const header = ctx.request.headers.get('authorization')
  if (header === null) {
    return undefined
  }
  const [scheme, token, extra] = header.split(/\s+/)
  if (scheme !== 'Bearer' || token === undefined || extra !== undefined) {
    return undefined
  }
  return token
}

/**
 * Run the same authentication + permission pipeline viewsets use, for the
 * plain admin routes (meta, me). Returns the denial response, or the
 * authenticated context to continue with.
 */
async function authorize(
  ctx: RequestContext,
  authentication: readonly Authentication[],
  permissions: readonly Permission[]
): Promise<Response | RequestContext> {
  let user: unknown
  try {
    for (const auth of authentication) {
      user = await auth.authenticate(ctx)
      if (user !== undefined) {
        break
      }
    }
  } catch (err) {
    if (err instanceof AuthenticationFailed) {
      return detailResponse(err.message, 401)
    }
    throw err
  }
  const authedCtx: RequestContext = { ...ctx, user }
  for (const permission of permissions) {
    if (permission.requiresAuthentication === true && authedCtx.user === undefined) {
      return detailResponse('Authentication credentials were not provided.', 401)
    }
    if (!(await permission.hasPermission(authedCtx))) {
      return detailResponse('Permission denied.', 403)
    }
  }
  return authedCtx
}

/**
 * Staff-gated login. Same contract as contrib-auth's `POST /login/`, but
 * non-staff users are rejected with the same message as bad credentials so
 * the response does not reveal which accounts exist or their roles.
 */
async function login(ctx: RequestContext, options: AdminOptions): Promise<Response> {
  let payload: unknown
  try {
    payload = await ctx.json()
  } catch {
    return detailResponse('Malformed JSON.', 400)
  }
  const credentials = credentialsFrom(payload)
  if (credentials === undefined) {
    return detailResponse('"email" and "password" are required.', 400)
  }
  const user = await authenticateUser(credentials.email, credentials.password, {
    hashing: options.hashing
  })
  if (user === undefined || (!user.isStaff && !user.isSuperuser)) {
    return detailResponse('Unable to log in with provided credentials.', 400)
  }
  const refreshed = await User.objects.update(
    { id: user.id },
    { lastLogin: new Date() }
  )
  const issued = await issueToken(user, options.token)
  return jsonResponse({ token: issued.token, user: publicUser(refreshed) })
}

async function logout(ctx: RequestContext): Promise<Response> {
  const token = bearerToken(ctx)
  if (token === undefined) {
    return detailResponse('Authentication credentials were not provided.', 401)
  }
  const revoked = await revokeToken(token)
  if (!revoked) {
    return detailResponse('Invalid token.', 401)
  }
  return new Response(null, { status: 204 })
}

/**
 * Build the admin API as a standalone router, mounted by `addAdminRoutes`.
 * Exposed for tests and for projects that want to mount it themselves.
 *
 * Routes (relative to the mount point):
 * - `POST /auth/login/`  — staff-only `{ email, password }` → `{ token, user }`
 * - `POST /auth/logout/` — revokes the presented Bearer token
 * - `GET  /auth/me/`     — the authenticated admin user
 * - `GET  /meta/`        — the admin site schema (drives the UI)
 * - CRUD viewsets at `/<table>/` and `/<table>/:id/` for every model
 */
export function adminRouter(
  options: AdminOptions,
  basePath = '/admin/api'
): Router {
  const authentication = options.authentication ?? [authTokenAuthentication()]
  const permissions = options.permissions ?? [IsAdminUser]
  const pagination = options.pagination ?? DEFAULT_PAGINATION
  const shared: AdminViewSetContext = { authentication, permissions, pagination }

  // Routes are static after startup, so the meta document is built once.
  let meta: AdminMetaDocument | undefined
  const metaDocument = (): AdminMetaDocument => {
    meta ??= buildAdminMeta(options.models, {
      title: options.title ?? 'Tango Admin',
      basePath,
      pagination
    })
    return meta
  }

  const router = createRouter()
  router.add('POST', '/auth/login/', (ctx) => login(ctx, options))
  router.add('POST', '/auth/logout/', logout)
  router.add('GET', '/auth/me/', async (ctx) => {
    const authed = await authorize(ctx, authentication, permissions)
    return authed instanceof Response ? authed : jsonResponse(authed.user)
  })
  router.add('GET', '/meta/', async (ctx) => {
    const authed = await authorize(ctx, authentication, permissions)
    return authed instanceof Response ? authed : jsonResponse(metaDocument())
  })
  for (const definition of options.models) {
    router.register(`/${definition.name}`, definition.createRoutable(shared))
  }
  return router
}

export interface AddAdminRoutesOptions extends AdminOptions {
  /** Where to mount the admin API. Defaults to `/admin/api`. */
  readonly path?: string
}

/**
 * Mount the admin API on a project (the `addOpenApiRoute` pattern):
 *
 * ```ts
 * export const project = defineProject({ ... })
 * addAdminRoutes(project, {
 *   models: [adminModel(Post, { searchFields: ['title'] })]
 * })
 * ```
 *
 * This registers JSON endpoints only. The admin UI is a prebuilt static SPA
 * (`@tango-ts/admin-ui`) served from the CDN — it must never be imported from
 * server code, so the function bundle stays UI-free.
 */
export function addAdminRoutes(
  project: TangoProject,
  options: AddAdminRoutesOptions
): void {
  const basePath = options.path ?? '/admin/api'
  const router = adminRouter(
    { ...options, title: options.title ?? defaultSiteTitle(project.name) },
    basePath
  )
  include(basePath, router).register(project.routes)
}
