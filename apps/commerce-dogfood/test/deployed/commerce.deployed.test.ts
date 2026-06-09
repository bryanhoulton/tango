import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { jsonRequest, url } from '../../../test-support/http.js'
import type { StartedDogfoodApp } from '../../../test-support/server.js'
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

function numericId(body: Record<string, unknown>): number {
  const id = body['id']
  if (typeof id !== 'number') {
    throw new Error('Expected numeric id.')
  }
  return id
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

describe('commerce dogfood app over deployed-style HTTP', () => {
  it('can start the default exported defineServer handler as a Web handler', async () => {
    const served = await startDogfoodApp({ handler })
    try {
      const response = await fetch(url(served.url, '/inventory/'))
      expect(response.status).toBe(200)
    } finally {
      await served.close()
    }
  })

  it('creates inventory through the public CRUD surface', async () => {
    const response = await fetch(
      url(appUrl(), '/inventory/'),
      jsonRequest('POST', { sku: 'SKU-CRUD', quantity: 5 })
    )

    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({
      sku: 'SKU-CRUD',
      quantity: 5
    })
  })

  it.fails('supports atomic inventory reserve actions without app-level SQL workarounds', async () => {
    await fetch(url(appUrl(), '/inventory/'), jsonRequest('POST', { sku: 'SKU-RESERVE', quantity: 1 }))

    const first = await fetch(url(appUrl(), '/inventory/SKU-RESERVE/reserve/'), {
      method: 'POST'
    })
    expect(first.status).toBe(200)
    expect(await first.json()).toMatchObject({ sku: 'SKU-RESERVE', quantity: 0 })

    const second = await fetch(url(appUrl(), '/inventory/SKU-RESERVE/reserve/'), {
      method: 'POST'
    })
    expect(second.status).toBe(409)
    expect(await second.json()).toEqual({ detail: 'Insufficient inventory.' })
  })

  it.fails('supports checkout as a transaction across orders, inventory, and payments', async () => {
    const customerResponse = await fetch(
      url(appUrl(), '/customers/'),
      jsonRequest('POST', { email: 'checkout@example.com', name: 'Checkout Customer' })
    )
    expect(customerResponse.status).toBe(201)
    const customerId = numericId(await responseObject(customerResponse))

    await fetch(
      url(appUrl(), '/inventory/'),
      jsonRequest('POST', { sku: 'SKU-CHECKOUT', quantity: 2 })
    )

    const checkout = await fetch(
      url(appUrl(), '/checkout/'),
      jsonRequest(
        'POST',
        {
          customerId,
          items: [{ sku: 'SKU-CHECKOUT', quantity: 1 }],
          payment: { amount: 10 }
        },
        { 'idempotency-key': 'checkout-1' }
      )
    )

    expect(checkout.status).toBe(201)
    expect(await checkout.json()).toMatchObject({
      status: 'paid',
      total: 10
    })
  })

  it.fails('enforces idempotency keys for unsafe payment creation', async () => {
    const customerResponse = await fetch(
      url(appUrl(), '/customers/'),
      jsonRequest('POST', { email: 'payment@example.com', name: 'Payment Customer' })
    )
    expect(customerResponse.status).toBe(201)
    const customerId = numericId(await responseObject(customerResponse))

    const orderResponse = await fetch(
      url(appUrl(), '/orders/'),
      jsonRequest('POST', { customerId, total: 20 })
    )
    expect(orderResponse.status).toBe(201)
    const orderId = numericId(await responseObject(orderResponse))

    const first = await fetch(
      url(appUrl(), '/payments/'),
      jsonRequest(
        'POST',
        { orderId, idempotencyKey: 'pay-1', amount: 20 },
        { 'idempotency-key': 'pay-1' }
      )
    )
    expect(first.status).toBe(201)

    const second = await fetch(
      url(appUrl(), '/payments/'),
      jsonRequest(
        'POST',
        { orderId, idempotencyKey: 'pay-1', amount: 20 },
        { 'idempotency-key': 'pay-1' }
      )
    )
    expect(second.status).toBe(200)
    expect(await second.json()).toEqual(await first.json())
  })
})
