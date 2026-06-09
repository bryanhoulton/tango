import { describe, expect, it } from 'vitest'

import { createRequestContext } from '@tango-ts/http'

import {
  AllowAny,
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
