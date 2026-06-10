import { spawn } from 'node:child_process'
import { watch as watchFiles, type FSWatcher } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  buildSnapshot,
  detectRenameCandidates,
  emptySnapshot,
  migrate,
  planMigration,
  type Migration,
  type RenameHints,
  type SchemaSnapshot
} from '@tango-ts/migrations'
import { createSuperuser, type UserRow } from '@tango-ts/contrib-auth'
import {
  createMysqlConnection,
  mysqlConfigFromEnv,
  withConnection,
  type LooseDatabase,
  type MysqlConnectionConfig,
  type TangoApp
} from '@tango-ts/orm'
import { sql, type Kysely } from 'kysely'
import { serve, type DevServer, type WebHandler } from '@tango-ts/adapters'

export interface StartProjectOptions {
  readonly name: string
  readonly directory: string
}

export interface StartAppOptions {
  readonly name: string
  readonly directory: string
}

export interface MigrationFile {
  readonly migration: Migration
  readonly snapshotAfter: SchemaSnapshot
}

const TEMPLATE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'templates')

function applyTemplate(
  value: string,
  replacements: Readonly<Record<string, string>>
): string {
  return Object.entries(replacements).reduce(
    (current, [key, replacement]) => current.replaceAll(`__${key}__`, replacement),
    value
  )
}

function packageNameFromProject(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'tango-project'
  )
}

function databaseNameFromProject(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'tango'
}

async function copyTemplate(
  templateName: string,
  destination: string,
  replacements: Readonly<Record<string, string>>
): Promise<void> {
  const source = join(TEMPLATE_ROOT, templateName)
  await copyTemplateDirectory(source, resolve(destination), replacements)
}

async function copyTemplateDirectory(
  source: string,
  destination: string,
  replacements: Readonly<Record<string, string>>
): Promise<void> {
  await mkdir(destination, { recursive: true })
  const entries = await readdir(source, { withFileTypes: true })
  for (const entry of entries) {
    const renderedName = applyTemplate(entry.name, replacements)
    const sourcePath = join(source, entry.name)
    const destinationPath = join(destination, renderedName)
    if (entry.isDirectory()) {
      await copyTemplateDirectory(sourcePath, destinationPath, replacements)
    } else if (entry.isFile()) {
      const contents = await readFile(sourcePath, 'utf8')
      await writeFile(destinationPath, applyTemplate(contents, replacements), 'utf8')
    }
  }
}

export async function startApp(options: StartAppOptions): Promise<void> {
  await copyTemplate('default-app', options.directory, {
    APP_NAME: options.name
  })
}

export async function startProject(options: StartProjectOptions): Promise<void> {
  await copyTemplate('default-project', options.directory, {
    PROJECT_NAME: options.name,
    PROJECT_PACKAGE_NAME: packageNameFromProject(options.name),
    PROJECT_DB_NAME: databaseNameFromProject(options.name),
    // Dotfiles are stored as `__DOT__name` in the template because npm mangles
    // real dotfiles (e.g. .gitignore) when packing the published tarball.
    DOT: '.'
  })
}

export interface MakeMigrationsOptions {
  readonly app: TangoApp
  readonly migrationsDir?: string
  readonly name: string
  readonly check?: boolean
  readonly interactive?: boolean
  readonly renames?: RenameHints
}

export interface MakeMigrationsResult {
  readonly written: boolean
  readonly path?: string
  readonly migration: Migration
  readonly snapshotAfter: SchemaSnapshot
}

export interface MigrateAppOptions {
  readonly app: TangoApp
  readonly db: Kysely<LooseDatabase>
  readonly migrationsDir?: string
}

export type MysqlConnectionOptions = MysqlConnectionConfig

type ServerMysqlConnectionOptions = Omit<MysqlConnectionOptions, 'database'>

export interface LoadHandlerOptions {
  readonly cacheBust?: string
}

export interface ServeProjectOptions {
  readonly handlerPath?: string
  readonly host?: string
  readonly port?: number
}

export interface DevServerOptions {
  readonly handlerPath: string
  readonly host?: string
  readonly port?: number
  readonly watchDirs?: readonly string[]
  readonly buildCommand?: string
  readonly debounceMs?: number
}

const DEFAULT_BUILD_COMMAND = 'yarn build'
const DEFAULT_WATCH_DIRS = ['src'] as const
export const DEFAULT_SERVE_HANDLER_PATH = './dist/project.js'

export function mysqlConnectionOptionsFromEnv(
  env: NodeJS.ProcessEnv = process.env
): MysqlConnectionOptions {
  // One resolution path for the whole framework, including the fail-loud
  // production behavior and TANGO_DATABASE_URL/TLS support.
  return mysqlConfigFromEnv({}, env)
}

export async function ensureMysqlDatabase(
  options: MysqlConnectionOptions,
  createServerConnection: (
    options: ServerMysqlConnectionOptions
  ) => Kysely<LooseDatabase> = createMysqlConnection,
  executeCreateDatabase: (
    db: Kysely<LooseDatabase>,
    database: string
  ) => Promise<unknown> = (db, database) =>
    sql`create database if not exists ${sql.id(database)}`.execute(db),
  executeProbe: (db: Kysely<LooseDatabase>) => Promise<unknown> = (db) =>
    sql`select 1`.execute(db)
): Promise<void> {
  // The server-level connection must carry the same TLS settings as the real
  // one — managed MySQL (PlanetScale, Aiven, ...) refuses plaintext entirely.
  const serverDb = createServerConnection({
    host: options.host,
    port: options.port,
    user: options.user,
    password: options.password,
    ...(options.ssl === undefined ? {} : { ssl: options.ssl })
  })
  try {
    await executeCreateDatabase(serverDb, options.database)
  } catch (err) {
    // Managed MySQL often forbids CREATE DATABASE (PlanetScale databases are
    // branches, restricted RDS users lack the grant). If the target database
    // is already reachable, the goal of this function is met.
    const targetDb = createServerConnection(options)
    try {
      await executeProbe(targetDb)
    } catch {
      throw err
    } finally {
      await targetDb.destroy()
    }
  } finally {
    await serverDb.destroy()
  }
}

function migrationsDirFor(app: TangoApp, explicit?: string): string {
  const dir = explicit ?? app.migrationsDir
  if (dir === undefined) {
    throw new Error(
      `No migrations directory configured for app "${app.name}". Pass migrationsDir or set it in defineApp(...).`
    )
  }
  return resolve(dir)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isMigrationFile(value: unknown): value is MigrationFile {
  if (!isRecord(value)) {
    return false
  }
  const migration = value['migration']
  const snapshotAfter = value['snapshotAfter']
  return isRecord(migration) && isRecord(snapshotAfter)
}

async function migrationFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir)
    return entries
      .filter(
        (entry) =>
          !entry.endsWith('.d.ts') && ['.js', '.mjs', '.ts'].includes(extname(entry))
      )
      .sort((a, b) => a.localeCompare(b))
      .map((entry) => join(dir, entry))
  } catch (err) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') {
      return []
    }
    throw err
  }
}

function jsonObjectEnd(source: string, start: number): number {
  if (source[start] !== '{') {
    throw new Error('Expected generated migration export to be a JSON object.')
  }

  let depth = 0
  let inString = false
  let escaped = false

  for (let idx = start; idx < source.length; idx += 1) {
    const char = source[idx]
    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return idx + 1
      }
    }
  }

  throw new Error('Generated migration export has an unterminated JSON object.')
}

function parseGeneratedExport(source: string, exportName: string): unknown {
  const marker = `export const ${exportName}`
  const exportIdx = source.indexOf(marker)
  if (exportIdx === -1) {
    throw new Error(`Generated migration file is missing ${exportName}.`)
  }

  const equalsIdx = source.indexOf('=', exportIdx + marker.length)
  if (equalsIdx === -1) {
    throw new Error(`Generated migration export ${exportName} is missing "=".`)
  }

  const start = source.slice(equalsIdx + 1).search(/\S/)
  if (start === -1) {
    throw new Error(`Generated migration export ${exportName} is empty.`)
  }

  const valueStart = equalsIdx + 1 + start
  const valueEnd = jsonObjectEnd(source, valueStart)
  return JSON.parse(source.slice(valueStart, valueEnd))
}

async function loadMigrationFile(file: string): Promise<MigrationFile> {
  if (extname(file) === '.ts') {
    const source = await readFile(file, 'utf8')
    const migration = parseGeneratedExport(source, 'migration')
    const snapshotAfter = parseGeneratedExport(source, 'snapshotAfter')
    if (!isRecord(migration) || !isRecord(snapshotAfter)) {
      throw new Error(
        `Migration file ${file} must export { migration, snapshotAfter }.`
      )
    }
    return {
      migration: migration as unknown as Migration,
      snapshotAfter: snapshotAfter as unknown as SchemaSnapshot
    }
  }

  const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>
  if (!isMigrationFile(mod)) {
    throw new Error(
      `Migration file ${file} must export { migration, snapshotAfter }.`
    )
  }
  return {
    migration: mod.migration,
    snapshotAfter: mod.snapshotAfter
  }
}

export async function loadMigrations(dir: string): Promise<MigrationFile[]> {
  const files = await migrationFiles(resolve(dir))
  const loaded: MigrationFile[] = []
  for (const file of files) {
    loaded.push(await loadMigrationFile(file))
  }
  return loaded
}

function latestSnapshot(files: readonly MigrationFile[]): SchemaSnapshot {
  const latest = files.at(-1)
  return latest?.snapshotAfter ?? emptySnapshot()
}

function nextMigrationBasename(
  existing: readonly MigrationFile[],
  name: string
): string {
  const number = String(existing.length + 1).padStart(4, '0')
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return `${number}_${slug || 'migration'}`
}

function migrationSource(file: MigrationFile): string {
  return `import type { Migration, SchemaSnapshot } from '@tango-ts/migrations'

export const migration: Migration = ${JSON.stringify(file.migration, null, 2)}

export const snapshotAfter: SchemaSnapshot = ${JSON.stringify(
    file.snapshotAfter,
    null,
    2
  )}

export default migration
`
}

export async function makemigrations(
  options: MakeMigrationsOptions
): Promise<MakeMigrationsResult> {
  const dir = migrationsDirFor(options.app, options.migrationsDir)
  const existing = await loadMigrations(dir)
  const from = latestSnapshot(existing)
  const snapshotAfter = buildSnapshot(options.app.models)
  const candidates = detectRenameCandidates(from, snapshotAfter)

  if (candidates.length > 0 && options.renames === undefined) {
    const rendered = candidates
      .map((c) => `${c.table}.${c.from} -> ${c.to}`)
      .join(', ')
    throw new Error(
      `Potential rename(s) detected: ${rendered}. Re-run with explicit rename hints; non-interactive mode never guesses destructively.`
    )
  }

  const basenameWithoutExt = nextMigrationBasename(existing, options.name)
  const migration = planMigration(
    basenameWithoutExt,
    from,
    snapshotAfter,
    options.renames === undefined ? {} : { renames: options.renames }
  )

  if (migration.operations.length === 0) {
    return { written: false, migration, snapshotAfter }
  }

  if (options.check === true) {
    throw new Error(
      `Model changes detected but no migration exists: ${migration.operations
        .map((op) => op.kind)
        .join(', ')}`
    )
  }

  await mkdir(dir, { recursive: true })
  const path = join(dir, `${basenameWithoutExt}.ts`)
  await writeFile(path, migrationSource({ migration, snapshotAfter }), 'utf8')
  return { written: true, path, migration, snapshotAfter }
}

export async function checkMigrations(
  options: Omit<MakeMigrationsOptions, 'name' | 'check'>
): Promise<void> {
  await makemigrations({ ...options, name: 'check', check: true })
}

export async function migrateApp(options: MigrateAppOptions): Promise<string[]> {
  const dir = migrationsDirFor(options.app, options.migrationsDir)
  const files = await loadMigrations(dir)
  return migrate(
    options.db,
    files.map((file) => ({
      ...file.migration,
      name: `${options.app.name}.${file.migration.name}`
    }))
  )
}

export interface CreateSuperuserOptions {
  readonly email: string
  readonly password: string
  readonly firstName?: string
  readonly lastName?: string
  /** Override the database name from the environment. */
  readonly database?: string
}

function isDuplicateEntryError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { code?: unknown }).code === 'ER_DUP_ENTRY'
  )
}

/**
 * `tango createsuperuser` — Django's bootstrap command. Connects using the
 * same environment resolution as `migrate` and creates an `isStaff` +
 * `isSuperuser` user via `@tango-ts/contrib-auth`. Requires the contrib-auth
 * migrations to have been applied.
 */
export async function createSuperuserCommand(
  options: CreateSuperuserOptions
): Promise<UserRow> {
  const dbOptions = {
    ...mysqlConnectionOptionsFromEnv(),
    ...(options.database === undefined ? {} : { database: options.database })
  }
  const db = createMysqlConnection(dbOptions)
  try {
    return await withConnection(db, () =>
      createSuperuser({
        email: options.email,
        password: options.password,
        firstName: options.firstName,
        lastName: options.lastName
      })
    )
  } catch (err) {
    if (isDuplicateEntryError(err)) {
      throw new Error(`A user with email ${options.email} already exists.`)
    }
    throw err
  } finally {
    await db.destroy()
  }
}

export async function loadApp(path: string): Promise<TangoApp> {
  const mod = (await import(pathToFileURL(resolve(path)).href)) as Record<
    string,
    unknown
  >
  const app = mod['default'] ?? mod['app']
  if (!isRecord(app) || !Array.isArray(app['models'])) {
    throw new Error(
      `App module ${basename(path)} must export a Tango app as default or "app".`
    )
  }
  return app as unknown as TangoApp
}

function moduleUrl(path: string, options: LoadHandlerOptions = {}): string {
  const url = pathToFileURL(resolve(path))
  if (options.cacheBust !== undefined) {
    url.searchParams.set('t', options.cacheBust)
  }
  return url.href
}

function isWebHandler(value: unknown): value is WebHandler {
  return typeof value === 'function'
}

function isRoutableHandler(value: unknown): value is { handle: WebHandler } {
  return (
    isRecord(value) &&
    typeof value['handle'] === 'function'
  )
}

export async function loadHandler(
  path: string,
  options: LoadHandlerOptions = {}
): Promise<WebHandler> {
  const mod = (await import(moduleUrl(path, options))) as Record<
    string,
    unknown
  >
  const exported = mod['default'] ?? mod['handler'] ?? mod['app']
  if (isWebHandler(exported)) {
    return exported
  }
  if (isRoutableHandler(exported)) {
    return (request) => exported.handle(request)
  }
  throw new Error(
    `Handler module ${basename(path)} must export a Web handler function or an object with handle(request).`
  )
}

export async function serveProject(
  options: ServeProjectOptions = {}
): Promise<DevServer> {
  const handlerPath = options.handlerPath ?? DEFAULT_SERVE_HANDLER_PATH
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 8000
  return serve(await loadHandler(handlerPath), { host, port })
}

export interface RunServerOptions extends ServeProjectOptions {
  /** How long to wait for in-flight requests on shutdown before forcing close. */
  readonly shutdownTimeoutMs?: number
}

async function disposeHandler(handler: WebHandler): Promise<void> {
  const dispose = (handler as { dispose?: unknown }).dispose
  if (typeof dispose !== 'function') {
    return
  }
  try {
    await (dispose as () => Promise<void>).call(handler)
  } catch (err) {
    console.error(`Failed to dispose project resources: ${errorMessage(err)}`)
  }
}

function waitForShutdown(
  devServer: DevServer,
  handler: WebHandler,
  timeoutMs: number
): Promise<void> {
  return new Promise((resolveShutdown) => {
    let shuttingDown = false
    const shutdown = (signal: NodeJS.Signals): void => {
      if (shuttingDown) {
        return
      }
      shuttingDown = true
      console.log(`Received ${signal}; draining in-flight requests...`)
      // In-flight requests get `timeoutMs` to finish; afterwards remaining
      // sockets are destroyed so the process never hangs on a stuck request.
      const force = setTimeout(() => {
        devServer.server.closeAllConnections()
      }, timeoutMs)
      force.unref()
      void devServer
        .close()
        .catch((err: unknown) => {
          console.error(`Failed to close server: ${errorMessage(err)}`)
        })
        .then(() => disposeHandler(handler))
        .then(() => {
          clearTimeout(force)
          resolveShutdown()
        })
    }
    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
}

/**
 * Run the production server: serve the built handler, then block until
 * SIGINT/SIGTERM, drain in-flight requests, and release the database pool.
 * This is what `tango serve` executes.
 */
export async function runServer(options: RunServerOptions = {}): Promise<void> {
  const handlerPath = options.handlerPath ?? DEFAULT_SERVE_HANDLER_PATH
  const handler = await loadHandler(handlerPath)
  const devServer = await serve(handler, {
    host: options.host ?? '127.0.0.1',
    port: options.port ?? 8000
  })
  console.log(`Tango server listening at ${devServer.url}`)
  await waitForShutdown(devServer, handler, options.shutdownTimeoutMs ?? 10_000)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

function runShellCommand(command: string): Promise<void> {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, {
      shell: true,
      stdio: 'inherit'
    })
    child.once('error', rejectCommand)
    child.once('close', (code, signal) => {
      if (code === 0) {
        resolveCommand()
        return
      }
      rejectCommand(
        new Error(
          signal === null
            ? `Build command failed with exit code ${code ?? 'unknown'}.`
            : `Build command failed with signal ${signal}.`
        )
      )
    })
  })
}

async function buildAndLoadHandler(
  handlerPath: string,
  buildCommand: string
): Promise<WebHandler> {
  console.log(`Building with "${buildCommand}"...`)
  await runShellCommand(buildCommand)
  return loadHandler(handlerPath, { cacheBust: String(Date.now()) })
}

export async function runDevServer(options: DevServerOptions): Promise<void> {
  const host = options.host ?? '127.0.0.1'
  const port = options.port ?? 8000
  const buildCommand = options.buildCommand ?? DEFAULT_BUILD_COMMAND
  const watchDirs =
    options.watchDirs === undefined || options.watchDirs.length === 0
      ? DEFAULT_WATCH_DIRS
      : options.watchDirs
  const debounceMs = options.debounceMs ?? 200

  let activeHandler = await buildAndLoadHandler(options.handlerPath, buildCommand)
  const devServer = await serve((request) => activeHandler(request), { host, port })
  console.log(`Tango dev server listening at ${devServer.url}`)
  console.log(`Watching: ${watchDirs.join(', ')}`)

  let debounceTimer: NodeJS.Timeout | undefined
  let reloading = false
  let reloadRequested = false

  const reload = async (): Promise<void> => {
    if (reloading) {
      reloadRequested = true
      return
    }

    reloading = true
    try {
      do {
        reloadRequested = false
        try {
          activeHandler = await buildAndLoadHandler(options.handlerPath, buildCommand)
          console.log('Reloaded Tango dev server.')
        } catch (err) {
          console.error(`Dev rebuild failed: ${errorMessage(err)}`)
        }
      } while (reloadRequested)
    } finally {
      reloading = false
    }
  }

  const scheduleReload = (): void => {
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer)
    }
    debounceTimer = setTimeout(() => {
      debounceTimer = undefined
      void reload()
    }, debounceMs)
  }

  const watchers: FSWatcher[] = watchDirs.map((dir) =>
    watchFiles(resolve(dir), { recursive: true }, scheduleReload)
  )

  await new Promise<void>((resolveServer) => {
    const shutdown = (): void => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer)
      }
      for (const watcher of watchers) {
        watcher.close()
      }
      void devServer.close().then(resolveServer, (err: unknown) => {
        console.error(`Failed to close dev server: ${errorMessage(err)}`)
        resolveServer()
      })
    }

    process.once('SIGINT', shutdown)
    process.once('SIGTERM', shutdown)
  })
}
