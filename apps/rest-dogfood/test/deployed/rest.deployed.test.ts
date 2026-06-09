import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import type { StartedDogfoodApp } from '../../../test-support/server.js'
import { jsonRequest, url } from '../../../test-support/http.js'
import { startDogfoodApp } from '../../../test-support/server.js'
import { app } from '../../src/app.js'
import handler from '../../src/handler.js'
import { routes } from '../../src/routes.js'

let started: StartedDogfoodApp | undefined

function appUrl(): string {
  if (started === undefined) {
    throw new Error('Dogfood app was not started.')
  }
  return started.url
}

async function responseObject(response: Response): Promise<Record<string, unknown>> {
  const value: unknown = await response.json()
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected response JSON object.')
  }
  return value as Record<string, unknown>
}

async function responseArray(response: Response): Promise<unknown[]> {
  const value: unknown = await response.json()
  if (!Array.isArray(value)) {
    throw new Error('Expected response JSON array.')
  }
  return value.map((item: unknown) => item)
}

function numericId(body: Record<string, unknown>): number {
  const id = body['id']
  if (typeof id !== 'number') {
    throw new Error('Expected numeric id.')
  }
  return id
}

async function createUser(email: string, name: string, age: number | null = null): Promise<number> {
  const response = await fetch(
    url(appUrl(), '/users/'),
    jsonRequest('POST', { email, name, age })
  )
  expect(response.status).toBe(201)
  return numericId(await responseObject(response))
}

beforeAll(async () => {
  started = await startDogfoodApp({
    app,
    database: process.env.TANGO_DB_NAME ?? 'tango_test',
    routes
  })
})

afterAll(async () => {
  await started?.close()
})

describe('rest dogfood app over deployed-style HTTP', () => {
  it('can start the default exported defineServer handler as a Web handler', async () => {
    const served = await startDogfoodApp({ handler })
    try {
      const response = await fetch(url(served.url, '/health/live/'))
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({ ok: true })
    } finally {
      await served.close()
    }
  })

  it('creates, lists, and retrieves a resource through public viewset APIs', async () => {
    const id = await createUser('ada.rest@example.com', 'Ada Rest', 36)

    const detail = await fetch(url(appUrl(), `/users/${id}/`))
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({
      id,
      email: 'ada.rest@example.com',
      name: 'Ada Rest',
      age: 36,
      isStaff: 0
    })

    const list = await fetch(url(appUrl(), '/users/?pageSize=5'))
    expect(list.status).toBe(200)
    expect(await list.json()).toMatchObject({
      next: null,
      previous: null
    })
  })

  it('returns validation errors over HTTP for invalid input', async () => {
    const response = await fetch(
      url(appUrl(), '/users/'),
      jsonRequest('POST', { email: 'missing-name@example.com' })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      name: ['This field is required.']
    })
  })

  it('does not expose secret account fields in serializer output', async () => {
    const response = await fetch(
      url(appUrl(), '/accounts/'),
      jsonRequest('POST', {
        email: 'secret@example.com',
        displayName: 'Secret Holder',
        passwordHash: 'hash',
        apiKeyHash: 'api-hash'
      })
    )

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      passwordHash: ['Unknown field.'],
      apiKeyHash: ['Unknown field.']
    })
  })

  it('filters and paginates list endpoints using query parameters', async () => {
    await createUser('filter-ada@example.com', 'Ada Filter', 36)
    await createUser('filter-bob@example.com', 'Bob Filter', 17)
    await createUser('filter-grace@example.com', 'Grace Filter', 42)

    const response = await fetch(
      url(appUrl(), '/users/?age__gte=30&name__icontains=filter&pageSize=5')
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      count: 2,
      next: null,
      previous: null
    })
  })

  it('keeps request context isolated across authenticated and anonymous requests', async () => {
    const authed = await fetch(url(appUrl(), '/documents/'), {
      headers: { authorization: 'Bearer owner' }
    })
    expect(authed.status).toBe(200)

    const anonymous = await fetch(url(appUrl(), '/documents/'))
    expect(anonymous.status).toBe(403)
  })

  it.fails('lets static routes take precedence over dynamic detail routes', async () => {
    const response = await fetch(url(appUrl(), '/users/me/'))

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      id: 'me',
      email: 'me@example.com'
    })
  })

  it.fails('uses path parents for nested resource creation instead of requiring duplicated body fields', async () => {
    const userId = await createUser('nested-owner@example.com', 'Nested Owner')
    const projectResponse = await fetch(
      url(appUrl(), '/projects/'),
      jsonRequest('POST', { userId, name: 'Nested Project' })
    )
    expect(projectResponse.status).toBe(201)
    const projectId = numericId(await responseObject(projectResponse))

    const noteResponse = await fetch(
      url(appUrl(), `/users/${userId}/projects/${projectId}/notes/`),
      jsonRequest('POST', { title: 'Scoped Note', body: 'Created through parent path.' })
    )

    expect(noteResponse.status).toBe(201)
    expect(await noteResponse.json()).toMatchObject({
      projectId,
      title: 'Scoped Note'
    })
  })

  it.fails('supports partial updates without erasing omitted fields', async () => {
    const userId = await createUser('patch-user@example.com', 'Before Patch', 21)

    const response = await fetch(
      url(appUrl(), `/users/${userId}/`),
      jsonRequest('PATCH', { name: 'After Patch' })
    )

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      id: userId,
      email: 'patch-user@example.com',
      name: 'After Patch',
      age: 21
    })
  })

  it.fails('supports deleting resources through generated viewsets', async () => {
    const userId = await createUser('delete-user@example.com', 'Delete User')

    const deleted = await fetch(url(appUrl(), `/users/${userId}/`), {
      method: 'DELETE'
    })
    expect(deleted.status).toBe(204)

    const detail = await fetch(url(appUrl(), `/users/${userId}/`))
    expect(detail.status).toBe(404)
  })

  it.fails('stamps tenant-owned rows from request context instead of trusting client tenant fields', async () => {
    const response = await fetch(
      url(appUrl(), '/invoices/'),
      jsonRequest(
        'POST',
        { tenantId: 'evil-tenant', number: 'INV-1', amount: 42 },
        { 'x-tenant-id': 'tenant-a' }
      )
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      tenantId: 'tenant-a',
      number: 'INV-1',
      amount: 42
    })
  })

  it.fails('returns CSV exports with content headers from ORM-backed data', async () => {
    await fetch(
      url(appUrl(), '/orders/'),
      jsonRequest('POST', {
        customerId: 1,
        status: 'paid',
        total: 12.5,
        createdAt: new Date('2026-01-01T00:00:00.000Z')
      })
    )

    const response = await fetch(url(appUrl(), '/orders/export.csv'))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(await response.text()).toContain('paid')
  })

  it('round trips internationalized text over HTTP and MySQL', async () => {
    const response = await fetch(
      url(appUrl(), '/messages/'),
      jsonRequest('POST', { text: 'Olá мир مرحبا 👋' })
    )
    expect(response.status).toBe(201)
    const created = await responseObject(response)

    const detail = await fetch(url(appUrl(), `/messages/${numericId(created)}/`))
    expect(detail.status).toBe(200)
    expect(await detail.json()).toMatchObject({ text: 'Olá мир مرحبا 👋' })
  })

  it('rejects maliciously shaped search payloads without parser crashes', async () => {
    const response = await fetch(
      url(appUrl(), '/messages/search/'),
      jsonRequest('POST', { ['__proto__']: { polluted: true }, term: 'hello' })
    )

    expect(response.status).toBe(200)
    expect(await responseArray(response)).toEqual([])
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false)
  })

  it('exposes liveness and readiness over HTTP', async () => {
    const live = await fetch(url(appUrl(), '/health/live/'))
    expect(live.status).toBe(200)
    expect(await live.json()).toEqual({ ok: true })

    const ready = await fetch(url(appUrl(), '/health/ready/'))
    expect(ready.status).toBe(200)
    expect(await ready.json()).toEqual({ ok: true, database: 'ready' })
  })
})
