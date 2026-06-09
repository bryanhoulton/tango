/**
 * Password hashing for the built-in auth app.
 *
 * Algorithm: PBKDF2-HMAC-SHA256 via WebCrypto, encoded in Django's exact
 * format — `pbkdf2_sha256$<iterations>$<salt>$<base64 hash>` — so hashes are
 * portable between a Django project and a Tango project (P3: Django is the
 * oracle). WebCrypto (not `node:crypto`) keeps this runtime-agnostic.
 */

export const PASSWORD_ALGORITHM = 'pbkdf2_sha256'

/**
 * Matches Django 5.x's default iteration count. Raising this over time is
 * expected; verification reads the count from the encoded hash, so existing
 * hashes keep verifying after a bump.
 */
export const DEFAULT_ITERATIONS = 1_000_000

const SALT_LENGTH = 22
const HASH_BYTES = 32
const SALT_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

export interface HashPasswordOptions {
  /** Override the PBKDF2 iteration count (tests use a small value for speed). */
  readonly iterations?: number
}

function randomSalt(): string {
  // Rejection sampling: avoids modulo bias so all 62 characters are equally
  // likely, matching Django's `get_random_string`.
  const chars: string[] = []
  const limit = 256 - (256 % SALT_ALPHABET.length)
  while (chars.length < SALT_LENGTH) {
    const bytes = crypto.getRandomValues(new Uint8Array(SALT_LENGTH * 2))
    for (const byte of bytes) {
      if (byte < limit && chars.length < SALT_LENGTH) {
        chars.push(SALT_ALPHABET.charAt(byte % SALT_ALPHABET.length))
      }
    }
  }
  return chars.join('')
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

function fromBase64(encoded: string): Uint8Array | undefined {
  try {
    const binary = atob(encoded)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  } catch {
    return undefined
  }
}

async function deriveKey(
  password: string,
  salt: string,
  iterations: number
): Promise<Uint8Array> {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: encoder.encode(salt),
      iterations
    },
    key,
    HASH_BYTES * 8
  )
  return new Uint8Array(bits)
}

/** Constant-time byte comparison (no `node:crypto.timingSafeEqual` — runtime-agnostic). */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) {
    return false
  }
  let diff = 0
  for (let i = 0; i < a.length; i += 1) {
    diff |= (a[i] ?? 0) ^ (b[i] ?? 0)
  }
  return diff === 0
}

/** Hash a plaintext password into Django's `pbkdf2_sha256$...` encoded form. */
export async function hashPassword(
  password: string,
  options: HashPasswordOptions = {}
): Promise<string> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new Error(`Invalid PBKDF2 iteration count: ${iterations}.`)
  }
  const salt = randomSalt()
  const hash = await deriveKey(password, salt, iterations)
  return `${PASSWORD_ALGORITHM}$${iterations}$${salt}$${toBase64(hash)}`
}

/**
 * Verify a plaintext password against an encoded hash. Returns `false` for
 * malformed or unknown-algorithm hashes — never throws on bad stored data, so
 * a corrupt row cannot turn login into a 500.
 */
export async function verifyPassword(
  password: string,
  encoded: string
): Promise<boolean> {
  const [algorithm, rawIterations, salt, rawHash] = encoded.split('$')
  if (
    algorithm !== PASSWORD_ALGORITHM ||
    rawIterations === undefined ||
    salt === undefined ||
    salt.length === 0 ||
    rawHash === undefined
  ) {
    return false
  }
  const iterations = Number(rawIterations)
  if (!Number.isInteger(iterations) || iterations < 1) {
    return false
  }
  const expected = fromBase64(rawHash)
  if (expected === undefined) {
    return false
  }
  const actual = await deriveKey(password, salt, iterations)
  return timingSafeEqual(actual, expected)
}
