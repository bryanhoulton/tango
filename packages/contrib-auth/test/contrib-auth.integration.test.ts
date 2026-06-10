import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { IsAdminUser, IsAuthenticated } from '@tango-ts/auth'
import { migrateApp } from '@tango-ts/cli'
import { jsonResponse } from '@tango-ts/http'
import {
  createMysqlConnection,
  withConnection,
  type LooseDatabase
} from '@tango-ts/orm'
import { createRouter, include, route, type Router } from '@tango-ts/router'
import { modelSerializer } from '@tango-ts/serializers'
import { defineServer } from '@tango-ts/server'
import { modelViewSet } from '@tango-ts/views'

import { app } from '../src/app.js'
import {
  authRoutes,
  authTokenAuthentication,
  AuthToken,
  createSuperuser,
  createUser,
  hashToken,
  issueToken,
  User
} from '../src/index.js'

let db: Kysely<LooseDatabase>

// The production wiring this suite exercises: built-in auth routes plus a
// viewset protected by the built-in token authentication — exactly what a
// generated project would register.
const UserSerializer = modelSerializer(User, {
  fields: ['id', 'email', 'firstName', 'lastName'] as const,
  readOnlyFields: ['id'] as const
})

const router = createRouter()
include('/auth', authRoutes()).register(router)
router.register(
  '/users',
  modelViewSet({
    model: User,
    serializer: UserSerializer,
    authentication: [authTokenAuthentication()],
    permissions: [IsAuthenticated]
  })
)
router.register(
  '/admin-users',
  modelViewSet({
    model: User,
    serializer: UserSerializer,
    authentication: [authTokenAuthentication()],
    permissions: [IsAdminUser]
  })
)

function handle(request: Request, routes: Router = router): Promise<Response> {
  return withConnection(db, () => routes.handle(request))
}

function jsonRequest(url: string, body: unknown): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

async function loginToken(email: string, password: string): Promise<string> {
  const response = await handle(
    jsonRequest('https://example.test/auth/login/', { email, password })
  )
  expect(response.status).toBe(200)
  const body = (await response.json()) as { token: string }
  return body.token
}

beforeAll(async () => {
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })
  await sql`drop table if exists auth_tokens`.execute(db)
  await sql`drop table if exists auth_users`.execute(db)
  await sql`
    delete from tango_migrations where name like 'auth.%'
  `.execute(db).catch(() => undefined)

  // The shipped migration IS the schema — no hand-written CREATE TABLE here,
  // so this suite fails if the packaged migration drifts from the models.
  const applied = await migrateApp({ app, db })
  expect(applied).toEqual(['auth.0001_initial'])

  await withConnection(db, async () => {
    await createSuperuser({ email: 'admin@example.com', password: 'admin-pass-123' })
    await createUser({
      email: 'ada@example.com',
      password: 'ada-pass-123',
      firstName: 'Ada',
      lastName: 'Lovelace'
    })
    await createUser({
      email: 'inactive@example.com',
      password: 'inactive-pass-123',
      isActive: false
    })
  })
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists auth_tokens`.execute(db)
    await sql`drop table if exists auth_users`.execute(db)
    await sql`
      delete from tango_migrations where name like 'auth.%'
    `.execute(db).catch(() => undefined)
    await db.destroy()
  }
})

describe('shipped migrations', () => {
  it('is idempotent: re-running applies nothing', async () => {
    await expect(migrateApp({ app, db })).resolves.toEqual([])
  })
})

describe('POST /auth/login/', () => {
  it('rejects malformed JSON', async () => {
    const response = await handle(
      new Request('https://example.test/auth/login/', {
        method: 'POST',
        body: 'not-json'
      })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ detail: 'Malformed JSON.' })
  })

  it('rejects missing credentials', async () => {
    const response = await handle(
      jsonRequest('https://example.test/auth/login/', { email: 'a@b.com' })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      detail: '"email" and "password" are required.'
    })
  })

  it('rejects a wrong password and an unknown email identically', async () => {
    const wrongPassword = await handle(
      jsonRequest('https://example.test/auth/login/', {
        email: 'ada@example.com',
        password: 'wrong'
      })
    )
    const unknownEmail = await handle(
      jsonRequest('https://example.test/auth/login/', {
        email: 'nobody@example.com',
        password: 'wrong'
      })
    )
    expect(wrongPassword.status).toBe(400)
    expect(unknownEmail.status).toBe(400)
    expect(await wrongPassword.json()).toEqual(await unknownEmail.json())
  })

  it('rejects an inactive user with the same response', async () => {
    const response = await handle(
      jsonRequest('https://example.test/auth/login/', {
        email: 'inactive@example.com',
        password: 'inactive-pass-123'
      })
    )
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      detail: 'Unable to log in with provided credentials.'
    })
  })

  it('returns a one-time token and the user (never the password hash)', async () => {
    const response = await handle(
      jsonRequest('https://example.test/auth/login/', {
        email: 'ada@example.com',
        password: 'ada-pass-123'
      })
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      token: string
      user: Record<string, unknown>
    }
    expect(body.token).toMatch(/^tango_[A-Za-z0-9_-]{43}$/)
    expect(body.user['email']).toBe('ada@example.com')
    expect(body.user['lastLogin']).not.toBeNull()
    expect(body.user).not.toHaveProperty('password')

    // Only the SHA-256 of the token is persisted.
    const rows = await withConnection(db, async () => await AuthToken.objects.all())
    for (const row of rows) {
      expect(row.tokenHash).not.toBe(body.token)
      expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it('records lastLogin on the user', async () => {
    await loginToken('admin@example.com', 'admin-pass-123')
    const admin = await withConnection(db, () =>
      User.objects.get({ email: 'admin@example.com' })
    )
    expect(admin.lastLogin).not.toBeNull()
  })
})

describe('GET /auth/me/', () => {
  it('401s without credentials', async () => {
    const response = await handle(new Request('https://example.test/auth/me/'))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      detail: 'Authentication credentials were not provided.'
    })
  })

  it('401s with an invalid token', async () => {
    const response = await handle(
      new Request('https://example.test/auth/me/', {
        headers: { authorization: 'Bearer tango_definitely-not-real' }
      })
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ detail: 'Invalid token.' })
  })

  it('returns the authenticated user without the password hash', async () => {
    const token = await loginToken('ada@example.com', 'ada-pass-123')
    const response = await handle(
      new Request('https://example.test/auth/me/', {
        headers: { authorization: `Bearer ${token}` }
      })
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body['email']).toBe('ada@example.com')
    expect(body['firstName']).toBe('Ada')
    expect(body).not.toHaveProperty('password')
  })
})

describe('protected viewsets using authTokenAuthentication()', () => {
  it('401s without a token and 200s with one', async () => {
    const anonymous = await handle(new Request('https://example.test/users/'))
    expect(anonymous.status).toBe(401)

    const token = await loginToken('ada@example.com', 'ada-pass-123')
    const authed = await handle(
      new Request('https://example.test/users/', {
        headers: { authorization: `Bearer ${token}` }
      })
    )
    expect(authed.status).toBe(200)
  })

  it('enforces IsAdminUser from the built-in isStaff/isSuperuser flags', async () => {
    const userToken = await loginToken('ada@example.com', 'ada-pass-123')
    const adminToken = await loginToken('admin@example.com', 'admin-pass-123')

    const forbidden = await handle(
      new Request('https://example.test/admin-users/', {
        headers: { authorization: `Bearer ${userToken}` }
      })
    )
    expect(forbidden.status).toBe(403)

    const allowed = await handle(
      new Request('https://example.test/admin-users/', {
        headers: { authorization: `Bearer ${adminToken}` }
      })
    )
    expect(allowed.status).toBe(200)
  })

  it('tracks lastUsedAt on authenticated requests', async () => {
    const token = await loginToken('ada@example.com', 'ada-pass-123')
    await handle(
      new Request('https://example.test/users/', {
        headers: { authorization: `Bearer ${token}` }
      })
    )
    const row = await withConnection(db, async () =>
      AuthToken.objects.get({ tokenHash: await hashToken(token) })
    )
    expect(row.lastUsedAt).not.toBeNull()
  })
})

describe('token lifecycle', () => {
  it('rejects expired tokens', async () => {
    const ada = await withConnection(db, () =>
      User.objects.get({ email: 'ada@example.com' })
    )
    const issued = await withConnection(db, () =>
      issueToken(ada, { expiresInMs: 60_000 })
    )
    // MySQL DATETIME has second precision, so a tiny TTL can round into the
    // future; move the expiry firmly into the past instead of sleeping.
    await withConnection(db, () =>
      AuthToken.objects.update(
        { id: issued.row.id },
        { expiresAt: new Date(Date.now() - 60_000) }
      )
    )
    const response = await handle(
      new Request('https://example.test/auth/me/', {
        headers: { authorization: `Bearer ${issued.token}` }
      })
    )
    expect(response.status).toBe(401)
  })

  it('stops authenticating when the user is deactivated', async () => {
    const user = await withConnection(db, () =>
      createUser({ email: 'temp@example.com', password: 'temp-pass-123' })
    )
    const token = await loginToken('temp@example.com', 'temp-pass-123')
    await withConnection(db, () =>
      User.objects.update({ id: user.id }, { isActive: false })
    )
    const response = await handle(
      new Request('https://example.test/auth/me/', {
        headers: { authorization: `Bearer ${token}` }
      })
    )
    expect(response.status).toBe(401)
  })
})

describe('project-level authentication (defineServer)', () => {
  // A project configured once with `authentication`: plain routes and viewsets
  // both see ctx.user without any per-route or per-viewset auth wiring.
  function buildServer() {
    const projectRouter = createRouter()
    include('/auth', authRoutes()).register(projectRouter)
    route('GET', '/whoami/', (ctx) =>
      jsonResponse({ user: ctx.user ?? null })
    ).register(projectRouter)
    projectRouter.register(
      '/protected-users',
      modelViewSet({
        model: User,
        serializer: UserSerializer,
        permissions: [IsAuthenticated]
        // No `authentication` here on purpose: it must inherit ctx.user.
      })
    )
    return defineServer({
      routes: projectRouter,
      database: db,
      authentication: [authTokenAuthentication()]
    })
  }

  it('sets ctx.user on plain routes with zero per-route wiring', async () => {
    const server = buildServer()
    const token = await loginToken('ada@example.com', 'ada-pass-123')

    const authed = await server(
      new Request('https://example.test/whoami/', {
        headers: { authorization: `Bearer ${token}` }
      })
    )
    expect(authed.status).toBe(200)
    const body = (await authed.json()) as { user: { email?: string } | null }
    expect(body.user?.email).toBe('ada@example.com')
  })

  it('leaves anonymous requests unauthenticated instead of rejecting them', async () => {
    const server = buildServer()
    const response = await server(new Request('https://example.test/whoami/'))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: null })
  })

  it('rejects invalid credentials globally with a 401', async () => {
    const server = buildServer()
    const response = await server(
      new Request('https://example.test/whoami/', {
        headers: { authorization: 'Bearer tango_not-a-real-token' }
      })
    )
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ detail: 'Invalid token.' })
  })

  it('flows ctx.user into viewsets that declare no authentication', async () => {
    const server = buildServer()

    const anonymous = await server(
      new Request('https://example.test/protected-users/')
    )
    expect(anonymous.status).toBe(401)

    const token = await loginToken('ada@example.com', 'ada-pass-123')
    const authed = await server(
      new Request('https://example.test/protected-users/', {
        headers: { authorization: `Bearer ${token}` }
      })
    )
    expect(authed.status).toBe(200)
  })

  it('serves the auth routes themselves through the same pipeline', async () => {
    const server = buildServer()
    const token = await loginToken('ada@example.com', 'ada-pass-123')
    const me = await server(
      new Request('https://example.test/auth/me/', {
        headers: { authorization: `Bearer ${token}` }
      })
    )
    expect(me.status).toBe(200)
    const body = (await me.json()) as Record<string, unknown>
    expect(body['email']).toBe('ada@example.com')
  })
})

describe('POST /auth/logout/', () => {
  it('401s without a token', async () => {
    const response = await handle(
      new Request('https://example.test/auth/logout/', { method: 'POST' })
    )
    expect(response.status).toBe(401)
  })

  it('revokes the presented token: it stops working immediately', async () => {
    const token = await loginToken('ada@example.com', 'ada-pass-123')

    const logout = await handle(
      new Request('https://example.test/auth/logout/', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` }
      })
    )
    expect(logout.status).toBe(204)

    const afterLogout = await handle(
      new Request('https://example.test/auth/me/', {
        headers: { authorization: `Bearer ${token}` }
      })
    )
    expect(afterLogout.status).toBe(401)

    // Logging out twice with the same token is a 401, not a crash.
    const again = await handle(
      new Request('https://example.test/auth/logout/', {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` }
      })
    )
    expect(again.status).toBe(401)
  })
})
