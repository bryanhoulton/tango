import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { generateToken, hashToken, TOKEN_PREFIX } from '../src/tokens.js'

describe('generateToken', () => {
  it('produces prefixed, URL-safe tokens with 256 bits of entropy', () => {
    const token = generateToken()
    expect(token.startsWith(TOKEN_PREFIX)).toBe(true)
    const secret = token.slice(TOKEN_PREFIX.length)
    // 32 bytes base64url-encoded without padding = 43 chars.
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
  })

  it('never repeats', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()))
    expect(tokens.size).toBe(100)
  })
})

describe('hashToken', () => {
  it('matches an independent SHA-256 implementation', async () => {
    const token = generateToken()
    const expected = createHash('sha256').update(token).digest('hex')
    await expect(hashToken(token)).resolves.toBe(expected)
  })

  it('is deterministic and collision-distinct across tokens', async () => {
    const a = generateToken()
    const b = generateToken()
    expect(await hashToken(a)).toBe(await hashToken(a))
    expect(await hashToken(a)).not.toBe(await hashToken(b))
  })
})
