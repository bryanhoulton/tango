import { describe, expect, it } from 'vitest'

import type { Authentication } from '@tango-ts/auth'
import {
  defineFunction,
  withFunctionRuntime,
  type FunctionRuntime
} from '@tango-ts/functions'
import { f, model } from '@tango-ts/orm'
import { createRouter } from '@tango-ts/router'
import { defineApp, type TangoProject } from '@tango-ts/server'

import {
  addAdminRoutes,
  adminModel,
  adminRouter,
  humanize,
  type AdminMetaDocument
} from '../src/index.js'

// The production shape: two related models registered with the admin, exactly
// as a project would in `addAdminRoutes`. The fake authentication below stands
// in for the contrib-auth token model so this suite needs no database — the
// real token path is covered by the integration suite.
const Author = model('authors', {
  id: f.int().primaryKey().autoIncrement(),
  name: f.varchar(120),
  bio: f.text().nullable()
})

const Post = model('posts', {
  id: f.int().primaryKey().autoIncrement(),
  title: f.varchar(255),
  body: f.text(),
  status: f.varchar(20).choices(['draft', 'published']).default('draft'),
  published: f.boolean().default(false),
  authorId: f.foreignKey(() => Author, 'id', { dbConstraint: false }),
  createdAt: f.datetime().autoNowAdd()
})

/** Header-driven authentication: `x-test-user: {"id":1,"isStaff":true}`. */
const headerAuthentication: Authentication = {
  authenticate: (ctx) => {
    const header = ctx.request.headers.get('x-test-user')
    return header === null
      ? undefined
      : (JSON.parse(header) as Record<string, unknown>)
  }
}

const router = adminRouter({
  title: 'Test Admin',
  models: [
    adminModel(Author),
    adminModel(Post, {
      searchFields: ['title'],
      listFilters: ['published'],
      listDisplay: ['id', 'title', 'published']
    })
  ],
  authentication: [headerAuthentication]
})

function request(path: string, user?: Record<string, unknown>): Request {
  return new Request(`https://example.test${path}`, {
    headers: user === undefined ? {} : { 'x-test-user': JSON.stringify(user) }
  })
}

const staff = { id: 1, email: 'admin@example.com', isStaff: true }

async function fetchMeta(): Promise<AdminMetaDocument> {
  const response = await router.handle(request('/meta/', staff))
  expect(response.status).toBe(200)
  return (await response.json()) as AdminMetaDocument
}

describe('admin meta endpoint', () => {
  it('rejects unauthenticated requests', async () => {
    const response = await router.handle(request('/meta/'))
    expect(response.status).toBe(401)
  })

  it('rejects authenticated non-staff users', async () => {
    const response = await router.handle(
      request('/meta/', { id: 2, isStaff: false })
    )
    expect(response.status).toBe(403)
  })

  it('describes registered models for staff', async () => {
    const meta = await fetchMeta()
    expect(meta.version).toBe(1)
    expect(meta.site.title).toBe('Test Admin')
    expect(meta.auth.loginPath).toBe('/admin/api/auth/login/')
    expect(meta.models.map((m) => m.name)).toEqual(['authors', 'posts'])

    const posts = meta.models[1]
    expect(posts?.apiPath).toBe('/admin/api/posts/')
    expect(posts?.pk).toBe('id')
    expect(posts?.label).toBe('Posts')
    expect(posts?.singularLabel).toBe('Post')
    expect(posts?.listDisplay).toEqual(['id', 'title', 'published'])
    expect(posts?.searchFields).toEqual(['title'])
    expect(posts?.filters).toEqual(['published'])
    expect(posts?.ordering).toEqual(['id'])
  })

  it('derives field metadata from the model', async () => {
    const meta = await fetchMeta()
    const posts = meta.models[1]
    const byName = new Map(posts?.fields.map((field) => [field.name, field]))

    // Auto-managed fields are read-only and never required.
    expect(byName.get('id')).toMatchObject({ readOnly: true, required: false })
    expect(byName.get('createdAt')).toMatchObject({
      type: 'datetime',
      readOnly: true,
      required: false
    })
    // Plain required column.
    expect(byName.get('title')).toMatchObject({
      type: 'varchar',
      maxLength: 255,
      readOnly: false,
      required: true,
      label: 'Title'
    })
    // Defaulted column is writable but not required.
    expect(byName.get('published')).toMatchObject({
      type: 'boolean',
      required: false,
      hasDefault: true
    })
    // Choice fields surface their allowed values so the UI renders selects.
    expect(byName.get('status')).toMatchObject({
      type: 'varchar',
      choices: ['draft', 'published'],
      hasDefault: true
    })
    // Non-choice fields omit the key entirely.
    expect(byName.get('title')?.choices).toBeUndefined()
  })

  it('resolves foreign keys to registered admin models', async () => {
    const meta = await fetchMeta()
    const posts = meta.models[1]
    const authorId = posts?.fields.find((field) => field.name === 'authorId')
    expect(authorId?.relation).toEqual({
      table: 'authors',
      column: 'id',
      apiPath: '/admin/api/authors/',
      displayField: 'name'
    })
  })
})

describe('admin app grouping', () => {
  it('omits app when no model declares one', async () => {
    const meta = await fetchMeta()
    expect(meta.models.every((m) => m.app === undefined)).toBe(true)
  })

  it('serializes an explicit app option as a humanized label', async () => {
    const grouped = adminRouter({
      models: [adminModel(Post, { app: 'blog_content' })],
      authentication: [headerAuthentication]
    })
    const response = await grouped.handle(request('/meta/', staff))
    const meta = (await response.json()) as AdminMetaDocument
    expect(meta.models[0]?.app).toBe('Blog content')
  })

  it('derives apps from the project app registry in addAdminRoutes', async () => {
    // The production wiring: project apps own models, and `addAdminRoutes`
    // matches registered admin models against them. Posts override the
    // derived app; Authors inherit `blog`; the unowned model stays ungrouped.
    const Orphan = model('orphans', {
      id: f.int().primaryKey().autoIncrement()
    })
    const routes = createRouter()
    const project = {
      name: 'grouping',
      routes,
      apps: [defineApp({ name: 'blog', models: [Author, Post] })]
    } as unknown as TangoProject

    addAdminRoutes(project, {
      models: [
        adminModel(Author),
        adminModel(Post, { app: 'publishing' }),
        adminModel(Orphan)
      ],
      authentication: [headerAuthentication]
    })

    const response = await routes.handle(request('/admin/api/meta/', staff))
    expect(response.status).toBe(200)
    const meta = (await response.json()) as AdminMetaDocument
    expect(meta.models.map((m) => [m.name, m.app])).toEqual([
      ['authors', 'Blog'],
      ['posts', 'Publishing'],
      ['orphans', undefined]
    ])
  })
})

describe('admin functions', () => {
  const sendDigest = defineFunction({
    name: 'send_digest',
    handler: (payload: { readonly to: string }) =>
      Promise.resolve({ sent: true, to: payload.to })
  })
  const explode = defineFunction({
    name: 'explode',
    handler: (): Promise<never> => Promise.reject(new Error('boom'))
  })

  const fnRouter = adminRouter({
    models: [],
    functions: [
      { app: 'blog', fn: sendDigest },
      { app: 'blog', fn: explode }
    ],
    authentication: [headerAuthentication]
  })

  // Stands in for the project-wired runtime; the admin endpoint goes through
  // `getFunctionRuntime().invoke`, so the configured transport applies.
  const runtime: FunctionRuntime = {
    invoke: (fn, payload) => fn.run(payload),
    defer: () => undefined,
    drain: () => Promise.resolve()
  }

  function invoke(
    path: string,
    body: string | undefined,
    user?: Record<string, unknown>
  ): Promise<Response> {
    return withFunctionRuntime(runtime, () =>
      fnRouter.handle(
        new Request(`https://example.test${path}`, {
          method: 'POST',
          headers: user === undefined ? {} : { 'x-test-user': JSON.stringify(user) },
          body
        })
      )
    )
  }

  it('describes functions in the meta document', async () => {
    const response = await fnRouter.handle(request('/meta/', staff))
    const meta = (await response.json()) as AdminMetaDocument
    expect(meta.functions).toEqual([
      {
        name: 'send_digest',
        app: 'blog',
        label: 'Send digest',
        appLabel: 'Blog',
        apiPath: '/admin/api/functions/blog/send_digest/'
      },
      {
        name: 'explode',
        app: 'blog',
        label: 'Explode',
        appLabel: 'Blog',
        apiPath: '/admin/api/functions/blog/explode/'
      }
    ])
  })

  it('gates invocation behind the admin pipeline', async () => {
    const anonymous = await invoke('/functions/blog/send_digest/', undefined)
    expect(anonymous.status).toBe(401)
    const nonStaff = await invoke('/functions/blog/send_digest/', undefined, {
      id: 2,
      isStaff: false
    })
    expect(nonStaff.status).toBe(403)
  })

  it('runs a function with the posted payload', async () => {
    const response = await invoke(
      '/functions/blog/send_digest/',
      JSON.stringify({ payload: { to: 'ada@example.com' } }),
      staff
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      result: { sent: true, to: 'ada@example.com' }
    })
  })

  it('rejects unknown functions and malformed bodies', async () => {
    const unknown = await invoke('/functions/blog/missing/', undefined, staff)
    expect(unknown.status).toBe(404)
    const malformed = await invoke(
      '/functions/blog/send_digest/',
      'not json',
      staff
    )
    expect(malformed.status).toBe(400)
  })

  it('surfaces function failures as a 500 with the error message', async () => {
    const response = await invoke('/functions/blog/explode/', undefined, staff)
    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ detail: 'boom' })
  })

  it('derives admin functions from the project apps in addAdminRoutes', async () => {
    const routes = createRouter()
    const project = {
      name: 'fn-derivation',
      routes,
      apps: [
        defineApp({ name: 'blog', models: [], functions: [sendDigest] })
      ]
    } as unknown as TangoProject

    addAdminRoutes(project, {
      models: [],
      authentication: [headerAuthentication]
    })

    const response = await routes.handle(request('/admin/api/meta/', staff))
    const meta = (await response.json()) as AdminMetaDocument
    expect(meta.functions.map((fn) => [fn.app, fn.name])).toEqual([
      ['blog', 'send_digest']
    ])
  })
})

describe('admin auth surface', () => {
  it('serves the authenticated user on /auth/me/', async () => {
    const response = await router.handle(request('/auth/me/', staff))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      email: 'admin@example.com'
    })
  })

  it('gates every model viewset with the admin pipeline', async () => {
    const anonymous = await router.handle(request('/posts/'))
    expect(anonymous.status).toBe(401)
    const nonStaff = await router.handle(
      request('/posts/', { id: 2, isStaff: false })
    )
    expect(nonStaff.status).toBe(403)
  })
})

describe('humanize', () => {
  it('converts camelCase and snake_case to verbose labels', () => {
    expect(humanize('firstName')).toBe('First name')
    expect(humanize('auth_users')).toBe('Auth users')
    expect(humanize('title')).toBe('Title')
  })
})
