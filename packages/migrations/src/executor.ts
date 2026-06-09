import type { LooseDatabase } from '@tango-ts/orm'
import { sql, type Kysely } from 'kysely'

import { diffSnapshots, type DiffOptions } from './diff.js'
import { renderOperations } from './mysql.js'
import type { Operation } from './operations.js'
import type { SchemaSnapshot } from './snapshot.js'

/** A migration: a name and the ordered operations it applies. */
export interface Migration {
  name: string
  operations: Operation[]
}

/** Build a migration by diffing two snapshots. */
export function planMigration(
  name: string,
  from: SchemaSnapshot,
  to: SchemaSnapshot,
  options: DiffOptions = {}
): Migration {
  return { name, operations: diffSnapshots(from, to, options) }
}

/** Create the migration ledger table if it does not exist. */
export async function ensureMigrationsTable(
  db: Kysely<LooseDatabase>
): Promise<void> {
  await sql`
    create table if not exists \`tango_migrations\` (
      id int primary key auto_increment,
      name varchar(255) not null unique,
      applied_at datetime not null default current_timestamp
    )
  `.execute(db)
}

/** Names of migrations already applied, in application order. */
export async function appliedMigrations(
  db: Kysely<LooseDatabase>
): Promise<string[]> {
  await ensureMigrationsTable(db)
  const result = await sql<{ name: string }>`
    select name from \`tango_migrations\` order by id
  `.execute(db)
  return result.rows.map((row) => row.name)
}

/**
 * Apply all unapplied migrations in order. Each migration's ledger row is written
 * only after all of its statements succeed (MySQL DDL is not transactional, so a
 * mid-migration failure surfaces the exact failing statement). Returns the names
 * that were applied. This runs at DEPLOY time, never per request.
 */
export async function migrate(
  db: Kysely<LooseDatabase>,
  migrations: Migration[]
): Promise<string[]> {
  const applied = new Set(await appliedMigrations(db))
  const newlyApplied: string[] = []

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      continue
    }
    const { up } = renderOperations(migration.operations)
    for (const statement of up) {
      await sql.raw(statement).execute(db)
    }
    await sql`
      insert into \`tango_migrations\` (name) values (${migration.name})
    `.execute(db)
    newlyApplied.push(migration.name)
  }

  return newlyApplied
}

/** Reverse a single migration (runs its operations' inverses back-to-front). */
export async function rollback(
  db: Kysely<LooseDatabase>,
  migration: Migration
): Promise<void> {
  const { down } = renderOperations(migration.operations)
  for (const statement of down) {
    await sql.raw(statement).execute(db)
  }
  await sql`
    delete from \`tango_migrations\` where name = ${migration.name}
  `.execute(db)
}
