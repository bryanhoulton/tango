import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { defineApp, f, model } from '@tango-ts/orm'
import { describe, expect, it, vi } from 'vitest'

import {
  checkMigrations,
  loadMigrations,
  makemigrations,
  migrateApp
} from '../src/index.js'

const migrateMock = vi.hoisted(() => vi.fn())

vi.mock('@tango-ts/migrations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tango-ts/migrations')>()
  return {
    ...actual,
    migrate: migrateMock
  }
})

async function tempMigrationsDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'tango-migrations-'))
}

describe('makemigrations', () => {
  it('writes a TS migration file from the registered app models', async () => {
    const dir = await tempMigrationsDir()
    try {
      const User = model('users', {
        id: f.int().primaryKey().autoIncrement(),
        email: f.varchar(255).unique()
      })
      const app = defineApp({ name: 'blog', models: [User], migrationsDir: dir })

      const result = await makemigrations({ app, name: 'init' })

      expect(result.written).toBe(true)
      expect(result.path).toBe(join(dir, '0001_init.ts'))
      expect(result.migration.operations.map((op) => op.kind)).toEqual([
        'createTable'
      ])

      const files = await loadMigrations(dir)
      expect(files).toHaveLength(1)
      expect(files[0]?.migration.name).toBe('0001_init')
      expect(files[0]?.snapshotAfter.tables['users']?.columns['email']?.unique).toBe(
        true
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('reads generated TS source migration history', async () => {
    const dir = await tempMigrationsDir()
    try {
      const UserEmail = model('users', {
        id: f.int().primaryKey().autoIncrement(),
        email: f.varchar(255)
      })
      const appV1 = defineApp({
        name: 'blog',
        models: [UserEmail],
        migrationsDir: dir
      })
      await makemigrations({ app: appV1, name: 'init' })

      const UserEmailAndName = model('users', {
        id: f.int().primaryKey().autoIncrement(),
        email: f.varchar(255),
        name: f.varchar(255)
      })
      const appV2 = defineApp({
        name: 'blog',
        models: [UserEmailAndName],
        migrationsDir: dir
      })

      const result = await makemigrations({
        app: appV2,
        name: 'add_name'
      })

      expect(result.written).toBe(true)
      expect(result.path).toBe(join(dir, '0002_add_name.ts'))
      const [operation] = result.migration.operations
      if (operation?.kind !== 'addColumn') {
        throw new Error('Expected makemigrations to create one addColumn operation.')
      }
      expect(operation.table).toBe('users')
      expect(operation.column.name).toBe('name')
      const files = await loadMigrations(dir)
      expect(files).toHaveLength(2)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('ignores generated declaration files when loading built migrations', async () => {
    const dir = await tempMigrationsDir()
    try {
      await writeFile(
        join(dir, '0001_init.js'),
        `export const migration = { "name": "0001_init", "operations": [] }
export const snapshotAfter = { "tables": {} }
`,
        'utf8'
      )
      await writeFile(
        join(dir, '0001_init.d.ts'),
        'export declare const migration: unknown\n',
        'utf8'
      )

      const files = await loadMigrations(dir)

      expect(files).toHaveLength(1)
      expect(files[0]?.migration.name).toBe('0001_init')
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('checkMigrations fails when models changed without a migration', async () => {
    const dir = await tempMigrationsDir()
    try {
      const User = model('users', {
        id: f.int().primaryKey().autoIncrement()
      })
      const app = defineApp({ name: 'blog', models: [User], migrationsDir: dir })

      await expect(checkMigrations({ app })).rejects.toThrow(
        'Model changes detected but no migration exists'
      )
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('fails loudly on ambiguous rename candidates without explicit hints', async () => {
    const dir = await tempMigrationsDir()
    try {
      const UserName = model('users', {
        id: f.int().primaryKey().autoIncrement(),
        name: f.varchar(255)
      })
      const appV1 = defineApp({ name: 'blog', models: [UserName], migrationsDir: dir })
      await makemigrations({ app: appV1, name: 'init' })

      const UserFullName = model('users', {
        id: f.int().primaryKey().autoIncrement(),
        fullName: f.varchar(255)
      })
      const appV2 = defineApp({
        name: 'blog',
        models: [UserFullName],
        migrationsDir: dir
      })

      await expect(makemigrations({ app: appV2, name: 'rename' })).rejects.toThrow(
        'Potential rename(s) detected'
      )

      const result = await makemigrations({
        app: appV2,
        name: 'rename',
        renames: { columns: { users: [{ from: 'name', to: 'fullName' }] } }
      })
      expect(result.migration.operations).toEqual([
        { kind: 'renameColumn', table: 'users', from: 'name', to: 'fullName' }
      ])
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })

  it('namespaces applied migration names by app to support nested projects', async () => {
    const dir = await tempMigrationsDir()
    try {
      migrateMock.mockResolvedValueOnce(['blog.0001_init'])
      const User = model('users', {
        id: f.int().primaryKey().autoIncrement()
      })
      const app = defineApp({ name: 'blog', models: [User], migrationsDir: dir })
      await makemigrations({ app, name: 'init' })

      await expect(migrateApp({ app, db: {} as never })).resolves.toEqual([
        'blog.0001_init'
      ])

      expect(migrateMock).toHaveBeenCalledWith(
        {},
        [expect.objectContaining({ name: 'blog.0001_init' })]
      )
    } finally {
      migrateMock.mockReset()
      await rm(dir, { recursive: true, force: true })
    }
  })
})
