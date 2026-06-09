import { f, model } from '@tango-ts/orm'
import type { InferSelect } from '@tango-ts/orm'

/**
 * The built-in user. Email is the login identifier (no separate username —
 * the modern default). Column sizes mirror Django's `auth_user` where they
 * exist (`password` 128, names 150, email 254 per RFC 5321).
 */
export const User = model('auth_users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(254).unique(),
  /** Encoded hash (`pbkdf2_sha256$...`) — never a plaintext password. */
  password: f.varchar(128),
  firstName: f.varchar(150).default(''),
  lastName: f.varchar(150).default(''),
  /** Inactive users cannot log in and their tokens stop authenticating. */
  isActive: f.boolean().default(true),
  isStaff: f.boolean().default(false),
  isSuperuser: f.boolean().default(false),
  dateJoined: f.datetime().autoNowAdd(),
  lastLogin: f.datetime().nullable()
})

/**
 * A database-backed opaque API token (DRF authtoken / Laravel Sanctum model).
 * Only the SHA-256 of the token is stored. `dbConstraint: false` keeps the
 * schema deployable on PlanetScale/Vitess; token verification re-fetches the
 * user row, so a deleted or deactivated user invalidates their tokens even
 * without a database-level cascade.
 */
export const AuthToken = model('auth_tokens', {
  id: f.int().primaryKey().autoIncrement(),
  tokenHash: f.varchar(64).unique(),
  userId: f.foreignKey(() => User, 'id', { dbConstraint: false }),
  /** Optional label ("CI deploy key", "Sarah's laptop"). */
  name: f.varchar(255).default(''),
  createdAt: f.datetime().autoNowAdd(),
  /** Null = non-expiring. */
  expiresAt: f.datetime().nullable(),
  lastUsedAt: f.datetime().nullable()
})

export type UserRow = InferSelect<typeof User.fields>
export type AuthTokenRow = InferSelect<typeof AuthToken.fields>

/** A user as exposed over the API and on `ctx.user` — never the password hash. */
export type PublicUser = Omit<UserRow, 'password'>

export function publicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    isActive: row.isActive,
    isStaff: row.isStaff,
    isSuperuser: row.isSuperuser,
    dateJoined: row.dateJoined,
    lastLogin: row.lastLogin
  }
}

export const models = [User, AuthToken] as const
