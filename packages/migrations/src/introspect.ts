import type { LooseDatabase } from '@tango-ts/orm'
import { type ColumnType } from '@tango-ts/orm'
import { sql, type Kysely } from 'kysely'

import type { ColumnSnapshot, SchemaSnapshot, TableSnapshot } from './snapshot.js'

interface ColumnRow {
  tableName: string
  name: string
  dataType: string
  columnType: string
  isNullable: string
  extra: string
  charLen: number | string | null
  columnDefault: string | null
}

interface ConstraintRow {
  tableName: string
  type: string
  name: string
  columnName: string
}

interface ForeignKeyRow {
  tableName: string
  name: string
  columnName: string
  referencedTable: string
  referencedColumn: string
  deleteRule: string
}

function mapType(dataType: string, columnType: string): ColumnType {
  const dt = dataType.toLowerCase()
  if (dt === 'tinyint' && columnType.toLowerCase() === 'tinyint(1)') {
    return 'boolean'
  }
  if (['int', 'tinyint', 'smallint', 'mediumint', 'bigint'].includes(dt)) {
    return 'int'
  }
  if (['double', 'float', 'decimal'].includes(dt)) {
    return 'float'
  }
  if (dt === 'varchar' || dt === 'char') {
    return 'varchar'
  }
  if (dt.includes('text')) {
    return 'text'
  }
  if (dt === 'datetime' || dt === 'timestamp') {
    return 'datetime'
  }
  if (dt === 'date') {
    return 'date'
  }
  throw new Error(
    `Unsupported MySQL type during introspection: ${dataType} (${columnType})`
  )
}

/**
 * Read the live schema of the current database into a `SchemaSnapshot`. Used to
 * verify migrations (does the DB match the models?) and to detect manual drift.
 */
export async function introspectSchema(
  db: Kysely<LooseDatabase>
): Promise<SchemaSnapshot> {
  const columns = await sql<ColumnRow>`
    select
      TABLE_NAME as tableName,
      COLUMN_NAME as name,
      DATA_TYPE as dataType,
      COLUMN_TYPE as columnType,
      IS_NULLABLE as isNullable,
      EXTRA as extra,
      CHARACTER_MAXIMUM_LENGTH as charLen,
      COLUMN_DEFAULT as columnDefault
    from information_schema.columns
    where TABLE_SCHEMA = database()
    order by TABLE_NAME, ORDINAL_POSITION
  `.execute(db)

  const constraints = await sql<ConstraintRow>`
    select
      tc.TABLE_NAME as tableName,
      tc.CONSTRAINT_TYPE as type,
      tc.CONSTRAINT_NAME as name,
      kcu.COLUMN_NAME as columnName
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
     and tc.TABLE_NAME = kcu.TABLE_NAME
     and tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
    where tc.TABLE_SCHEMA = database()
      and tc.CONSTRAINT_TYPE in ('PRIMARY KEY', 'UNIQUE')
    order by tc.TABLE_NAME, tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
  `.execute(db)

  const foreignKeys = await sql<ForeignKeyRow>`
    select
      kcu.TABLE_NAME as tableName,
      kcu.CONSTRAINT_NAME as name,
      kcu.COLUMN_NAME as columnName,
      kcu.REFERENCED_TABLE_NAME as referencedTable,
      kcu.REFERENCED_COLUMN_NAME as referencedColumn,
      rc.DELETE_RULE as deleteRule
    from information_schema.key_column_usage kcu
    join information_schema.referential_constraints rc
      on kcu.CONSTRAINT_SCHEMA = rc.CONSTRAINT_SCHEMA
     and kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
    where kcu.TABLE_SCHEMA = database()
      and kcu.REFERENCED_TABLE_NAME is not null
    order by kcu.TABLE_NAME, kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
  `.execute(db)

  const tables: Record<string, TableSnapshot> = {}

  for (const row of columns.rows) {
    const table = tables[row.tableName] ?? {
      name: row.tableName,
      columns: {},
      primaryKey: [],
      uniques: [],
      foreignKeys: []
    }
    const column: ColumnSnapshot = {
      name: row.name,
      type: mapType(row.dataType, row.columnType),
      nullable: row.isNullable === 'YES',
      hasDefault: row.columnDefault !== null,
      autoIncrement: row.extra.toLowerCase().includes('auto_increment'),
      primaryKey: false,
      unique: false
    }
    if (column.type === 'varchar' && row.charLen !== null) {
      column.maxLength = Number(row.charLen)
    }
    table.columns[row.name] = column
    tables[row.tableName] = table
  }

  const uniqueGroups: Record<string, Record<string, string[]>> = {}

  for (const row of constraints.rows) {
    const table = tables[row.tableName]
    if (table === undefined) {
      continue
    }
    if (row.type === 'PRIMARY KEY') {
      table.primaryKey.push(row.columnName)
      const column = table.columns[row.columnName]
      if (column !== undefined) {
        column.primaryKey = true
      }
    } else {
      const byName = uniqueGroups[row.tableName] ?? {}
      const cols = byName[row.name] ?? []
      cols.push(row.columnName)
      byName[row.name] = cols
      uniqueGroups[row.tableName] = byName
    }
  }

  for (const [tableName, byName] of Object.entries(uniqueGroups)) {
    const table = tables[tableName]
    if (table === undefined) {
      continue
    }
    for (const cols of Object.values(byName)) {
      table.uniques.push(cols)
      const [single] = cols
      if (cols.length === 1 && single !== undefined) {
        const column = table.columns[single]
        if (column !== undefined) {
          column.unique = true
        }
      }
    }
  }

  const fkGroups: Record<
    string,
    Record<
      string,
      {
        columns: string[]
        referencesTable: string
        referencesColumns: string[]
        onDelete?: string
      }
    >
  > = {}

  for (const row of foreignKeys.rows) {
    const byName = fkGroups[row.tableName] ?? {}
    const existing = byName[row.name] ?? {
      columns: [],
      referencesTable: row.referencedTable,
      referencesColumns: []
    }
    existing.columns.push(row.columnName)
    existing.referencesColumns.push(row.referencedColumn)
    const deleteRule = row.deleteRule.toLowerCase()
    if (deleteRule !== 'restrict' && deleteRule !== 'no action') {
      existing.onDelete = deleteRule
    }
    byName[row.name] = existing
    fkGroups[row.tableName] = byName
  }

  for (const [tableName, byName] of Object.entries(fkGroups)) {
    const table = tables[tableName]
    if (table === undefined) {
      continue
    }
    for (const [name, fk] of Object.entries(byName)) {
      table.foreignKeys.push({
        name,
        columns: fk.columns,
        referencesTable: fk.referencesTable,
        referencesColumns: fk.referencesColumns,
        onDelete: fk.onDelete
      })
    }
  }

  return { version: 1, tables }
}
