import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// Relative import: the vitest alias for @tango-ts/contrib-auth points at the
// package root entry, which does not cover the `/app` subpath export.
import { app } from '../../contrib-auth/src/app.js'
import { createSuperuser, createUser, User } from '@tango-ts/contrib-auth'
import { migrateApp } from '@tango-ts/cli'
import {
  createMysqlConnection,
  f,
  model,
  withConnection,
  type LooseDatabase
} from '@tango-ts/orm'
import type { Router } from '@tango-ts/router'

import { adminModel, adminRouter, type AdminMetaDocument } from '../src/index.js'

let db: Kysely<LooseDatabase>

// Fast hashing for tests only — production uses the Django-parity default.
const HASHING = { iterations: 1_000 }

// The production wiring this suite exercises: the admin API registered over a
// project model plus the built-in User model, authenticated by the
// contrib-auth token model — exactly what `addAdminRoutes` mounts.
const Post = model('admin_test_posts', {
  id: f.int().primaryKey().autoIncrement(),
  title: f.varchar(255),
  body: f.text(),
  published: f.boolean().default(false),
  authorId: f.foreignKey(() => User, 'id', { dbConstraint: false })
})

const router = adminRouter({
  title: 'Integration Admin',
  models: [
    adminModel(Post, {
      searchFields: ['title'],
      listFilters: ['published'],
      ordering: ['id']
    }),
    adminModel(User, {
      fields: ['id', 'email', 'firstName', 'lastName', 'isActive', 'isStaff'],
      searchFields: ['email']
    })
  ],
  hashing: HASHING,
  pagination: { pageSize: 2, maxPageSize: 10 }
})

function handle(request: Request, routes: Router = router): Promise<Response> {
  return withConnection(db, () => routes.handle(request))
}

function jsonRequest(
  url: string,
  body: unknown,
  options: { method?: string; token?: string } = {}
): Request {
  return new Request(url, {
    method: options.method ?? 'POST',
    headers: {
      'content-type': 'application/json',
      ...(options.token === undefined
        ? {}
        : { authorization: `Bearer ${options.token}` })
    },
    body: JSON.stringify(body)
  })
}

function getRequest(url: string, token?: string): Request {
  return new Request(url, {
    headers:
      token === undefined ? {} : { authorization: `Bearer ${token}` }
  })
}

async function login(email: string, password: string): Promise<Response> {
  return handle(
    jsonRequest('https://example.test/auth/login/', { email, password })
  )
}

beforeAll(async () => {
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })
  await sql`drop table if exists admin_test_posts`.execute(db)
  await sql`drop table if exists auth_tokens`.execute(db)
  await sql`drop table if exists auth_users`.execute(db)
  await sql`
    delete from tango_migrations where name like 'auth.%'
  `.execute(db).catch(() => undefined)

  await migrateApp({ app, db })
  await sql`
    create table admin_test_posts (
      id int not null auto_increment primary key,
      title varchar(255) not null,
      body text not null,
      published tinyint(1) not null default 0,
      authorId int not null
    )
  `.execute(db)

  await withConnection(db, async () => {
    await createSuperuser({
      email: 'admin@example.com',
      password: 'admin-pass-123',
      hashing: HASHING
    })
    await createUser({
      email: 'ada@example.com',
      password: 'ada-pass-123',
      hashing: HASHING
    })
  })
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists admin_test_posts`.execute(db)
    await sql`drop table if exists auth_tokens`.execute(db)
    await sql`drop table if exists auth_users`.execute(db)
    await sql`
      delete from tango_migrations where name like 'auth.%'
    `.execute(db).catch(() => undefined)
    await db.destroy()
  }
})

describe('admin login', () => {
  it('rejects non-staff users with the bad-credentials message', async () => {
    const response = await login('ada@example.com', 'ada-pass-123')
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      detail: 'Unable to log in with provided credentials.'
    })
  })

  it('rejects wrong passwords', async () => {
    const response = await login('admin@example.com', 'wrong')
    expect(response.status).toBe(400)
  })

  it('issues a token to staff users', async () => {
    const response = await login('admin@example.com', 'admin-pass-123')
    expect(response.status).toBe(200)
    const body = (await response.json()) as {
      token: string
      user: { email: string; isSuperuser: boolean }
    }
    expect(body.token.startsWith('tango_')).toBe(true)
    expect(body.user).toMatchObject({
      email: 'admin@example.com',
      isSuperuser: true
    })
  })
})

describe('admin API with a real token', () => {
  let token: string

  beforeAll(async () => {
    const response = await login('admin@example.com', 'admin-pass-123')
    token = ((await response.json()) as { token: string }).token
  })

  it('serves the meta document to staff and 401s anonymous callers', async () => {
    const anonymous = await handle(getRequest('https://example.test/meta/'))
    expect(anonymous.status).toBe(401)

    const response = await handle(getRequest('https://example.test/meta/', token))
    expect(response.status).toBe(200)
    const meta = (await response.json()) as AdminMetaDocument
    expect(meta.models.map((m) => m.name)).toEqual([
      'admin_test_posts',
      'auth_users'
    ])
    const posts = meta.models[0]
    expect(posts?.fields.find((field) => field.name === 'authorId')?.relation)
      .toMatchObject({ table: 'auth_users', apiPath: '/admin/api/auth_users/' })
  })

  it('runs the full CRUD lifecycle through admin viewsets', async () => {
    const adminUser = await withConnection(db, () =>
      User.objects.get({ email: 'admin@example.com' })
    )

    // Create.
    const created = await handle(
      jsonRequest(
        'https://example.test/admin_test_posts/',
        { title: 'Hello admin', body: 'First post.', authorId: adminUser.id },
        { token }
      )
    )
    expect(created.status).toBe(201)
    const post = (await created.json()) as { id: number; published: boolean }
    expect(post.published).toBe(false)

    // List: paginated envelope.
    const list = await handle(
      getRequest('https://example.test/admin_test_posts/', token)
    )
    expect(list.status).toBe(200)
    const page = (await list.json()) as { count: number; results: unknown[] }
    expect(page.count).toBe(1)
    expect(page.results).toHaveLength(1)

    // Search via the icontains filter the admin generates for searchFields.
    const hit = await handle(
      getRequest(
        'https://example.test/admin_test_posts/?title__icontains=hello',
        token
      )
    )
    expect(((await hit.json()) as { count: number }).count).toBe(1)
    const miss = await handle(
      getRequest(
        'https://example.test/admin_test_posts/?title__icontains=nomatch',
        token
      )
    )
    expect(((await miss.json()) as { count: number }).count).toBe(0)

    // Patch.
    const patched = await handle(
      jsonRequest(
        `https://example.test/admin_test_posts/${post.id}/`,
        { published: true },
        { method: 'PATCH', token }
      )
    )
    expect(patched.status).toBe(200)
    await expect(patched.json()).resolves.toMatchObject({ published: true })

    // Filter from listFilters.
    const filtered = await handle(
      getRequest('https://example.test/admin_test_posts/?published=true', token)
    )
    expect(((await filtered.json()) as { count: number }).count).toBe(1)

    // Delete.
    const deleted = await handle(
      new Request(`https://example.test/admin_test_posts/${post.id}/`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` }
      })
    )
    expect(deleted.status).toBe(204)
    const afterDelete = await handle(
      getRequest('https://example.test/admin_test_posts/', token)
    )
    expect(((await afterDelete.json()) as { count: number }).count).toBe(0)
  })

  it('rejects writes to read-only fields with a validation error', async () => {
    const adminUser = await withConnection(db, () =>
      User.objects.get({ email: 'admin@example.com' })
    )
    const created = await handle(
      jsonRequest(
        'https://example.test/admin_test_posts/',
        {
          id: 999,
          title: 'Tries to set the pk',
          body: '.',
          authorId: adminUser.id
        },
        { token }
      )
    )
    // Serializers are strict: read-only fields in the payload are a 400, not
    // silently dropped. The admin UI never sends them.
    expect(created.status).toBe(400)
    const errors = (await created.json()) as Record<string, string[]>
    expect(Object.keys(errors)).toContain('id')
  })

  it('revoking the token via logout locks the admin out', async () => {
    const response = await login('admin@example.com', 'admin-pass-123')
    const fresh = ((await response.json()) as { token: string }).token

    const logout = await handle(
      new Request('https://example.test/auth/logout/', {
        method: 'POST',
        headers: { authorization: `Bearer ${fresh}` }
      })
    )
    expect(logout.status).toBe(204)

    const afterLogout = await handle(
      getRequest('https://example.test/meta/', fresh)
    )
    expect(afterLogout.status).toBe(401)
  })
})
