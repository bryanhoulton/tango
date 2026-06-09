/**
 * Environment-driven MySQL connection configuration, shared by
 * `@tango-ts/server` (`mysqlFromEnv`) and the `tango` CLI so the resolution
 * rules exist in exactly one place.
 *
 * Resolution order per field: explicit option > TANGO_DATABASE_URL /
 * DATABASE_URL > TANGO_DB_* variable > development default. Development
 * defaults match the framework's docker-compose database and are refused when
 * `NODE_ENV=production` — a production process must be configured explicitly.
 */

export interface MysqlSslConfig {
  readonly rejectUnauthorized: boolean
}

export interface MysqlConnectionConfig {
  readonly host: string
  readonly port: number
  readonly user: string
  readonly password: string
  readonly database: string
  readonly ssl?: MysqlSslConfig
  readonly connectionLimit?: number
}

export interface MysqlEnvOptions {
  readonly projectName?: string
  readonly host?: string
  readonly port?: number
  readonly user?: string
  readonly password?: string
  readonly database?: string
  readonly ssl?: MysqlSslConfig | boolean
  readonly connectionLimit?: number
}

interface UrlParts {
  readonly host?: string
  readonly port?: number
  readonly user?: string
  readonly password?: string
  readonly database?: string
  readonly ssl?: MysqlSslConfig
}

const DEV_DEFAULTS = {
  host: '127.0.0.1',
  port: 3307,
  user: 'root',
  password: 'tango',
  database: 'tango_test'
} as const

function databaseNameFromProject(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'tango'
  )
}

function parseSslValue(value: string, source: string): MysqlSslConfig | undefined {
  switch (value.trim().toLowerCase()) {
    case 'true':
    case '1':
    case 'require':
      return { rejectUnauthorized: true }
    case 'skip-verify':
      return { rejectUnauthorized: false }
    case 'false':
    case '0':
    case 'disabled':
    case '':
      return undefined
    default:
      throw new Error(
        `Invalid ${source} value "${value}". Use true, skip-verify, or false.`
      )
  }
}

function parsePositiveInteger(value: string, source: string): number {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${source} value "${value}". Expected a positive integer.`)
  }
  return parsed
}

function parseDatabaseUrl(raw: string, source: string): UrlParts {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new Error(`Invalid ${source}: not a valid URL.`)
  }
  if (url.protocol !== 'mysql:') {
    throw new Error(
      `Invalid ${source}: expected a mysql:// URL, got "${url.protocol}//".`
    )
  }
  const database = url.pathname.replace(/^\//, '')
  const sslParam = url.searchParams.get('ssl')
  return {
    host: url.hostname.length > 0 ? url.hostname : undefined,
    port: url.port.length > 0 ? parsePositiveInteger(url.port, `${source} port`) : undefined,
    user: url.username.length > 0 ? decodeURIComponent(url.username) : undefined,
    password: url.password.length > 0 ? decodeURIComponent(url.password) : undefined,
    database: database.length > 0 ? database : undefined,
    ssl: sslParam === null ? undefined : parseSslValue(sslParam, `${source} ssl parameter`)
  }
}

function normalizeSslOption(
  ssl: MysqlSslConfig | boolean | undefined
): MysqlSslConfig | undefined {
  if (ssl === undefined || ssl === false) {
    return undefined
  }
  return ssl === true ? { rejectUnauthorized: true } : ssl
}

/**
 * Resolve the MySQL connection configuration from explicit options and the
 * environment. Throws when `NODE_ENV=production` and any required setting
 * would silently fall back to a development default.
 */
export function mysqlConfigFromEnv(
  options: MysqlEnvOptions = {},
  env: NodeJS.ProcessEnv = process.env
): MysqlConnectionConfig {
  const rawUrl = env.TANGO_DATABASE_URL ?? env.DATABASE_URL
  const urlSource =
    env.TANGO_DATABASE_URL !== undefined ? 'TANGO_DATABASE_URL' : 'DATABASE_URL'
  const url: UrlParts = rawUrl === undefined ? {} : parseDatabaseUrl(rawUrl, urlSource)

  const host = options.host ?? url.host ?? env.TANGO_DB_HOST
  const port =
    options.port ??
    url.port ??
    (env.TANGO_DB_PORT === undefined
      ? undefined
      : parsePositiveInteger(env.TANGO_DB_PORT, 'TANGO_DB_PORT'))
  const user = options.user ?? url.user ?? env.TANGO_DB_USER
  const password = options.password ?? url.password ?? env.TANGO_DB_PASSWORD
  const database =
    options.database ??
    url.database ??
    env.TANGO_DB_NAME ??
    (options.projectName === undefined
      ? undefined
      : databaseNameFromProject(options.projectName))
  const ssl =
    normalizeSslOption(options.ssl) ??
    url.ssl ??
    (env.TANGO_DB_SSL === undefined
      ? undefined
      : parseSslValue(env.TANGO_DB_SSL, 'TANGO_DB_SSL'))
  const connectionLimit =
    options.connectionLimit ??
    (env.TANGO_DB_POOL_SIZE === undefined
      ? undefined
      : parsePositiveInteger(env.TANGO_DB_POOL_SIZE, 'TANGO_DB_POOL_SIZE'))

  if (env.NODE_ENV === 'production') {
    const missing: string[] = []
    if (host === undefined) {
      missing.push('TANGO_DB_HOST')
    }
    if (user === undefined) {
      missing.push('TANGO_DB_USER')
    }
    if (password === undefined) {
      missing.push('TANGO_DB_PASSWORD')
    }
    if (database === undefined) {
      missing.push('TANGO_DB_NAME')
    }
    if (missing.length > 0) {
      throw new Error(
        `Missing database configuration in production: ${missing.join(', ')}. ` +
          'Tango refuses to fall back to development defaults when NODE_ENV=production. ' +
          'Set the TANGO_DB_* variables or TANGO_DATABASE_URL.'
      )
    }
  }

  return {
    host: host ?? DEV_DEFAULTS.host,
    port: port ?? DEV_DEFAULTS.port,
    user: user ?? DEV_DEFAULTS.user,
    password: password ?? DEV_DEFAULTS.password,
    database: database ?? DEV_DEFAULTS.database,
    ...(ssl === undefined ? {} : { ssl }),
    ...(connectionLimit === undefined ? {} : { connectionLimit })
  }
}
