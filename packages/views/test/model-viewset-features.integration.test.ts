import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

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

const User = model('viewset_feature_users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age: f.int().nullable(),
  name: f.varchar(255)
})

const UserSerializer = modelSerializer(User, {
  fields: ['id', 'email', 'age', 'name'] as const,
  readOnlyFields: ['id'] as const
})

let db: Kysely<LooseDatabase>

const router = createRouter()
router.register(
  '/users',
  modelViewSet({
    model: User,
    serializer: UserSerializer,
    filters: ['age__gte', 'name__icontains'] as const,
    pagination: { pageSize: 2 }
  })
)

const protectedRouter = createRouter()
protectedRouter.register(
  '/users',
  modelViewSet({
    model: User,
    serializer: UserSerializer,
    authenticate: (ctx) =>
      ctx.request.headers.get('authorization') === 'Bearer ok'
        ? { id: 1, role: 'admin' }
        : undefined,
    permissions: [(ctx) => ctx.user !== undefined]
  })
)

async function handle(request: Request): Promise<Response> {
  return withConnection(db, () => router.handle(request))
}

async function handleProtected(request: Request): Promise<Response> {
  return withConnection(db, () => protectedRouter.handle(request))
}

beforeAll(async () => {
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })
  await sql`drop table if exists viewset_feature_users`.execute(db)
  await sql`
    create table viewset_feature_users (
      id int primary key auto_increment,
      email varchar(255) not null unique,
      age int null,
      name varchar(255) not null
    )
  `.execute(db)
  await sql`
    insert into viewset_feature_users (email, age, name) values
      ('ada@example.com', 36, 'Ada'),
      ('bob@example.com', 17, 'Bob'),
      ('grace@example.com', 42, 'Grace')
  `.execute(db)
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists viewset_feature_users`.execute(db)
    await db.destroy()
  }
})

describe('ModelViewSet filters, pagination, permissions, and parse errors', () => {
  it('ANDs configured query param filters', async () => {
    const response = await handle(
      new Request(
        'https://example.test/users/?age__gte=30&name__icontains=a&pageSize=10'
      )
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      count: 2,
      next: null,
      previous: null,
      results: [
        { id: 1, email: 'ada@example.com', age: 36, name: 'Ada' },
        { id: 3, email: 'grace@example.com', age: 42, name: 'Grace' }
      ]
    })
  })

  it('returns a paginated response envelope', async () => {
    const response = await handle(new Request('https://example.test/users/?page=1'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      count: 3,
      next: 'https://example.test/users/?page=2',
      previous: null,
      results: [
        { id: 1, email: 'ada@example.com', age: 36, name: 'Ada' },
        { id: 2, email: 'bob@example.com', age: 17, name: 'Bob' }
      ]
    })
  })

  it('runs auth and permission hooks before view logic', async () => {
    const denied = await handleProtected(new Request('https://example.test/users/'))
    expect(denied.status).toBe(403)
    expect(await denied.json()).toEqual({ detail: 'Permission denied.' })

    const allowed = await handleProtected(
      new Request('https://example.test/users/', {
        headers: { authorization: 'Bearer ok' }
      })
    )
    expect(allowed.status).toBe(200)
  })

  it('returns a 400 envelope for malformed JSON', async () => {
    const response = await handle(
      new Request('https://example.test/users/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{bad json'
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ detail: 'Malformed JSON.' })
  })
})
