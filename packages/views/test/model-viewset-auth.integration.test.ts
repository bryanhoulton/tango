import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  BearerTokenAuthentication,
  IsAdminUser,
  IsAuthenticated
} from '@tango-ts/auth'
import {
  createMysqlConnection,
  f,
  model,
  withConnection,
  type LooseDatabase
} from '@tango-ts/orm'
import { createRouter } from '@tango-ts/router'
import { modelSerializer } from '@tango-ts/serializers'

import { modelViewSet } from '../src/index.js'

const User = model('viewset_auth_users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  name: f.varchar(255)
})

const UserSerializer = modelSerializer(User, {
  fields: ['id', 'email', 'name'] as const,
  readOnlyFields: ['id'] as const
})

let db: Kysely<LooseDatabase>

const auth = new BearerTokenAuthentication({
  verifyToken: (token) => {
    if (token === 'admin') {
      return { id: 1, isStaff: true }
    }
    if (token === 'user') {
      return { id: 2, isStaff: false }
    }
    return undefined
  }
})

const authenticatedRouter = createRouter()
authenticatedRouter.register(
  '/users',
  modelViewSet({
    model: User,
    serializer: UserSerializer,
    authentication: [auth],
    permissions: [IsAuthenticated]
  })
)

const adminRouter = createRouter()
adminRouter.register(
  '/users',
  modelViewSet({
    model: User,
    serializer: UserSerializer,
    authentication: [auth],
    permissions: [IsAdminUser]
  })
)

async function handle(router: typeof authenticatedRouter, request: Request) {
  return withConnection(db, () => router.handle(request))
}

beforeAll(async () => {
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })
  await sql`drop table if exists viewset_auth_users`.execute(db)
  await sql`
    create table viewset_auth_users (
      id int primary key auto_increment,
      email varchar(255) not null unique,
      name varchar(255) not null
    )
  `.execute(db)
  await sql`
    insert into viewset_auth_users (email, name) values ('ada@example.com', 'Ada')
  `.execute(db)
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists viewset_auth_users`.execute(db)
    await db.destroy()
  }
})

describe('ModelViewSet auth integration', () => {
  it('returns 401 when credentials are required but absent', async () => {
    const response = await handle(
      authenticatedRouter,
      new Request('https://example.test/users/')
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      detail: 'Authentication credentials were not provided.'
    })
  })

  it('returns 401 for invalid bearer tokens', async () => {
    const response = await handle(
      authenticatedRouter,
      new Request('https://example.test/users/', {
        headers: { authorization: 'Bearer wrong' }
      })
    )

    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ detail: 'Invalid token.' })
  })

  it('allows authenticated users for IsAuthenticated', async () => {
    const response = await handle(
      authenticatedRouter,
      new Request('https://example.test/users/', {
        headers: { authorization: 'Bearer user' }
      })
    )

    expect(response.status).toBe(200)
  })

  it('returns 403 when authenticated user lacks admin permission', async () => {
    const response = await handle(
      adminRouter,
      new Request('https://example.test/users/', {
        headers: { authorization: 'Bearer user' }
      })
    )

    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ detail: 'Permission denied.' })
  })
})
