import {
  sql,
  type CompiledQuery,
  type Expression,
  type ExpressionBuilder,
  type SqlBool
} from 'kysely'

import {
  COMPILE_ONLY,
  getConnection,
  type ActiveConnection,
  type LooseDatabase
} from './connection.js'
import { DoesNotExist, MultipleObjectsReturned } from './errors.js'
import { Field } from './fields.js'
import type { RelationSpec } from './model.js'
import { Relation } from './relations.js'

/** Lookup suffixes we understand. The trailing `__suffix` of a key selects one. */
const OPERATORS: ReadonlySet<string> = new Set([
  'exact',
  'in',
  'isnull',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'icontains',
  'startswith',
  'endswith'
])

interface FilterClause {
  readonly lookups: Record<string, unknown>
  readonly negate: boolean
}

/**
 * Django-style ordering key: a column name, or `-column` for descending.
 * `'name'` orders ascending, `'-createdAt'` orders descending.
 */
export type OrderingKey<Row> = Extract<keyof Row, string> | `-${Extract<keyof Row, string>}`

interface QuerySetState {
  readonly clauses: readonly FilterClause[]
  readonly selectedRelations: readonly string[]
  readonly ordering: readonly string[]
  readonly limitCount?: number
  readonly offsetCount?: number
}

const EMPTY_STATE: QuerySetState = {
  clauses: [],
  selectedRelations: [],
  ordering: []
}

/**
 * MySQL requires LIMIT when OFFSET is present. Mirror Django's "offset without
 * limit" behavior by passing an effectively-unlimited row count.
 */
const UNLIMITED = Number.MAX_SAFE_INTEGER

interface JoinSpec {
  readonly alias: string
  readonly parent: string
  readonly relation: RelationSpec
}

/** Split a lookup key into its column and operator (`age__gte` -> `age`, `gte`). */
export function parseLookup(key: string): { column: string; operator: string } {
  const idx = key.lastIndexOf('__')
  if (idx === -1) {
    return { column: key, operator: 'exact' }
  }
  const candidate = key.slice(idx + 2)
  if (OPERATORS.has(candidate)) {
    return { column: key.slice(0, idx), operator: candidate }
  }
  // Not a known operator (e.g. a relation path) — treat the whole key as a column.
  return { column: key, operator: 'exact' }
}

/** Escape LIKE wildcards so user input is matched literally. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

type Eb = ExpressionBuilder<LooseDatabase, string>

function compileLookup(
  eb: Eb,
  key: string,
  value: unknown,
  relations: readonly RelationSpec[],
  // When the query has joins, unqualified local columns are ambiguous if the
  // joined table shares a column name (e.g. `id`), so qualify with the table.
  qualifyTable?: string
): Expression<SqlBool> {
  const { column, operator } = parseLookup(key)
  const local = resolveColumn(column, relations).column
  const resolved =
    qualifyTable !== undefined && !local.includes('.')
      ? `${qualifyTable}.${local}`
      : local
  switch (operator) {
    case 'in':
      return eb(resolved, 'in', value as readonly unknown[])
    case 'isnull':
      return eb(resolved, value === true ? 'is' : 'is not', null)
    case 'gt':
      return eb(resolved, '>', value)
    case 'gte':
      return eb(resolved, '>=', value)
    case 'lt':
      return eb(resolved, '<', value)
    case 'lte':
      return eb(resolved, '<=', value)
    // Case-insensitive (MySQL default collation), matching Django's `icontains`.
    case 'icontains':
      return eb(resolved, 'like', `%${escapeLike(String(value))}%`)
    // Case-sensitive string lookups use LIKE BINARY, matching Django on MySQL.
    case 'contains':
      return sql<SqlBool>`${sql.ref(resolved)} like binary ${`%${escapeLike(String(value))}%`}`
    case 'startswith':
      return sql<SqlBool>`${sql.ref(resolved)} like binary ${`${escapeLike(String(value))}%`}`
    case 'endswith':
      return sql<SqlBool>`${sql.ref(resolved)} like binary ${`%${escapeLike(String(value))}`}`
    case 'exact':
    default:
      return value === null ? eb(resolved, 'is', null) : eb(resolved, '=', value)
  }
}

function resolveColumn(
  column: string,
  relations: readonly RelationSpec[]
): { column: string; joins: JoinSpec[] } {
  const { joins, remaining } = resolveRelationChain(column.split('__'), relations)
  const parent = joins.at(-1)?.alias
  if (parent === undefined || remaining.length === 0) {
    return { column, joins }
  }
  return { column: `${parent}.${remaining.join('__')}`, joins }
}

function relationForLookup(
  key: string,
  relations: readonly RelationSpec[]
): JoinSpec[] {
  const { column } = parseLookup(key)
  return resolveColumn(column, relations).joins
}

function relationNameFor(column: string, configured?: string): string {
  if (configured !== undefined) {
    return configured
  }
  return column.endsWith('Id') ? column.slice(0, -2) : column
}

function relationsFromTarget(target: {
  readonly fields?: Record<string, unknown>
  readonly relations?: Record<string, unknown>
}): RelationSpec[] {
  const specs: RelationSpec[] = []
  for (const [name, fieldDef] of Object.entries(target.fields ?? {})) {
    const field = fieldDef as Field
    const reference = field.spec.references
    if (reference !== undefined) {
      specs.push({
        name: relationNameFor(name, reference.relationName),
        kind: 'belongsTo',
        localColumn: name,
        target: reference.target,
        targetColumn: reference.column
      })
    }
  }
  for (const [name, relationDef] of Object.entries(target.relations ?? {})) {
    const relation = relationDef as Relation<Record<string, never>, boolean>
    if (relation.spec.kind === 'hasMany') {
      specs.push({
        name,
        kind: 'hasMany',
        localColumn: 'id',
        target: relation.spec.target,
        targetColumn: relation.spec.foreignKey
      })
    }
  }
  return specs
}

function resolveRelationChain(
  parts: readonly string[],
  relations: readonly RelationSpec[]
): { joins: JoinSpec[]; remaining: string[] } {
  const joins: JoinSpec[] = []
  let currentRelations = relations
  let parent = ''
  let index = 0

  while (index < parts.length) {
    const part = parts[index]
    if (part === undefined) {
      break
    }
    const relation = currentRelations.find((r) => r.name === part)
    if (relation === undefined) {
      break
    }
    const alias = parent.length === 0 ? relation.name : `${parent}__${relation.name}`
    joins.push({ alias, parent, relation })
    currentRelations = relationsFromTarget(relation.target())
    parent = alias
    index += 1
  }

  return { joins, remaining: parts.slice(index) }
}

function dedupeJoins(joins: readonly JoinSpec[]): JoinSpec[] {
  const seen = new Set<string>()
  const out: JoinSpec[] = []
  for (const join of joins) {
    if (!seen.has(join.alias)) {
      seen.add(join.alias)
      out.push(join)
    }
  }
  return out
}

function ensureNested(
  root: Record<string, unknown>,
  path: readonly string[]
): Record<string, unknown> {
  let current = root
  for (const segment of path) {
    const existing = current[segment]
    if (existing !== null && typeof existing === 'object' && !Array.isArray(existing)) {
      current = existing as Record<string, unknown>
    } else {
      const next: Record<string, unknown> = {}
      current[segment] = next
      current = next
    }
  }
  return current
}

/**
 * A lazy, immutable description of a query. Nothing touches the database until the
 * QuerySet is awaited (it is a thenable), `.fetch()`-ed, or `.get()`-ed. Chaining
 * `filter`/`exclude` returns a new QuerySet (DESIGN_PRINCIPLES.md: lazy + immutable).
 *
 * `Row` is the inferred select shape; `Lk` is the inferred lookup shape. Both come
 * from the model definition — no hand-written types.
 */
export class QuerySet<Row, Lk, Selectable extends string = never>
  implements PromiseLike<Row[]>
{
  constructor(
    private readonly tableName: string,
    private readonly relations: readonly RelationSpec[] = [],
    private readonly state: QuerySetState = EMPTY_STATE
  ) {}

  private withState(changes: Partial<QuerySetState>): QuerySetState {
    return { ...this.state, ...changes }
  }

  filter(lookups: Lk): QuerySet<Row, Lk, Selectable> {
    return new QuerySet<Row, Lk, Selectable>(
      this.tableName,
      this.relations,
      this.withState({
        clauses: [
          ...this.state.clauses,
          { lookups: lookups as Record<string, unknown>, negate: false }
        ]
      })
    )
  }

  exclude(lookups: Lk): QuerySet<Row, Lk, Selectable> {
    return new QuerySet<Row, Lk, Selectable>(
      this.tableName,
      this.relations,
      this.withState({
        clauses: [
          ...this.state.clauses,
          { lookups: lookups as Record<string, unknown>, negate: true }
        ]
      })
    )
  }

  /**
   * Order results Django-style: `orderBy('name', '-createdAt')`. A leading `-`
   * orders descending. Calling `orderBy` replaces any previous ordering.
   */
  orderBy(...keys: readonly OrderingKey<Row>[]): QuerySet<Row, Lk, Selectable> {
    return new QuerySet<Row, Lk, Selectable>(
      this.tableName,
      this.relations,
      this.withState({ ordering: keys })
    )
  }

  /** Cap the number of rows returned (SQL LIMIT). */
  limit(count: number): QuerySet<Row, Lk, Selectable> {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`limit() expects a non-negative integer, got ${count}.`)
    }
    return new QuerySet<Row, Lk, Selectable>(
      this.tableName,
      this.relations,
      this.withState({ limitCount: count })
    )
  }

  /** Skip the first `count` rows (SQL OFFSET). */
  offset(count: number): QuerySet<Row, Lk, Selectable> {
    if (!Number.isInteger(count) || count < 0) {
      throw new Error(`offset() expects a non-negative integer, got ${count}.`)
    }
    return new QuerySet<Row, Lk, Selectable>(
      this.tableName,
      this.relations,
      this.withState({ offsetCount: count })
    )
  }

  selectRelated<Path extends Selectable, NextRow = Row>(
    path: Path
  ): QuerySet<NextRow, Lk, Selectable> {
    if (resolveRelationChain(path.split('__'), this.relations).remaining.length > 0) {
      throw new Error(`Unknown relation "${path}" on ${this.tableName}.`)
    }
    return new QuerySet<NextRow, Lk, Selectable>(
      this.tableName,
      this.relations,
      this.withState({
        selectedRelations: this.state.selectedRelations.includes(path)
          ? this.state.selectedRelations
          : [...this.state.selectedRelations, path]
      })
    )
  }

  private buildBase(db: ActiveConnection) {
    let query = db.selectFrom(this.tableName)

    const joins = this.relationsToJoin()
    for (const join of joins) {
      const relation = join.relation
      const parent = join.parent.length === 0 ? this.tableName : join.parent
      query = query.leftJoin(
        `${relation.target().tableName} as ${join.alias}`,
        `${parent}.${relation.localColumn}`,
        `${join.alias}.${relation.targetColumn}`
      )
    }

    const qualifyTable = joins.length > 0 ? this.tableName : undefined
    for (const clause of this.state.clauses) {
      query = query.where((eb) => {
        const predicates = Object.entries(clause.lookups).map(([key, value]) =>
          compileLookup(eb, key, value, this.relations, qualifyTable)
        )
        const combined = eb.and(predicates)
        return clause.negate ? eb.not(combined) : combined
      })
    }
    return query
  }

  private build(db: ActiveConnection) {
    const hasJoins = this.relationsToJoin().length > 0
    let query = hasJoins
      ? this.buildBase(db).selectAll(this.tableName)
      : this.buildBase(db).selectAll()

    for (const join of this.selectedRelationJoins()) {
      for (const column of Object.keys(join.relation.target().fields ?? {})) {
        query = query.select(
          sql.ref(`${join.alias}.${column}`).as(`${join.alias}__${column}`)
        )
      }
    }

    for (const key of this.state.ordering) {
      const descending = key.startsWith('-')
      const column = descending ? key.slice(1) : key
      const qualified =
        hasJoins && !column.includes('.') ? `${this.tableName}.${column}` : column
      query = query.orderBy(sql.ref(qualified), descending ? 'desc' : 'asc')
    }

    if (this.state.limitCount !== undefined) {
      query = query.limit(this.state.limitCount)
    } else if (this.state.offsetCount !== undefined) {
      query = query.limit(UNLIMITED)
    }
    if (this.state.offsetCount !== undefined) {
      query = query.offset(this.state.offsetCount)
    }
    return query
  }

  private buildCount(db: ActiveConnection) {
    return this.buildBase(db).select((eb) => eb.fn.countAll().as('count'))
  }

  private relationsToJoin(): JoinSpec[] {
    const joins: JoinSpec[] = []
    for (const path of this.state.selectedRelations) {
      joins.push(...resolveRelationChain(path.split('__'), this.relations).joins)
    }
    for (const clause of this.state.clauses) {
      for (const key of Object.keys(clause.lookups)) {
        joins.push(...relationForLookup(key, this.relations))
      }
    }
    return dedupeJoins(joins)
  }

  private selectedRelationJoins(): JoinSpec[] {
    return dedupeJoins(
      this.state.selectedRelations.flatMap(
        (path) => resolveRelationChain(path.split('__'), this.relations).joins
      )
    )
  }

  /** Compile to SQL without a database. Used by unit tests and debugging. */
  compile(): CompiledQuery {
    return this.build(COMPILE_ONLY).compile()
  }

  /** Compile the COUNT query without a database. Used by unit tests and debugging. */
  compileCount(): CompiledQuery {
    return this.buildCount(COMPILE_ONLY).compile()
  }

  /** Execute against the active connection. */
  async fetch(): Promise<Row[]> {
    const rows = await this.build(getConnection()).execute()
    return rows.map((row) => this.inflateSelectedRelations(row)) as Row[]
  }

  /**
   * Count matching rows with SQL `COUNT(*)`. Ignores `limit`/`offset`/ordering —
   * it counts everything the filters match (Django's `QuerySet.count()`).
   */
  async count(): Promise<number> {
    const row = await this.buildCount(getConnection()).executeTakeFirstOrThrow()
    return Number(row.count)
  }

  private inflateSelectedRelations(row: Record<string, unknown>): Record<string, unknown> {
    const copy: Record<string, unknown> = { ...row }
    for (const join of this.selectedRelationJoins()) {
      const nested = ensureNested(copy, join.alias.split('__'))
      for (const column of Object.keys(join.relation.target().fields ?? {})) {
        const key = `${join.alias}__${column}`
        nested[column] = copy[key]
        delete copy[key]
      }
    }
    return copy
  }

  then<TResult1 = Row[], TResult2 = never>(
    onfulfilled?:
      | ((value: Row[]) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?:
      | ((reason: unknown) => TResult2 | PromiseLike<TResult2>)
      | null
  ): PromiseLike<TResult1 | TResult2> {
    return this.fetch().then(onfulfilled, onrejected)
  }

  /** Return exactly one row, or throw `DoesNotExist` / `MultipleObjectsReturned`. */
  async get(lookups?: Lk): Promise<Row> {
    const target = lookups === undefined ? this : this.filter(lookups)
    const rows = await target.fetch()
    const [first, second] = rows
    if (first === undefined) {
      throw new DoesNotExist(this.tableName)
    }
    if (second !== undefined) {
      throw new MultipleObjectsReturned(this.tableName, rows.length)
    }
    return first
  }
}
