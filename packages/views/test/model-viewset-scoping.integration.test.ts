import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  BearerTokenAuthentication,
  IsAuthenticated,
  type AuthenticatedUser,
  type Permission
} from '@tango-ts/auth'
import type { RequestContext } from '@tango-ts/http'
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

const Post = model('scoping_posts', {
  id: f.int().primaryKey().autoIncrement(),
  ownerId: f.int(),
  title: f.varchar(255)
})

const PostSerializer = modelSerializer(Post, {
  fields: ['id', 'ownerId', 'title'] as const,
  readOnlyFields: ['id'] as const
})

// alice owns posts 1 and 2; bob owns post 3.
const USERS: Record<string, AuthenticatedUser> = {
  alice: { id: 1 },
  bob: { id: 2 }
}

const authentication = [
  new BearerTokenAuthentication({ verifyToken: (token) => USERS[token] })
]

function userId(ctx: RequestContext): number {
  return (ctx.user as AuthenticatedUser).id as number
}

let db: Kysely<LooseDatabase>

// Multi-tenant style: every action sees only the caller's rows.
const scopedRouter = createRouter()
scopedRouter.register(
  '/posts',
  modelViewSet({
    model: Post,
    serializer: PostSerializer,
    authentication,
    permissions: [IsAuthenticated],
    queryset: (ctx) => Post.objects.filter({ ownerId: userId(ctx) }),
    filters: ['title__icontains'] as const,
    pagination: { pageSize: 10 }
  })
)

// IsOwnerOrReadOnly style: anyone may read, only the owner may write.
const ownerWriteRouter = createRouter()
ownerWriteRouter.register(
  '/posts',
  modelViewSet({
    model: Post,
    serializer: PostSerializer,
    authentication,
    permissions: [IsAuthenticated],
    objectPermission: (ctx, post) =>
      ctx.request.method === 'GET' || post.ownerId === userId(ctx)
  })
)

// Same rule expressed as a DRF-style permission class with hasObjectPermission.
const IsOwner: Permission = {
  requiresAuthentication: true,
  hasPermission: (ctx) => ctx.user !== undefined,
  hasObjectPermission: (ctx, obj) =>
    (obj as { ownerId: number }).ownerId === userId(ctx)
}

const ownerOnlyRouter = createRouter()
ownerOnlyRouter.register(
  '/posts',
  modelViewSet({
    model: Post,
    serializer: PostSerializer,
    authentication,
    permissions: [IsOwner]
  })
)

function request(router: ReturnType<typeof createRouter>) {
  return (path: string, token: string, init: RequestInit = {}): Promise<Response> =>
    withConnection(db, () =>
      router.handle(
        new Request(`https://example.test${path}`, {
          ...init,
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
            ...init.headers
          }
        })
      )
    )
}

const scoped = request(scopedRouter)
const ownerWrite = request(ownerWriteRouter)
const ownerOnly = request(ownerOnlyRouter)

beforeAll(async () => {
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })
  await sql`drop table if exists scoping_posts`.execute(db)
  await sql`
    create table scoping_posts (
      id int primary key auto_increment,
      ownerId int not null,
      title varchar(255) not null
    )
  `.execute(db)
  await sql`
    insert into scoping_posts (id, ownerId, title) values
      (1, 1, 'Alice first'),
      (2, 1, 'Alice second'),
      (3, 2, 'Bob only')
  `.execute(db)
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists scoping_posts`.execute(db)
    await db.destroy()
  }
})

describe('queryset scoping', () => {
  it('list returns only rows in the caller scope, with an accurate count', async () => {
    const response = await scoped('/posts/', 'alice')
    expect(response.status).toBe(200)
    const body = (await response.json()) as { count: number; results: { id: number }[] }
    expect(body.count).toBe(2)
    expect(body.results.map((row) => row.id)).toEqual([1, 2])
  })

  it('request filters compose on top of the scope, never widening it', async () => {
    // 'only' matches Bob's post, but Bob's post is outside Alice's scope.
    const response = await scoped('/posts/?title__icontains=only', 'alice')
    const body = (await response.json()) as { count: number }
    expect(body.count).toBe(0)
  })

  it('retrieve of an out-of-scope row is a 404, not a 403', async () => {
    const own = await scoped('/posts/1/', 'alice')
    expect(own.status).toBe(200)

    // Out-of-scope rows do not exist for the caller — no information leak.
    const foreign = await scoped('/posts/3/', 'alice')
    expect(foreign.status).toBe(404)
    expect(await foreign.json()).toEqual({ detail: 'Not found.' })
  })

  it('patch and delete cannot touch out-of-scope rows', async () => {
    const patch = await scoped('/posts/3/', 'alice', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'hijacked' })
    })
    expect(patch.status).toBe(404)

    const destroy = await scoped('/posts/3/', 'alice', { method: 'DELETE' })
    expect(destroy.status).toBe(404)

    const untouched = await ownerWrite('/posts/3/', 'bob')
    expect(untouched.status).toBe(200)
    expect(await untouched.json()).toEqual({ id: 3, ownerId: 2, title: 'Bob only' })
  })
})

describe('object-level permissions', () => {
  it('objectPermission allows reads but blocks writes by non-owners with 403', async () => {
    const read = await ownerWrite('/posts/3/', 'alice')
    expect(read.status).toBe(200)

    const patch = await ownerWrite('/posts/3/', 'alice', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'hijacked' })
    })
    expect(patch.status).toBe(403)
    expect(await patch.json()).toEqual({ detail: 'Permission denied.' })

    const destroy = await ownerWrite('/posts/3/', 'alice', { method: 'DELETE' })
    expect(destroy.status).toBe(403)
  })

  it('owners pass the object permission and writes persist', async () => {
    const patch = await ownerWrite('/posts/2/', 'alice', {
      method: 'PATCH',
      body: JSON.stringify({ title: 'Alice updated' })
    })
    expect(patch.status).toBe(200)
    expect(await patch.json()).toEqual({ id: 2, ownerId: 1, title: 'Alice updated' })
  })

  it('permission classes with hasObjectPermission gate detail actions', async () => {
    const own = await ownerOnly('/posts/1/', 'alice')
    expect(own.status).toBe(200)

    const foreign = await ownerOnly('/posts/3/', 'alice')
    expect(foreign.status).toBe(403)
  })

  it('object permissions never run for unauthenticated callers', async () => {
    const response = await ownerOnly('/posts/1/', 'not-a-user')
    expect(response.status).toBe(401)
  })

  it('owner delete succeeds end to end', async () => {
    const destroy = await ownerWrite('/posts/2/', 'alice', { method: 'DELETE' })
    expect(destroy.status).toBe(204)

    const gone = await ownerWrite('/posts/2/', 'alice')
    expect(gone.status).toBe(404)
  })
})
