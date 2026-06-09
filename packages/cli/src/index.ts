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
import type { TangoApp } from '@tango-ts/orm'
import type { Kysely } from 'kysely'
import type { LooseDatabase } from '@tango-ts/orm'
import type { WebHandler } from '@tango-ts/adapters'

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
    PROJECT_NAME: options.name
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
      .filter((entry) => ['.js', '.mjs', '.ts'].includes(extname(entry)))
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

export async function loadMigrations(dir: string): Promise<MigrationFile[]> {
  const files = await migrationFiles(resolve(dir))
  const loaded: MigrationFile[] = []
  for (const file of files) {
    const mod = (await import(pathToFileURL(file).href)) as Record<string, unknown>
    if (!isMigrationFile(mod)) {
      throw new Error(
        `Migration file ${file} must export { migration, snapshotAfter }.`
      )
    }
    loaded.push({
      migration: mod.migration,
      snapshotAfter: mod.snapshotAfter
    })
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

function isWebHandler(value: unknown): value is WebHandler {
  return typeof value === 'function'
}

function isRoutableHandler(value: unknown): value is { handle: WebHandler } {
  return (
    isRecord(value) &&
    typeof value['handle'] === 'function'
  )
}

export async function loadHandler(path: string): Promise<WebHandler> {
  const mod = (await import(pathToFileURL(resolve(path)).href)) as Record<
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
