import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { f, model, type ColumnType } from '@tango-ts/orm'
import { describe, expect, it } from 'vitest'

import {
  buildSnapshot,
  diffSnapshots,
  emptySnapshot
} from '../src/index.js'
import type {
  ColumnSnapshot,
  Operation,
  SchemaSnapshot
} from '../src/index.js'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'django', 'autodetect.py')

type NormOp = Record<string, unknown>

const TAG: Record<ColumnType, string> = {
  int: 'int',
  float: 'float',
  varchar: 'varchar',
  text: 'text',
  boolean: 'bool',
  datetime: 'datetime',
  date: 'date'
}

function normColumn(c: ColumnSnapshot): NormOp {
  return { name: c.name, type: TAG[c.type], nullable: c.nullable }
}

/** Map our operations to the shared vocabulary the Django oracle also emits. */
function normalizeOurs(ops: Operation[]): NormOp[] {
  const out: NormOp[] = []
  for (const op of ops) {
    switch (op.kind) {
      case 'createTable':
        out.push({
          op: 'create_table',
          table: op.table.name,
          columns: Object.values(op.table.columns)
            .sort((a, b) => a.name.localeCompare(b.name))
            .map(normColumn)
        })
        break
      case 'dropTable':
        out.push({ op: 'drop_table', table: op.table.name })
        break
      case 'renameTable':
        out.push({ op: 'rename_table', from: op.from, to: op.to })
        break
      case 'addColumn':
        out.push({
          op: 'add_column',
          table: op.table,
          name: op.column.name,
          type: TAG[op.column.type],
          nullable: op.column.nullable
        })
        break
      case 'dropColumn':
        out.push({ op: 'drop_column', table: op.table, name: op.column.name })
        break
      case 'alterColumn':
        out.push({
          op: 'alter_column',
          table: op.table,
          name: op.to.name,
          type: TAG[op.to.type],
          nullable: op.to.nullable
        })
        break
      case 'renameColumn':
        out.push({
          op: 'rename_column',
          table: op.table,
          from: op.from,
          to: op.to
        })
        break
      // Unique/index/runSql ops are not part of the parity vocabulary.
      default:
        break
    }
  }
  return out
}

/** Order-independent, key-order-independent canonical form for multiset comparison. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonical).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record).sort()
    return `{${keys
      .map((k) => `${JSON.stringify(k)}:${canonical(record[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

function bag(ops: NormOp[]): string[] {
  return ops.map(canonical).sort()
}

/** Run Django's real autodetector. Throws loudly (never skips) if uv/Django is absent. */
function djangoOps(from: SchemaSnapshot, to: SchemaSnapshot): NormOp[] {
  const input = JSON.stringify({ from, to })
  let stdout: string
  try {
    stdout = execFileSync(
      'uv',
      ['run', '--with', 'django==4.2.4', 'python', SCRIPT],
      { input, encoding: 'utf8' }
    )
  } catch (err) {
    const e = err as { stderr?: string; message?: string }
    throw new Error(
      `Django parity oracle failed to run (uv + Django required):\n${
        e.stderr ?? e.message ?? String(err)
      }`
    )
  }
  return JSON.parse(stdout) as NormOp[]
}

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

function assertParity(from: SchemaSnapshot, to: SchemaSnapshot): void {
  const ours = bag(normalizeOurs(diffSnapshots(from, to)))
  const theirs = bag(djangoOps(from, to))
  expect(ours).toEqual(theirs)
}

// The first oracle invocation may resolve and install Django via uv on a cold
// cache (especially in CI), which can far exceed the default 5s test timeout.
describe('autodetector matches Django (oracle)', { timeout: 120_000 }, () => {
  it('create table', () => {
    assertParity(emptySnapshot(), buildSnapshot([UserBase]))
  })

  it('add column', () => {
    assertParity(buildSnapshot([UserBase]), buildSnapshot([UserWithAge]))
  })

  it('drop column', () => {
    assertParity(buildSnapshot([UserWithAge]), buildSnapshot([UserBase]))
  })

  it('alter column nullability', () => {
    assertParity(
      buildSnapshot([UserWithAge]),
      buildSnapshot([UserWithAgeNotNull])
    )
  })

  it('drop table', () => {
    assertParity(buildSnapshot([UserBase]), emptySnapshot())
  })
})
