import { describe, expect, it } from 'vitest'

import type { Authentication } from '@tango-ts/auth'
import { f, model } from '@tango-ts/orm'

import { adminModel, adminRouter, humanize, type AdminMetaDocument } from '../src/index.js'

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
