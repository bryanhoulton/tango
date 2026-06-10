import { Buffer } from 'node:buffer'
import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Reserved path prefix for the internal dispatch endpoint. Never part of the
 * public API surface: requests must carry a valid HMAC signature, and the
 * OpenAPI generator never emits it (plain routes carry no viewset metadata).
 */
export const FUNCTIONS_PATH_PREFIX = '/_tango/functions'

export const TIMESTAMP_HEADER = 'x-tango-timestamp'
export const SIGNATURE_HEADER = 'x-tango-signature'

/** Maximum clock skew / replay window for signed invocations, in seconds. */
export const MAX_SKEW_SECONDS = 300

export function functionDispatchPath(
  appName: string,
  functionName: string
): string {
  return `${FUNCTIONS_PATH_PREFIX}/${encodeURIComponent(appName)}/${encodeURIComponent(functionName)}/`
}

export interface SignatureInput {
  readonly secret: string
  /** Unix timestamp in seconds, as sent in the timestamp header. */
  readonly timestamp: string
  readonly appName: string
  readonly functionName: string
  /** The exact request body string — signatures cover the raw bytes. */
  readonly body: string
}

export function signFunctionRequest(input: SignatureInput): string {
  return createHmac('sha256', input.secret)
    .update(
      `v1:${input.timestamp}:${input.appName}:${input.functionName}:${input.body}`
    )
    .digest('hex')
}

export interface VerifyInput extends SignatureInput {
  readonly signature: string
  /** Clock override for tests. Defaults to Date.now. */
  readonly now?: () => number
}

export function verifyFunctionRequest(input: VerifyInput): boolean {
  const now = input.now ?? Date.now
  const timestamp = Number(input.timestamp)
  if (!Number.isFinite(timestamp)) {
    return false
  }
  if (Math.abs(now() / 1000 - timestamp) > MAX_SKEW_SECONDS) {
    return false
  }
  const expected = new Uint8Array(Buffer.from(signFunctionRequest(input), 'hex'))
  const actual = new Uint8Array(Buffer.from(input.signature, 'hex'))
  if (actual.length !== expected.length) {
    return false
  }
  return timingSafeEqual(actual, expected)
}
