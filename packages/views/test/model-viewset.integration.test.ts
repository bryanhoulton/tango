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

const User = model('viewset_users', {
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
    actions: [
      {
        name: 'activate',
        method: 'POST',
        path: 'activate',
        detail: true,
        handler: (ctx) =>
          Response.json({
            activated: ctx.params['id']
          })
      }
    ]
  })
)

async function handle(request: Request): Promise<Response> {
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
  await sql`drop table if exists viewset_users`.execute(db)
  await sql`
    create table viewset_users (
      id int primary key auto_increment,
      email varchar(255) not null unique,
      age int null,
      name varchar(255) not null
    )
  `.execute(db)
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists viewset_users`.execute(db)
    await db.destroy()
  }
})

describe('ModelViewSet over Web Request/Response', () => {
  it('creates a row with POST and returns serializer output', async () => {
    const response = await handle(
      new Request('https://example.test/users/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'ada@example.com',
          age: null,
          name: 'Ada'
        })
      })
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      id: 1,
      email: 'ada@example.com',
      age: null,
      name: 'Ada'
    })
  })

  it('lists rows with GET collection', async () => {
    const response = await handle(new Request('https://example.test/users/'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      {
        id: 1,
        email: 'ada@example.com',
        age: null,
        name: 'Ada'
      }
    ])
  })

  it('retrieves one row by primary key', async () => {
    const response = await handle(new Request('https://example.test/users/1/'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 1,
      email: 'ada@example.com',
      age: null,
      name: 'Ada'
    })
  })

  it('returns 404 for missing retrieve', async () => {
    const response = await handle(new Request('https://example.test/users/999/'))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ detail: 'Not found.' })
  })

  it('returns serializer errors for invalid POST', async () => {
    const response = await handle(
      new Request('https://example.test/users/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'bad@example.com' })
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      name: ['This field is required.']
    })
  })

  it('runs detail custom actions', async () => {
    const response = await handle(
      new Request('https://example.test/users/1/activate/', {
        method: 'POST'
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ activated: '1' })
  })
})
