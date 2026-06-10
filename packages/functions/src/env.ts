import type { Kysely } from 'kysely'

import type { Logger } from '@tango-ts/http'
import type { LooseDatabase } from '@tango-ts/orm'

import {
  createHttpRuntime,
  createInlineRuntime,
  VERCEL_PROTECTION_BYPASS_HEADER,
  type FetchLike,
  type FunctionRegistry,
  type FunctionRuntime
} from './runtime.js'

export type FunctionTransport = 'inline' | 'http'

/** Explicit overrides for the env-derived function transport configuration. */
export interface FunctionsOverrides {
  /**
   * `inline` runs handlers in-process (the local default); `http` offloads
   * each invocation to this deployment's signed dispatch endpoint (the Vercel
   * default). Env equivalent: `TANGO_FUNCTIONS_TRANSPORT`.
   */
  readonly transport?: FunctionTransport
  /** Shared secret for the signed dispatch channel. Required for http transport. */
  readonly secret?: string
  /**
   * Base URL the http transport posts back to. Defaults to `https://$VERCEL_URL`
   * on Vercel. Env equivalent: `TANGO_FUNCTIONS_URL`.
   */
  readonly url?: string
}

export interface FunctionRuntimeEnvOptions {
  readonly registry: FunctionRegistry
  readonly database: Kysely<LooseDatabase>
  readonly logger?: Logger
  readonly overrides?: FunctionsOverrides
  /** Env override for tests. Defaults to process.env. */
  readonly env?: Record<string, string | undefined>
  /** Fetch override for tests. Defaults to the global fetch. */
  readonly fetchImpl?: FetchLike
}

export interface ResolvedFunctionRuntime {
  readonly transport: FunctionTransport
  readonly runtime: FunctionRuntime
  /** Present for http transport — the dispatch route verifies with the same secret. */
  readonly secret?: string
}

function resolveTransport(
  value: string | undefined,
  env: Record<string, string | undefined>
): FunctionTransport {
  if (value === undefined) {
    return env.VERCEL !== undefined && env.VERCEL !== '' ? 'http' : 'inline'
  }
  if (value === 'inline' || value === 'http') {
    return value
  }
  throw new Error(
    `Invalid TANGO_FUNCTIONS_TRANSPORT "${value}" — expected "inline" or "http".`
  )
}

/**
 * Resolve the function runtime from the environment: inline locally, signed
 * http self-invocation on Vercel. Misconfiguration fails at startup, never at
 * invocation time.
 */
export function functionRuntimeFromEnv(
  options: FunctionRuntimeEnvOptions
): ResolvedFunctionRuntime {
  const env = options.env ?? process.env
  const transport = resolveTransport(
    options.overrides?.transport ?? env.TANGO_FUNCTIONS_TRANSPORT,
    env
  )
  if (transport === 'inline') {
    return {
      transport,
      runtime: createInlineRuntime({
        registry: options.registry,
        database: options.database,
        logger: options.logger
      })
    }
  }
  const secret = options.overrides?.secret ?? env.TANGO_FUNCTIONS_SECRET
  if (secret === undefined || secret.length === 0) {
    throw new Error(
      'TANGO_FUNCTIONS_SECRET is required when functions use the http transport. Set it (e.g. `vercel env add TANGO_FUNCTIONS_SECRET`) or set TANGO_FUNCTIONS_TRANSPORT=inline.'
    )
  }
  const url =
    options.overrides?.url ??
    env.TANGO_FUNCTIONS_URL ??
    (env.VERCEL_URL !== undefined && env.VERCEL_URL !== ''
      ? `https://${env.VERCEL_URL}`
      : undefined)
  if (url === undefined) {
    throw new Error(
      'Cannot resolve the function dispatch URL for the http transport. Set TANGO_FUNCTIONS_URL (on Vercel, VERCEL_URL is provided automatically).'
    )
  }
  // Vercel Deployment Protection sits in front of generated `*.vercel.app`
  // URLs and 401s anything without this bypass header — including our own
  // self-invocations. Vercel injects the secret automatically once
  // "Protection Bypass for Automation" is enabled on the project.
  const bypassSecret = env.VERCEL_AUTOMATION_BYPASS_SECRET
  const headers =
    bypassSecret !== undefined && bypassSecret.length > 0
      ? { [VERCEL_PROTECTION_BYPASS_HEADER]: bypassSecret }
      : undefined
  return {
    transport,
    secret,
    runtime: createHttpRuntime({
      registry: options.registry,
      baseUrl: url,
      secret,
      headers,
      logger: options.logger,
      fetchImpl: options.fetchImpl
    })
  }
}
