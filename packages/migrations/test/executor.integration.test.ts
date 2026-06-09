import { createMysqlConnection, f, model } from '@tango-ts/orm'
import type { LooseDatabase } from '@tango-ts/orm'
import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  appliedMigrations,
  buildSnapshot,
  emptySnapshot,
  introspectSchema,
  migrate,
  planMigration,
  rollback
} from '../src/index.js'
import type { ColumnSnapshot, SchemaSnapshot } from '../src/index.js'

const UserV1 = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age: f.int().nullable()
})
const UserV2 = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age: f.int().nullable(),
  bio: f.text().nullable()
})

const targetV1 = buildSnapshot([UserV1])
const targetV2 = buildSnapshot([UserV2])

const initMigration = planMigration('0001_init', emptySnapshot(), targetV1)
const addBioMigration = planMigration('0002_add_bio', targetV1, targetV2)

// Compare only the dimensions migrations manage, ignoring DB-default formatting.
function projectColumn(column: ColumnSnapshot): Record<string, unknown> {
  const projected: Record<string, unknown> = {
    type: column.type,
    nullable: column.nullable,
    autoIncrement: column.autoIncrement,
    primaryKey: column.primaryKey
  }
  if (column.maxLength !== undefined) {
    projected.maxLength = column.maxLength
  }
  return projected
}

function project(
  snapshot: SchemaSnapshot,
  tableNames: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const name of tableNames) {
    const table = snapshot.tables[name]
    if (table === undefined) {
      out[name] = null
      continue
    }
    const columns: Record<string, unknown> = {}
    for (const [columnName, column] of Object.entries(table.columns)) {
      columns[columnName] = projectColumn(column)
    }
    out[name] = {
      columns,
      primaryKey: [...table.primaryKey].sort((a, b) => a.localeCompare(b)),
      uniques: table.uniques
        .map((cols) => [...cols].sort((a, b) => a.localeCompare(b)))
        .sort((a, b) => a.join().localeCompare(b.join())),
      foreignKeys: table.foreignKeys
        .map((fk) => ({
          columns: fk.columns,
          referencesTable: fk.referencesTable,
          referencesColumns: fk.referencesColumns,
          onDelete: fk.onDelete
        }))
        .sort((a, b) => a.columns.join().localeCompare(b.columns.join()))
    }
  }
  return out
}

let db: Kysely<LooseDatabase>

beforeAll(async () => {
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })
  await sql`drop table if exists posts`.execute(db)
  await sql`drop table if exists authors`.execute(db)
  await sql`drop table if exists users`.execute(db)
  await sql`drop table if exists \`tango_migrations\``.execute(db)
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists posts`.execute(db)
    await sql`drop table if exists authors`.execute(db)
    await sql`drop table if exists users`.execute(db)
    await sql`drop table if exists \`tango_migrations\``.execute(db)
    await db.destroy()
  }
})

describe('migrate against a real MySQL (round-trip)', () => {
  it('applies a migration and the live schema matches the models', async () => {
    const applied = await migrate(db, [initMigration])
    expect(applied).toEqual(['0001_init'])

    const live = await introspectSchema(db)
    expect(project(live, ['users'])).toEqual(project(targetV1, ['users']))
  })

  it('is idempotent (re-running applies nothing)', async () => {
    const applied = await migrate(db, [initMigration])
    expect(applied).toEqual([])
    expect(await appliedMigrations(db)).toEqual(['0001_init'])
  })

  it('applies an add-column migration and the live schema gains the column', async () => {
    const applied = await migrate(db, [initMigration, addBioMigration])
    expect(applied).toEqual(['0002_add_bio'])

    const live = await introspectSchema(db)
    expect(project(live, ['users'])).toEqual(project(targetV2, ['users']))
    expect(live.tables['users']?.columns['bio']?.type).toBe('text')
  })

  it('rolls back the add-column migration', async () => {
    await rollback(db, addBioMigration)

    const live = await introspectSchema(db)
    expect(project(live, ['users'])).toEqual(project(targetV1, ['users']))
    expect(await appliedMigrations(db)).toEqual(['0001_init'])
  })
})

describe('foreign-key migrations against a real MySQL', () => {
  it('applies tables plus FK, and introspection sees the constraint', async () => {
    await sql`drop table if exists posts`.execute(db)
    await sql`drop table if exists authors`.execute(db)
    await sql`drop table if exists \`tango_migrations\``.execute(db)

    const Author = model('authors', {
      id: f.int().primaryKey().autoIncrement()
    })
    const Post = model('posts', {
      id: f.int().primaryKey().autoIncrement(),
      authorId: f.foreignKey(() => Author, 'id', {
        onDelete: 'cascade'
      })
    })
    const target = buildSnapshot([Author, Post])
    const migration = planMigration('0001_fk', emptySnapshot(), target)

    expect(await migrate(db, [migration])).toEqual(['0001_fk'])

    const live = await introspectSchema(db)
    expect(project(live, ['authors', 'posts'])).toEqual(
      project(target, ['authors', 'posts'])
    )
  })
})
