import { describe, expect, it } from 'vitest'

import {
  DEFAULT_ITERATIONS,
  hashPassword,
  PASSWORD_ALGORITHM,
  verifyPassword
} from '../src/hashers.js'

// Tests that exercise the algorithm itself use a low iteration count for
// speed; the production default is covered by the format test below.
const FAST = { iterations: 1_000 }

describe('hashPassword / verifyPassword', () => {
  it('round-trips a password', async () => {
    const encoded = await hashPassword('correct horse battery staple', FAST)
    await expect(
      verifyPassword('correct horse battery staple', encoded)
    ).resolves.toBe(true)
  })

  it('rejects a wrong password', async () => {
    const encoded = await hashPassword('hunter2', FAST)
    await expect(verifyPassword('hunter3', encoded)).resolves.toBe(false)
    await expect(verifyPassword('', encoded)).resolves.toBe(false)
  })

  it('produces Django-format encoded hashes at the production default cost', async () => {
    const encoded = await hashPassword('s3cret')
    // Django's exact storage format: pbkdf2_sha256$<iterations>$<salt>$<b64>.
    // A hash produced here must be portable into a Django project unchanged.
    expect(encoded).toMatch(
      new RegExp(
        `^${PASSWORD_ALGORITHM}\\$${DEFAULT_ITERATIONS}\\$[A-Za-z0-9]{22}\\$[A-Za-z0-9+/]+={0,2}$`
      )
    )
    await expect(verifyPassword('s3cret', encoded)).resolves.toBe(true)
  })

  it('matches the published PBKDF2-HMAC-SHA256 test vector', async () => {
    // P="password", S="salt", c=4096, dkLen=32 (RFC 6070 vector recomputed for
    // SHA-256; widely published, e.g. in the scrypt RFC's PBKDF2 appendix).
    const expectedHex =
      'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a'
    const expectedB64 = Buffer.from(expectedHex, 'hex').toString('base64')
    const encoded = `${PASSWORD_ALGORITHM}$4096$salt$${expectedB64}`
    await expect(verifyPassword('password', encoded)).resolves.toBe(true)
    await expect(verifyPassword('passwordx', encoded)).resolves.toBe(false)
  })

  it('salts every hash uniquely', async () => {
    const first = await hashPassword('same password', FAST)
    const second = await hashPassword('same password', FAST)
    expect(first).not.toBe(second)
    await expect(verifyPassword('same password', first)).resolves.toBe(true)
    await expect(verifyPassword('same password', second)).resolves.toBe(true)
  })

  it('returns false (never throws) for malformed stored hashes', async () => {
    await expect(verifyPassword('pw', '')).resolves.toBe(false)
    await expect(verifyPassword('pw', 'not-a-hash')).resolves.toBe(false)
    await expect(verifyPassword('pw', 'md5$1$salt$abc')).resolves.toBe(false)
    await expect(
      verifyPassword('pw', 'pbkdf2_sha256$zero$salt$abc')
    ).resolves.toBe(false)
    await expect(
      verifyPassword('pw', 'pbkdf2_sha256$0$salt$abc')
    ).resolves.toBe(false)
    await expect(
      verifyPassword('pw', 'pbkdf2_sha256$1000$$abc')
    ).resolves.toBe(false)
    await expect(
      verifyPassword('pw', 'pbkdf2_sha256$1000$salt$%%%')
    ).resolves.toBe(false)
  })

  it('rejects an invalid iteration override', async () => {
    await expect(hashPassword('pw', { iterations: 0 })).rejects.toThrow(
      'Invalid PBKDF2 iteration count'
    )
  })
})
