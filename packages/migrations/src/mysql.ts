import type { Operation } from './operations.js'
import type {
  ColumnSnapshot,
  ForeignKeySnapshot,
  TableSnapshot
} from './snapshot.js'

/** SQL produced for an operation: forward statements and their inverse. */
export interface RenderedSql {
  up: string[]
  down: string[]
}

function q(identifier: string): string {
  return `\`${identifier}\``
}

function columnList(columns: string[]): string {
  return columns.map(q).join(', ')
}

function onDeleteClause(fk: ForeignKeySnapshot): string {
  return fk.onDelete === undefined ? '' : ` ON DELETE ${fk.onDelete.toUpperCase()}`
}

/** Deterministic name for a unique constraint so up/down agree. */
export function uniqueName(table: string, columns: string[]): string {
  return `${table}_${columns.join('_')}_uniq`
}

function mysqlType(column: ColumnSnapshot): string {
  switch (column.type) {
    case 'int':
      return 'int'
    case 'float':
      return 'double'
    case 'varchar':
      return `varchar(${column.maxLength ?? 255})`
    case 'text':
      return 'text'
    case 'boolean':
      return 'tinyint(1)'
    case 'datetime':
      return 'datetime'
    case 'date':
      return 'date'
  }
}

function literal(value: unknown): string {
  if (value === null) {
    return 'NULL'
  }
  if (typeof value === 'string') {
    return `'${value.replace(/'/g, "''")}'`
  }
  if (typeof value === 'number') {
    return String(value)
  }
  if (typeof value === 'boolean') {
    return value ? '1' : '0'
  }
  throw new Error(`Cannot render default literal for value: ${JSON.stringify(value)}`)
}

function defaultClause(column: ColumnSnapshot): string | undefined {
  if (column.autoIncrement) {
    return undefined
  }
  if (column.default !== undefined) {
    return `DEFAULT ${literal(column.default)}`
  }
  if (column.autoNowAdd === true) {
    return 'DEFAULT CURRENT_TIMESTAMP'
  }
  if (column.autoNow === true) {
    return 'DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP'
  }
  return undefined
}

/** Render a single column definition (used by create, add, alter, and reversals). */
export function renderColumnDefinition(column: ColumnSnapshot): string {
  const parts = [q(column.name), mysqlType(column)]
  parts.push(column.nullable ? 'NULL' : 'NOT NULL')
  const def = defaultClause(column)
  if (def !== undefined) {
    parts.push(def)
  }
  if (column.autoIncrement) {
    parts.push('AUTO_INCREMENT')
  }
  return parts.join(' ')
}

function renderCreateTable(table: TableSnapshot): string {
  const lines = Object.values(table.columns).map(renderColumnDefinition)
  if (table.primaryKey.length > 0) {
    lines.push(`PRIMARY KEY (${columnList(table.primaryKey)})`)
  }
  for (const columns of table.uniques) {
    lines.push(`UNIQUE ${q(uniqueName(table.name, columns))} (${columnList(columns)})`)
  }
  return `CREATE TABLE ${q(table.name)} (${lines.join(', ')})`
}

function renderAddForeignKey(table: string, fk: ForeignKeySnapshot): string {
  return [
    `ALTER TABLE ${q(table)} ADD CONSTRAINT ${q(fk.name)}`,
    `FOREIGN KEY (${columnList(fk.columns)})`,
    `REFERENCES ${q(fk.referencesTable)} (${columnList(fk.referencesColumns)})${onDeleteClause(fk)}`
  ].join(' ')
}

/** Render one operation to forward + reverse MySQL DDL. */
export function renderOperation(op: Operation): RenderedSql {
  switch (op.kind) {
    case 'createTable':
      return {
        up: [renderCreateTable(op.table)],
        down: [`DROP TABLE ${q(op.table.name)}`]
      }
    case 'dropTable':
      return {
        up: [`DROP TABLE ${q(op.table.name)}`],
        down: [renderCreateTable(op.table)]
      }
    case 'renameTable':
      return {
        up: [`RENAME TABLE ${q(op.from)} TO ${q(op.to)}`],
        down: [`RENAME TABLE ${q(op.to)} TO ${q(op.from)}`]
      }
    case 'addColumn':
      return {
        up: [
          `ALTER TABLE ${q(op.table)} ADD COLUMN ${renderColumnDefinition(op.column)}`
        ],
        down: [`ALTER TABLE ${q(op.table)} DROP COLUMN ${q(op.column.name)}`]
      }
    case 'dropColumn':
      return {
        up: [`ALTER TABLE ${q(op.table)} DROP COLUMN ${q(op.column.name)}`],
        down: [
          `ALTER TABLE ${q(op.table)} ADD COLUMN ${renderColumnDefinition(op.column)}`
        ]
      }
    case 'alterColumn':
      return {
        up: [
          `ALTER TABLE ${q(op.table)} MODIFY COLUMN ${renderColumnDefinition(op.to)}`
        ],
        down: [
          `ALTER TABLE ${q(op.table)} MODIFY COLUMN ${renderColumnDefinition(op.from)}`
        ]
      }
    case 'renameColumn':
      return {
        up: [
          `ALTER TABLE ${q(op.table)} RENAME COLUMN ${q(op.from)} TO ${q(op.to)}`
        ],
        down: [
          `ALTER TABLE ${q(op.table)} RENAME COLUMN ${q(op.to)} TO ${q(op.from)}`
        ]
      }
    case 'addUnique':
      return {
        up: [
          `ALTER TABLE ${q(op.table)} ADD UNIQUE ${q(uniqueName(op.table, op.columns))} (${columnList(op.columns)})`
        ],
        down: [
          `ALTER TABLE ${q(op.table)} DROP INDEX ${q(uniqueName(op.table, op.columns))}`
        ]
      }
    case 'dropUnique':
      return {
        up: [
          `ALTER TABLE ${q(op.table)} DROP INDEX ${q(uniqueName(op.table, op.columns))}`
        ],
        down: [
          `ALTER TABLE ${q(op.table)} ADD UNIQUE ${q(uniqueName(op.table, op.columns))} (${columnList(op.columns)})`
        ]
      }
    case 'addForeignKey':
      return {
        up: [renderAddForeignKey(op.table, op.foreignKey)],
        down: [
          `ALTER TABLE ${q(op.table)} DROP FOREIGN KEY ${q(op.foreignKey.name)}`
        ]
      }
    case 'dropForeignKey':
      return {
        up: [
          `ALTER TABLE ${q(op.table)} DROP FOREIGN KEY ${q(op.foreignKey.name)}`
        ],
        down: [renderAddForeignKey(op.table, op.foreignKey)]
      }
    case 'runSql':
      return { up: [op.up], down: [op.down] }
  }
}

/** Render a full ordered operation list. Reversal runs operations back-to-front. */
export function renderOperations(operations: Operation[]): RenderedSql {
  const up: string[] = []
  for (const op of operations) {
    up.push(...renderOperation(op).up)
  }
  const down: string[] = []
  for (const op of [...operations].reverse()) {
    down.push(...renderOperation(op).down)
  }
  return { up, down }
}
