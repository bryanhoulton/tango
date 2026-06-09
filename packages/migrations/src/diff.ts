import type { Operation } from './operations.js'
import type {
  ColumnSnapshot,
  SchemaSnapshot,
  TableSnapshot
} from './snapshot.js'

export interface RenamePair {
  from: string
  to: string
}

export interface RenameHints {
  /** Renamed tables (old name -> new name). */
  tables?: RenamePair[]
  /** Renamed columns, keyed by the table's CURRENT (target) name. */
  columns?: Record<string, RenamePair[]>
}

export interface DiffOptions {
  renames?: RenameHints
}

/** Compare two columns ignoring their name (names are handled by rename ops). */
function columnsEqual(a: ColumnSnapshot, b: ColumnSnapshot): boolean {
  return (
    a.type === b.type &&
    a.nullable === b.nullable &&
    a.hasDefault === b.hasDefault &&
    a.default === b.default &&
    a.autoIncrement === b.autoIncrement &&
    a.primaryKey === b.primaryKey &&
    a.unique === b.unique &&
    a.maxLength === b.maxLength
  )
}

function sortedEntries<T>(record: Record<string, T>): Array<[string, T]> {
  return Object.entries(record).sort(([a], [b]) => a.localeCompare(b))
}

function uniqueKey(columns: string[]): string {
  return [...columns].sort((a, b) => a.localeCompare(b)).join(',')
}

function foreignKeyKey(fk: TableSnapshot['foreignKeys'][number]): string {
  return [
    uniqueKey(fk.columns),
    fk.referencesTable,
    uniqueKey(fk.referencesColumns),
    fk.onDelete ?? ''
  ].join('|')
}

function diffColumns(
  table: string,
  from: TableSnapshot,
  to: TableSnapshot,
  renames: RenamePair[]
): Operation[] {
  const ops: Operation[] = []
  const renameToFrom = new Map(renames.map((r) => [r.to, r.from]))
  const renamedFromNames = new Set(renames.map((r) => r.from))

  for (const rename of renames) {
    ops.push({ kind: 'renameColumn', table, from: rename.from, to: rename.to })
  }

  // Added: in `to`, with no corresponding `from` column (after rename mapping).
  for (const [name, column] of sortedEntries(to.columns)) {
    const origin = renameToFrom.get(name) ?? name
    if (from.columns[origin] === undefined) {
      ops.push({ kind: 'addColumn', table, column })
    }
  }

  // Altered: present in both, attributes differ.
  for (const [name, toColumn] of sortedEntries(to.columns)) {
    const origin = renameToFrom.get(name) ?? name
    const fromColumn = from.columns[origin]
    if (fromColumn !== undefined && !columnsEqual(fromColumn, toColumn)) {
      ops.push({ kind: 'alterColumn', table, from: fromColumn, to: toColumn })
    }
  }

  // Dropped: in `from`, not renamed away, not present in `to`.
  for (const [name, column] of sortedEntries(from.columns)) {
    if (renamedFromNames.has(name)) {
      continue
    }
    if (to.columns[name] === undefined) {
      ops.push({ kind: 'dropColumn', table, column })
    }
  }

  return ops
}

function diffUniques(
  table: string,
  from: TableSnapshot,
  to: TableSnapshot
): Operation[] {
  const ops: Operation[] = []
  const fromKeys = new Map(from.uniques.map((u) => [uniqueKey(u), u]))
  const toKeys = new Map(to.uniques.map((u) => [uniqueKey(u), u]))

  for (const [key, columns] of [...toKeys].sort(([a], [b]) => a.localeCompare(b))) {
    if (!fromKeys.has(key)) {
      ops.push({ kind: 'addUnique', table, columns })
    }
  }
  for (const [key, columns] of [...fromKeys].sort(([a], [b]) => a.localeCompare(b))) {
    if (!toKeys.has(key)) {
      ops.push({ kind: 'dropUnique', table, columns })
    }
  }
  return ops
}

function dropForeignKeys(
  table: string,
  from: TableSnapshot,
  to: TableSnapshot
): Operation[] {
  const ops: Operation[] = []
  const toKeys = new Set(to.foreignKeys.map(foreignKeyKey))
  for (const fk of [...from.foreignKeys].sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (!toKeys.has(foreignKeyKey(fk))) {
      ops.push({ kind: 'dropForeignKey', table, foreignKey: fk })
    }
  }
  return ops
}

function addForeignKeys(
  table: string,
  from: TableSnapshot | undefined,
  to: TableSnapshot
): Operation[] {
  const ops: Operation[] = []
  const fromKeys = new Set((from?.foreignKeys ?? []).map(foreignKeyKey))
  for (const fk of [...to.foreignKeys].sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (!fromKeys.has(foreignKeyKey(fk))) {
      ops.push({ kind: 'addForeignKey', table, foreignKey: fk })
    }
  }
  return ops
}

/**
 * The autodetector. Diffs the `from` (expected) snapshot against the `to` (target)
 * snapshot and returns an ordered, deterministic list of operations.
 *
 * Renames are never guessed here — they are supplied explicitly via `options.renames`
 * (the CLI fills these from an interactive prompt or `renamedFrom()` hints). Use
 * `detectRenameCandidates` to find the ambiguous drop+add pairs worth prompting about.
 */
export function diffSnapshots(
  from: SchemaSnapshot,
  to: SchemaSnapshot,
  options: DiffOptions = {}
): Operation[] {
  const ops: Operation[] = []
  const tableRenames = options.renames?.tables ?? []
  const renameFromTo = new Map(tableRenames.map((r) => [r.from, r.to]))
  const renameToFrom = new Map(tableRenames.map((r) => [r.to, r.from]))

  for (const rename of tableRenames) {
    ops.push({ kind: 'renameTable', from: rename.from, to: rename.to })
  }

  // Created tables (in `to`, with no source table in `from`).
  for (const [name, table] of sortedEntries(to.tables)) {
    const origin = renameToFrom.get(name) ?? name
    if (from.tables[origin] === undefined) {
      ops.push({ kind: 'createTable', table })
    }
  }

  // Retained tables: diff their columns and unique constraints.
  for (const [name, toTable] of sortedEntries(to.tables)) {
    const origin = renameToFrom.get(name) ?? name
    const fromTable = from.tables[origin]
    if (fromTable === undefined) {
      continue
    }
    const columnRenames = options.renames?.columns?.[name] ?? []
    ops.push(...dropForeignKeys(name, fromTable, toTable))
    ops.push(...diffColumns(name, fromTable, toTable, columnRenames))
    ops.push(...diffUniques(name, fromTable, toTable))
  }

  // Foreign keys are added after every table/column they may reference exists.
  for (const [name, toTable] of sortedEntries(to.tables)) {
    const origin = renameToFrom.get(name) ?? name
    ops.push(...addForeignKeys(name, from.tables[origin], toTable))
  }

  // Dropped tables (in `from`, not renamed, not present in `to`).
  for (const [name, table] of sortedEntries(from.tables)) {
    const renamedTo = renameFromTo.get(name)
    const stillExists =
      renamedTo === undefined
        ? to.tables[name] !== undefined
        : to.tables[renamedTo] !== undefined
    if (!stillExists) {
      ops.push({ kind: 'dropTable', table })
    }
  }

  return ops
}

export interface RenameCandidate {
  table: string
  from: string
  to: string
}

/**
 * Find ambiguous rename candidates: within a retained table, a dropped column and an
 * added column with structurally identical attributes. The interactive CLI asks the
 * developer to confirm each; in non-interactive mode the caller must resolve these
 * (via hints) or fail — never silently drop+add (data loss).
 */
export function detectRenameCandidates(
  from: SchemaSnapshot,
  to: SchemaSnapshot
): RenameCandidate[] {
  const candidates: RenameCandidate[] = []

  for (const [name, toTable] of sortedEntries(to.tables)) {
    const fromTable = from.tables[name]
    if (fromTable === undefined) {
      continue
    }
    const dropped = sortedEntries(fromTable.columns).filter(
      ([colName]) => toTable.columns[colName] === undefined
    )
    const added = sortedEntries(toTable.columns).filter(
      ([colName]) => fromTable.columns[colName] === undefined
    )
    for (const [fromCol, fromColumn] of dropped) {
      for (const [toCol, toColumn] of added) {
        if (columnsEqual(fromColumn, toColumn)) {
          candidates.push({ table: name, from: fromCol, to: toCol })
        }
      }
    }
  }

  return candidates
}
