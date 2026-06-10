import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  AllowAny,
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

const Post = model('action_posts', {
  id: f.int().primaryKey().autoIncrement(),
  ownerId: f.int(),
  title: f.varchar(255),
  status: f.varchar(20).default('draft')
})

const PostSerializer = modelSerializer(Post, {
  fields: ['id', 'ownerId', 'title', 'status'] as const,
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

const IsOwner: Permission = {
  requiresAuthentication: true,
  hasPermission: (ctx) => ctx.user !== undefined,
  hasObjectPermission: (ctx, obj) =>
    (obj as { ownerId: number }).ownerId === userId(ctx)
}

let db: Kysely<LooseDatabase>

// Multi-tenant style: detail actions resolve the row through the caller's
// scoped queryset, exactly like retrieve/PATCH/DELETE do.
const scopedRouter = createRouter()
scopedRouter.register(
  '/posts',
  modelViewSet({
    model: Post,
    serializer: PostSerializer,
    authentication,
    permissions: [IsAuthenticated],
    queryset: (ctx) => Post.objects.filter({ ownerId: userId(ctx) }),
    actions: [
      {
        name: 'publish',
        method: 'POST',
        path: 'publish',
        detail: true,
        handler: async (ctx, post) => {
          const updated = await Post.objects.update(
            { id: post.id },
            { status: 'published' }
          )
          return Response.json(PostSerializer.serialize(updated))
        }
      },
      {
        name: 'count',
        method: 'GET',
        path: 'count',
        detail: false,
        handler: async (ctx) => {
          const count = await Post.objects
            .filter({ ownerId: userId(ctx) })
            .count()
          return Response.json({ count })
        }
      },
      // Per-action permission override: public on an authenticated viewset.
      {
        name: 'pingPublic',
        method: 'GET',
        path: 'ping',
        detail: false,
        permissions: [AllowAny],
        handler: () => Response.json({ ok: true })
      }
    ]
  })
)

// Object-level permissions gate detail actions through the same pass as
// retrieve/PATCH/DELETE.
const ownerOnlyRouter = createRouter()
ownerOnlyRouter.register(
  '/posts',
  modelViewSet({
    model: Post,
    serializer: PostSerializer,
    authentication,
    permissions: [IsOwner],
    actions: [
      {
        name: 'echo',
        method: 'GET',
        path: 'echo',
        detail: true,
        handler: (ctx, post) =>
          Response.json({ id: post.id, title: post.title })
      }
    ]
  })
)

// Per-action authentication + permissions on an otherwise open viewset.
const openRouter = createRouter()
openRouter.register(
  '/posts',
  modelViewSet({
    model: Post,
    serializer: PostSerializer,
    actions: [
      {
        name: 'whoami',
        method: 'GET',
        path: 'whoami',
        detail: false,
        authentication,
        permissions: [IsAuthenticated],
        handler: (ctx) => Response.json({ userId: userId(ctx) })
      }
    ]
  })
)

function request(router: ReturnType<typeof createRouter>) {
  return (
    path: string,
    token: string | undefined,
    init: RequestInit = {}
  ): Promise<Response> =>
    withConnection(db, () =>
      router.handle(
        new Request(`https://example.test${path}`, {
          ...init,
          headers: {
            ...(token === undefined
              ? {}
              : { authorization: `Bearer ${token}` }),
            'content-type': 'application/json',
            ...init.headers
          }
        })
      )
    )
}

const scoped = request(scopedRouter)
const ownerOnly = request(ownerOnlyRouter)
const open = request(openRouter)

beforeAll(async () => {
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })
  await sql`drop table if exists action_posts`.execute(db)
  await sql`
    create table action_posts (
      id int primary key auto_increment,
      ownerId int not null,
      title varchar(255) not null,
      status varchar(20) not null default 'draft'
    )
  `.execute(db)
  await sql`
    insert into action_posts (id, ownerId, title) values
      (1, 1, 'Alice first'),
      (2, 1, 'Alice second'),
      (3, 2, 'Bob only')
  `.execute(db)
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists action_posts`.execute(db)
    await db.destroy()
  }
})

describe('detail custom actions', () => {
  it('receive the row resolved through the scoped queryset', async () => {
    const response = await ownerOnly('/posts/1/echo/', 'alice')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ id: 1, title: 'Alice first' })
  })

  it('persist writes made by the handler', async () => {
    const response = await scoped('/posts/1/publish/', 'alice', {
      method: 'POST'
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 1,
      ownerId: 1,
      title: 'Alice first',
      status: 'published'
    })

    const detail = await scoped('/posts/1/', 'alice')
    expect(((await detail.json()) as { status: string }).status).toBe(
      'published'
    )
  })

  it('404 for missing rows', async () => {
    const response = await scoped('/posts/999/publish/', 'alice', {
      method: 'POST'
    })
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ detail: 'Not found.' })
  })

  it('404 for out-of-scope rows, not 403 — no information leak', async () => {
    const response = await scoped('/posts/3/publish/', 'alice', {
      method: 'POST'
    })
    expect(response.status).toBe(404)

    const untouched = await ownerOnly('/posts/3/echo/', 'bob')
    expect(untouched.status).toBe(200)
  })

  it('run the object-permission pass before the handler', async () => {
    const foreign = await ownerOnly('/posts/3/echo/', 'alice')
    expect(foreign.status).toBe(403)
    expect(await foreign.json()).toEqual({ detail: 'Permission denied.' })
  })
})

describe('collection custom actions', () => {
  it('run through the viewset auth pipeline without object loading', async () => {
    const response = await scoped('/posts/count/', 'alice')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ count: 2 })

    const unauthenticated = await scoped('/posts/count/', undefined)
    expect(unauthenticated.status).toBe(401)
  })
})

describe('per-action overrides', () => {
  it('action permissions replace viewset permissions', async () => {
    // The viewset requires authentication; the ping action is AllowAny.
    const response = await scoped('/posts/ping/', undefined)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it('action authentication and permissions tighten an open viewset', async () => {
    const unauthenticated = await open('/posts/whoami/', undefined)
    expect(unauthenticated.status).toBe(401)

    const authenticated = await open('/posts/whoami/', 'bob')
    expect(authenticated.status).toBe(200)
    expect(await authenticated.json()).toEqual({ userId: 2 })

    const invalid = await open('/posts/whoami/', 'not-a-user')
    expect(invalid.status).toBe(401)
  })
})
