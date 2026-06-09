import { f, model } from '@tango-ts/orm'
import { describe, expect, it } from 'vitest'

import {
  buildSnapshot,
  detectRenameCandidates,
  diffSnapshots,
  emptySnapshot
} from '../src/index.js'
import type { ColumnSnapshot } from '../src/index.js'

const ageNullable: ColumnSnapshot = {
  name: 'age',
  type: 'int',
  nullable: true,
  hasDefault: false,
  autoIncrement: false,
  primaryKey: false,
  unique: false
}
const ageNotNull: ColumnSnapshot = { ...ageNullable, nullable: false }

const UserBase = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255)
})
const UserWithAge = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255),
  age: f.int().nullable()
})
const UserWithAgeNotNull = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255),
  age: f.int()
})

describe('diffSnapshots', () => {
  it('emits createTable for a brand-new table', () => {
    const target = buildSnapshot([UserBase])
    const ops = diffSnapshots(emptySnapshot(), target)
    expect(ops).toEqual([{ kind: 'createTable', table: target.tables['users'] }])
  })

  it('emits addColumn for a new field', () => {
    const ops = diffSnapshots(
      buildSnapshot([UserBase]),
      buildSnapshot([UserWithAge])
    )
    expect(ops).toEqual([
      { kind: 'addColumn', table: 'users', column: ageNullable }
    ])
  })

  it('emits dropColumn for a removed field', () => {
    const ops = diffSnapshots(
      buildSnapshot([UserWithAge]),
      buildSnapshot([UserBase])
    )
    expect(ops).toEqual([
      { kind: 'dropColumn', table: 'users', column: ageNullable }
    ])
  })

  it('emits alterColumn when a field changes nullability', () => {
    const ops = diffSnapshots(
      buildSnapshot([UserWithAge]),
      buildSnapshot([UserWithAgeNotNull])
    )
    expect(ops).toEqual([
      { kind: 'alterColumn', table: 'users', from: ageNullable, to: ageNotNull }
    ])
  })

  it('emits dropTable for a removed model', () => {
    const from = buildSnapshot([UserBase])
    const ops = diffSnapshots(from, emptySnapshot())
    expect(ops).toEqual([{ kind: 'dropTable', table: from.tables['users'] }])
  })

  it('uses a rename hint instead of drop+add (no data loss)', () => {
    const UserName = model('users', {
      id: f.int().primaryKey().autoIncrement(),
      name: f.varchar(255)
    })
    const UserFullName = model('users', {
      id: f.int().primaryKey().autoIncrement(),
      fullName: f.varchar(255)
    })
    const ops = diffSnapshots(
      buildSnapshot([UserName]),
      buildSnapshot([UserFullName]),
      { renames: { columns: { users: [{ from: 'name', to: 'fullName' }] } } }
    )
    expect(ops).toEqual([
      { kind: 'renameColumn', table: 'users', from: 'name', to: 'fullName' }
    ])
  })

  it('emits addUnique when a field gains a unique constraint', () => {
    const Plain = model('users', {
      id: f.int().primaryKey().autoIncrement(),
      email: f.varchar(255)
    })
    const Unique = model('users', {
      id: f.int().primaryKey().autoIncrement(),
      email: f.varchar(255).unique()
    })
    const ops = diffSnapshots(buildSnapshot([Plain]), buildSnapshot([Unique]))
    expect(ops).toContainEqual({
      kind: 'addUnique',
      table: 'users',
      columns: ['email']
    })
  })

  it('emits foreign keys after tables are created', () => {
    const Author = model('authors', {
      id: f.int().primaryKey().autoIncrement()
    })
    const Post = model('posts', {
      id: f.int().primaryKey().autoIncrement(),
      authorId: f.foreignKey(() => Author, 'id', { onDelete: 'cascade' })
    })
    const target = buildSnapshot([Author, Post])
    const ops = diffSnapshots(emptySnapshot(), target)

    expect(ops.map((op) => op.kind)).toEqual([
      'createTable',
      'createTable',
      'addForeignKey'
    ])
    expect(ops.at(-1)).toEqual({
      kind: 'addForeignKey',
      table: 'posts',
      foreignKey: {
        name: 'posts_authorId_fk',
        columns: ['authorId'],
        referencesTable: 'authors',
        referencesColumns: ['id'],
        onDelete: 'cascade'
      }
    })
  })
})

describe('detectRenameCandidates', () => {
  it('flags a drop+add of structurally identical columns as a rename candidate', () => {
    const UserName = model('users', {
      id: f.int().primaryKey().autoIncrement(),
      name: f.varchar(255)
    })
    const UserFullName = model('users', {
      id: f.int().primaryKey().autoIncrement(),
      fullName: f.varchar(255)
    })
    const candidates = detectRenameCandidates(
      buildSnapshot([UserName]),
      buildSnapshot([UserFullName])
    )
    expect(candidates).toEqual([
      { table: 'users', from: 'name', to: 'fullName' }
    ])
  })
})
