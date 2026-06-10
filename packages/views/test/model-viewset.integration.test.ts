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

const Author = model('viewset_authors', {
  id: f.int().primaryKey().autoIncrement(),
  name: f.varchar(255),
  email: f.varchar(255)
})

const Post = model('viewset_posts', {
  id: f.int().primaryKey().autoIncrement(),
  title: f.varchar(255),
  authorId: f.foreignKey(() => Author, 'id')
})

const AuthorSerializer = modelSerializer(Author, {
  fields: ['id', 'name'] as const,
  readOnlyFields: ['id'] as const
})

const PostSerializer = modelSerializer(Post, {
  fields: ['id', 'title', 'authorId'] as const,
  readOnlyFields: ['id'] as const,
  nested: { author: AuthorSerializer }
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
router.register(
  '/posts',
  modelViewSet({
    model: Post,
    serializer: PostSerializer,
    pagination: { pageSize: 10 }
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
  await sql`drop table if exists viewset_posts`.execute(db)
  await sql`drop table if exists viewset_authors`.execute(db)
  await sql`drop table if exists viewset_users`.execute(db)
  await sql`
    create table viewset_users (
      id int primary key auto_increment,
      email varchar(255) not null unique,
      age int null,
      name varchar(255) not null
    )
  `.execute(db)
  await sql`
    create table viewset_authors (
      id int primary key auto_increment,
      name varchar(255) not null,
      email varchar(255) not null
    )
  `.execute(db)
  await sql`
    create table viewset_posts (
      id int primary key auto_increment,
      title varchar(255) not null,
      authorId int not null,
      foreign key (authorId) references viewset_authors(id)
    )
  `.execute(db)
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists viewset_posts`.execute(db)
    await sql`drop table if exists viewset_authors`.execute(db)
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

  it('partially updates a row with PATCH without erasing omitted fields', async () => {
    const response = await handle(
      new Request('https://example.test/users/1/', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Ada Updated' })
      })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 1,
      email: 'ada@example.com',
      age: null,
      name: 'Ada Updated'
    })
  })

  it('deletes a row with DELETE and returns 204', async () => {
    const created = await handle(
      new Request('https://example.test/users/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: 'delete@example.com',
          age: 7,
          name: 'Delete Me'
        })
      })
    )
    const createdBody = (await created.json()) as { id: number }

    const response = await handle(
      new Request(`https://example.test/users/${createdBody.id}/`, {
        method: 'DELETE'
      })
    )

    expect(response.status).toBe(204)

    const detail = await handle(
      new Request(`https://example.test/users/${createdBody.id}/`)
    )
    expect(detail.status).toBe(404)
  })
})

describe('ModelViewSet with nested serializers', () => {
  it('serves the full CRUD round-trip with nested output', async () => {
    const ada = await withConnection(db, () =>
      Author.objects.create({ name: 'Ada', email: 'ada@authors.example' })
    )
    const grace = await withConnection(db, () =>
      Author.objects.create({ name: 'Grace', email: 'grace@authors.example' })
    )

    // create: 201 body carries the nested relation; the nested key in the
    // payload is read-only and silently ignored (DRF parity).
    const created = await handle(
      new Request('https://example.test/posts/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: 'Analytical Engine',
          authorId: ada.id,
          author: { name: 'Imposter' }
        })
      })
    )
    expect(created.status).toBe(201)
    const createdBody = (await created.json()) as { id: number }
    expect(createdBody).toEqual({
      id: createdBody.id,
      title: 'Analytical Engine',
      authorId: ada.id,
      author: { id: ada.id, name: 'Ada' }
    })

    // retrieve: nested relation attached.
    const detail = await handle(
      new Request(`https://example.test/posts/${createdBody.id}/`)
    )
    expect(detail.status).toBe(200)
    expect(await detail.json()).toEqual({
      id: createdBody.id,
      title: 'Analytical Engine',
      authorId: ada.id,
      author: { id: ada.id, name: 'Ada' }
    })

    // list (paginated): every row carries its nested relation.
    const list = await handle(new Request('https://example.test/posts/'))
    expect(list.status).toBe(200)
    expect(await list.json()).toEqual({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: createdBody.id,
          title: 'Analytical Engine',
          authorId: ada.id,
          author: { id: ada.id, name: 'Ada' }
        }
      ]
    })

    // partial update: re-pointing the FK refreshes the nested output.
    const updated = await handle(
      new Request(`https://example.test/posts/${createdBody.id}/`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ authorId: grace.id })
      })
    )
    expect(updated.status).toBe(200)
    expect(await updated.json()).toEqual({
      id: createdBody.id,
      title: 'Analytical Engine',
      authorId: grace.id,
      author: { id: grace.id, name: 'Grace' }
    })
  })
})
