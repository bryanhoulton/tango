import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { defineApp, f, model } from '@tango-ts/orm'
import { describe, expect, it } from 'vitest'

import { checkMigrations, loadMigrations, makemigrations } from '../src/index.js'

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
})
