/**
 * Opaque API tokens. The plaintext token is shown to the caller exactly once;
 * only its SHA-256 hash is persisted, so a database leak does not leak usable
 * credentials. The `tango_` prefix exists for secret scanners (the same reason
 * GitHub tokens start with `ghp_`).
 */

export const TOKEN_PREFIX = 'tango_'

const TOKEN_BYTES = 32

function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/** Generate a new plaintext token: `tango_` + 256 bits of randomness. */
export function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TOKEN_BYTES))
  return `${TOKEN_PREFIX}${toBase64Url(bytes)}`
}

/** SHA-256 hex digest of a plaintext token — the only form ever stored. */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token)
  )
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}
