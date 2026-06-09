import { AuthenticationFailed } from '@tango-ts/auth'
import {
  detailResponse,
  jsonResponse,
  type RequestContext
} from '@tango-ts/http'
import { defineRoutes, route, type Router } from '@tango-ts/router'

import {
  authTokenAuthentication,
  issueToken,
  revokeToken,
  type IssueTokenOptions
} from './authentication.js'
import type { HashPasswordOptions } from './hashers.js'
import { publicUser, User } from './models.js'
import { authenticateUser } from './users.js'

export interface AuthRoutesOptions {
  /** Applied to tokens minted by `POST /login/`. */
  readonly token?: IssueTokenOptions
  /** Password hashing overrides (tests lower iterations for speed). */
  readonly hashing?: HashPasswordOptions
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

async function login(
  ctx: RequestContext,
  options: AuthRoutesOptions
): Promise<Response> {
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
  if (user === undefined) {
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

async function me(ctx: RequestContext): Promise<Response> {
  // Plain routes do not run the viewset authentication pipeline, so this
  // handler invokes the same Authentication class itself.
  try {
    const user = await authTokenAuthentication().authenticate(ctx)
    if (user === undefined) {
      return detailResponse('Authentication credentials were not provided.', 401)
    }
    return jsonResponse(user)
  } catch (err) {
    if (err instanceof AuthenticationFailed) {
      return detailResponse(err.message, 401)
    }
    throw err
  }
}

/**
 * The built-in auth endpoints:
 *
 * - `POST /login/`  — `{ email, password }` → `{ token, user }` (the plaintext
 *   token is returned exactly once).
 * - `POST /logout/` — revokes the presented Bearer token; 204 on success.
 * - `GET /me/`      — the authenticated user for the presented Bearer token.
 */
export function authRoutes(options: AuthRoutesOptions = {}): Router {
  return defineRoutes([
    route('POST', '/login/', (ctx) => login(ctx, options)),
    route('POST', '/logout/', logout),
    route('GET', '/me/', me)
  ])
}
