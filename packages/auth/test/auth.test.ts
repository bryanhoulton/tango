import { describe, expect, it } from 'vitest'

import { createRequestContext } from '@tango-ts/http'

import {
  AllowAny,
  apiView,
  AuthenticationFailed,
  BearerTokenAuthentication,
  IsAdminUser,
  IsAuthenticated,
  TokenAuthentication
} from '../src/index.js'

function ctx(headers: HeadersInit = {}) {
  return createRequestContext(new Request('https://example.test/', { headers }), {})
}

describe('authentication classes', () => {
  it('BearerTokenAuthentication returns undefined when the header is absent', async () => {
    const auth = new BearerTokenAuthentication({
      verifyToken: () => ({ id: 1 })
    })

    await expect(auth.authenticate(ctx())).resolves.toBeUndefined()
  })

  it('BearerTokenAuthentication verifies a bearer token', async () => {
    const auth = new BearerTokenAuthentication({
      verifyToken: (token) =>
        token === 'abc' ? { id: 1, isStaff: true } : undefined
    })

    await expect(
      auth.authenticate(ctx({ authorization: 'Bearer abc' }))
    ).resolves.toEqual({ id: 1, isStaff: true })
  })

  it('BearerTokenAuthentication rejects malformed bearer headers', async () => {
    const auth = new BearerTokenAuthentication({
      verifyToken: () => undefined
    })

    await expect(
      auth.authenticate(ctx({ authorization: 'Bearer' }))
    ).rejects.toBeInstanceOf(AuthenticationFailed)
  })

  it('TokenAuthentication supports DRF Token headers', async () => {
    const auth = new TokenAuthentication({
      verifyToken: (token) => (token === 'secret' ? { id: 'user-1' } : undefined)
    })

    await expect(
      auth.authenticate(ctx({ authorization: 'Token secret' }))
    ).resolves.toEqual({ id: 'user-1' })
  })
})

describe('permission classes', () => {
  it('AllowAny allows every request', async () => {
    await expect(Promise.resolve(AllowAny.hasPermission(ctx()))).resolves.toBe(true)
  })

  it('IsAuthenticated requires ctx.user', async () => {
    await expect(Promise.resolve(IsAuthenticated.hasPermission(ctx()))).resolves.toBe(
      false
    )
    await expect(
      Promise.resolve(IsAuthenticated.hasPermission({ ...ctx(), user: { id: 1 } }))
    ).resolves.toBe(true)
  })

  it('IsAdminUser accepts staff or superuser flags', async () => {
    await expect(
      Promise.resolve(IsAdminUser.hasPermission({ ...ctx(), user: { id: 1 } }))
    ).resolves.toBe(false)
    await expect(
      Promise.resolve(
        IsAdminUser.hasPermission({ ...ctx(), user: { id: 1, isStaff: true } })
      )
    ).resolves.toBe(true)
    await expect(
      Promise.resolve(
        IsAdminUser.hasPermission({ ...ctx(), user: { id: 1, isSuperuser: true } })
      )
    ).resolves.toBe(true)
  })
})

describe('apiView (plain-route auth pipeline)', () => {
  const auth = new BearerTokenAuthentication({
    verifyToken: (token) =>
      token === 'good' ? { id: 7, isStaff: false } : undefined
  })

  const view = apiView(
    { authentication: [auth], permissions: [IsAuthenticated] },
    (viewCtx) => Response.json({ user: viewCtx.user })
  )

  it('401s when credentials are required but absent', async () => {
    const response = await view(ctx())
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({
      detail: 'Authentication credentials were not provided.'
    })
  })

  it('401s for invalid credentials', async () => {
    const response = await view(ctx({ authorization: 'Bearer bad' }))
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ detail: 'Invalid token.' })
  })

  it('places the authenticated user on ctx.user', async () => {
    const response = await view(ctx({ authorization: 'Bearer good' }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: { id: 7, isStaff: false } })
  })

  it('falls back to a user already on the context (project-level auth)', async () => {
    const view2 = apiView({ permissions: [IsAuthenticated] }, (viewCtx) =>
      Response.json({ user: viewCtx.user })
    )
    const response = await view2({ ...ctx(), user: { id: 42 } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ user: { id: 42 } })
  })

  it('403s when a permission denies an authenticated user', async () => {
    const adminView = apiView(
      { authentication: [auth], permissions: [IsAdminUser] },
      () => Response.json({ ok: true })
    )
    const response = await adminView(ctx({ authorization: 'Bearer good' }))
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ detail: 'Permission denied.' })
  })

  it('supports bare predicate permissions', async () => {
    const flagged = apiView(
      { permissions: [(viewCtx) => viewCtx.query.get('allow') === '1'] },
      () => Response.json({ ok: true })
    )
    const allowed = await flagged(
      createRequestContext(new Request('https://example.test/?allow=1'), {})
    )
    const denied = await flagged(
      createRequestContext(new Request('https://example.test/?allow=0'), {})
    )
    expect(allowed.status).toBe(200)
    expect(denied.status).toBe(403)
  })
})
