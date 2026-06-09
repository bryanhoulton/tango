import type { Fields } from '@tango-ts/core-types'
import { Field, type ColumnType } from '@tango-ts/orm'

export interface SnapshotModel {
  readonly tableName: string
  readonly fields: Fields
}

/** A normalized, serializable description of one column. */
export interface ColumnSnapshot {
  name: string
  type: ColumnType
  nullable: boolean
  hasDefault: boolean
  default?: unknown
  autoIncrement: boolean
  primaryKey: boolean
  unique: boolean
  maxLength?: number
  /** Present only when true — keeps snapshots stable for columns that don't use it. */
  autoNow?: boolean
  autoNowAdd?: boolean
}

/** A normalized single-column foreign key constraint. */
export interface ForeignKeySnapshot {
  name: string
  columns: string[]
  referencesTable: string
  referencesColumns: string[]
  onDelete?: string
}

/** A normalized description of one table. */
export interface TableSnapshot {
  name: string
  columns: Record<string, ColumnSnapshot>
  /** Column names that form the primary key (usually one). */
  primaryKey: string[]
  /** Each entry is a set of column names forming a unique constraint. */
  uniques: string[][]
  foreignKeys: ForeignKeySnapshot[]
}

/** The full expected/target schema. Persisted with each migration and diffed. */
export interface SchemaSnapshot {
  version: 1
  tables: Record<string, TableSnapshot>
}

export function foreignKeyName(table: string, columns: readonly string[]): string {
  return `${table}_${columns.join('_')}_fk`
}

function columnFromField(name: string, field: Field): ColumnSnapshot {
  const { spec } = field
  const column: ColumnSnapshot = {
    name,
    type: spec.columnType,
    nullable: spec.nullable,
    hasDefault: spec.hasDefault,
    autoIncrement: spec.autoIncrement,
    primaryKey: spec.primaryKey,
    unique: spec.unique
  }
  if (spec.maxLength !== undefined) {
    column.maxLength = spec.maxLength
  }
  if (spec.defaultValue !== undefined) {
    column.default = spec.defaultValue
  }
  if (spec.autoNow === true) {
    column.autoNow = true
  }
  if (spec.autoNowAdd === true) {
    column.autoNowAdd = true
  }
  return column
}

/** Build a `TableSnapshot` from a single model's field map. */
export function buildTableSnapshot(model: SnapshotModel): TableSnapshot {
  const columns: Record<string, ColumnSnapshot> = {}
  const primaryKey: string[] = []
  const uniques: string[][] = []
  const foreignKeys: ForeignKeySnapshot[] = []

  for (const [name, fieldDef] of Object.entries(model.fields)) {
    const field = fieldDef as Field
    const column = columnFromField(name, field)
    columns[name] = column
    if (column.primaryKey) {
      primaryKey.push(name)
    }
    if (column.unique) {
      uniques.push([name])
    }
    // `dbConstraint: false` keeps the reference for joins/typing but emits no
    // FOREIGN KEY DDL — required on databases that reject FK constraints
    // (PlanetScale/Vitess).
    if (field.spec.references !== undefined && field.spec.references.dbConstraint !== false) {
      const reference = field.spec.references
      const target = reference.target()
      const fk: ForeignKeySnapshot = {
        name: foreignKeyName(model.tableName, [name]),
        columns: [name],
        referencesTable: target.tableName,
        referencesColumns: [reference.column]
      }
      if (reference.onDelete !== undefined) {
        fk.onDelete = reference.onDelete
      }
      foreignKeys.push(fk)
    }
  }

  return { name: model.tableName, columns, primaryKey, uniques, foreignKeys }
}

/** Build the full schema snapshot from all registered models. */
export function buildSnapshot(
  models: ReadonlyArray<SnapshotModel>
): SchemaSnapshot {
  const tables: Record<string, TableSnapshot> = {}
  for (const model of models) {
    tables[model.tableName] = buildTableSnapshot(model)
  }
  return { version: 1, tables }
}

/** An empty snapshot — the "from" state before any migrations exist. */
export function emptySnapshot(): SchemaSnapshot {
  return { version: 1, tables: {} }
}
