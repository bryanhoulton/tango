import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { jsonRequest, url } from '../../../test-support/http.js'
import type { StartedDogfoodApp } from '../../../test-support/server.js'
import { startDogfoodApp } from '../../../test-support/server.js'
import { app } from '../../src/app.js'
import { routes } from '../../src/routes.js'

let started: StartedDogfoodApp | undefined

function appUrl(): string {
  if (started === undefined) {
    throw new Error('Dogfood app was not started.')
  }
  return started.url
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

describe('HTTP contract dogfood scenarios', () => {
  it.fails('rejects JSON-looking requests with unsupported content types', async () => {
    const response = await fetch(url(appUrl(), '/users/'), {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: JSON.stringify({
        email: 'text-json@example.com',
        name: 'Text JSON',
        age: 30
      })
    })

    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({ detail: 'Unsupported media type.' })
  })

  it.fails('handles browser CORS preflight for configured REST resources', async () => {
    const response = await fetch(url(appUrl(), '/users/'), {
      method: 'OPTIONS',
      headers: {
        origin: 'https://client.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type, authorization'
      }
    })

    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-origin')).toBe('https://client.example')
    expect(response.headers.get('access-control-allow-methods')).toContain('POST')
  })

  it.fails('supports HEAD requests for resource collections without sending a body', async () => {
    const response = await fetch(url(appUrl(), '/users/'), { method: 'HEAD' })

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
  })

  it.fails('rejects unsupported query parameters instead of silently ignoring client bugs', async () => {
    const response = await fetch(url(appUrl(), '/users/?unknown=value'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      unknown: ['Unsupported query parameter.']
    })
  })

  it.fails('rejects unsupported ordering fields with a field-level error', async () => {
    const response = await fetch(url(appUrl(), '/orders/?ordering=deletedAt'))

    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      ordering: ['Unsupported ordering field.']
    })
  })

  it.fails('serves generated OpenAPI that matches deployed routes', async () => {
    const response = await fetch(url(appUrl(), '/openapi.json'))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      openapi: '3.1.0',
      paths: {
        '/users/': {},
        '/users/{id}/': {},
        '/accounts/': {}
      }
    })
  })

  it.fails('accepts multipart uploads through a public file field abstraction', async () => {
    const body = new FormData()
    body.set('avatar', new File(['avatar'], 'avatar.png', { type: 'image/png' }))

    const response = await fetch(url(appUrl(), '/profiles/1/avatar/'), {
      method: 'POST',
      body
    })

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      filename: 'avatar.png',
      contentType: 'image/png'
    })
  })

  it.fails('applies route-level rate limits across requests', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await fetch(
        url(appUrl(), '/sessions/'),
        jsonRequest('POST', { email: 'rate@example.com', password: 'bad-password' })
      )
    }

    const response = await fetch(
      url(appUrl(), '/sessions/'),
      jsonRequest('POST', { email: 'rate@example.com', password: 'bad-password' })
    )

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).not.toBeNull()
  })
})
