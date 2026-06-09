import type {
  ColumnSnapshot,
  ForeignKeySnapshot,
  TableSnapshot
} from './snapshot.js'

/**
 * The typed, serializable, reversible migration IR. The autodetector produces an
 * ordered list of these; renderers (a later slice) turn each into forward/back
 * MySQL DDL. `runSql` is the explicit, narrow escape hatch for anything the
 * declarative layer cannot express (incl. data migrations) — DESIGN_PRINCIPLES.md P4.
 */
export type Operation =
  | { kind: 'createTable'; table: TableSnapshot }
  | { kind: 'dropTable'; table: TableSnapshot }
  | { kind: 'renameTable'; from: string; to: string }
  | { kind: 'addColumn'; table: string; column: ColumnSnapshot }
  | { kind: 'dropColumn'; table: string; column: ColumnSnapshot }
  | { kind: 'alterColumn'; table: string; from: ColumnSnapshot; to: ColumnSnapshot }
  | { kind: 'renameColumn'; table: string; from: string; to: string }
  | { kind: 'addUnique'; table: string; columns: string[] }
  | { kind: 'dropUnique'; table: string; columns: string[] }
  | { kind: 'addForeignKey'; table: string; foreignKey: ForeignKeySnapshot }
  | { kind: 'dropForeignKey'; table: string; foreignKey: ForeignKeySnapshot }
  | { kind: 'runSql'; up: string; down: string }

export type OperationKind = Operation['kind']
