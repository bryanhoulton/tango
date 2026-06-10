import {
  BearerTokenAuthentication,
  type Authentication
} from '@tango-ts/auth'
import { DoesNotExist } from '@tango-ts/orm'

import {
  AuthToken,
  publicUser,
  User,
  type AuthTokenRow,
  type PublicUser,
  type UserRow
} from './models.js'
import { generateToken, hashToken } from './tokens.js'

/**
 * `lastUsedAt` writes are throttled so steady-state authenticated requests
 * stay at two queries (token lookup + user fetch) instead of paying an UPDATE
 * on every call.
 */
const LAST_USED_THROTTLE_MS = 60_000

export interface IssueTokenOptions {
  /** Optional label stored on the token row. */
  readonly name?: string
  /** Time-to-live in milliseconds. Omit for a non-expiring token. */
  readonly expiresInMs?: number
}

export interface IssuedToken {
  /** The plaintext token — shown once, never stored. */
  readonly token: string
  readonly row: AuthTokenRow
}

/** Mint a new opaque token for a user and persist its hash. */
export async function issueToken(
  user: Pick<UserRow, 'id'>,
  options: IssueTokenOptions = {}
): Promise<IssuedToken> {
  const token = generateToken()
  const row = await AuthToken.objects.create({
    tokenHash: await hashToken(token),
    userId: user.id,
    name: options.name ?? '',
    expiresAt:
      options.expiresInMs === undefined
        ? null
        : new Date(Date.now() + options.expiresInMs),
    lastUsedAt: null
  })
  return { token, row }
}

/** Revoke a single token by its plaintext value. Returns whether it existed. */
export async function revokeToken(token: string): Promise<boolean> {
  const tokenHash = await hashToken(token)
  try {
    const row = await AuthToken.objects.get({ tokenHash })
    await AuthToken.objects.delete({ id: row.id })
    return true
  } catch (err) {
    if (err instanceof DoesNotExist) {
      return false
    }
    throw err
  }
}

function isExpired(row: AuthTokenRow, now: Date): boolean {
  return row.expiresAt !== null && row.expiresAt.getTime() <= now.getTime()
}

/**
 * The `verifyToken` callback backing `authTokenAuthentication()`. Resolves a
 * plaintext token to its user, or `undefined` when the token is unknown,
 * expired, or its user is missing/inactive. Exported so projects can reuse it
 * with their own `Authentication` composition.
 */
export async function verifyAuthToken(
  token: string
): Promise<PublicUser | undefined> {
  const tokenHash = await hashToken(token)
  let row: AuthTokenRow
  try {
    row = await AuthToken.objects.get({ tokenHash })
  } catch (err) {
    if (err instanceof DoesNotExist) {
      return undefined
    }
    throw err
  }
  const now = new Date()
  if (isExpired(row, now)) {
    return undefined
  }
  let user: UserRow
  try {
    user = await User.objects.get({ id: row.userId })
  } catch (err) {
    if (err instanceof DoesNotExist) {
      return undefined
    }
    throw err
  }
  if (!user.isActive) {
    return undefined
  }
  const lastUsed = row.lastUsedAt?.getTime() ?? 0
  if (now.getTime() - lastUsed >= LAST_USED_THROTTLE_MS) {
    await AuthToken.objects.update({ id: row.id }, { lastUsedAt: now })
  }
  return publicUser(user)
}

/**
 * Ready-made `Authentication` for the built-in token model: validates
 * `Authorization: Bearer tango_...` and puts the public user on `ctx.user`.
 * Typed as `Authentication<PublicUser>`, so `apiView` handlers and viewset
 * actions using it see `ctx.user?: PublicUser` — no casts needed.
 */
export function authTokenAuthentication(): Authentication<PublicUser> {
  return new BearerTokenAuthentication({ verifyToken: verifyAuthToken })
}
