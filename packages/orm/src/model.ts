import type {
  Fields,
  InferInsert,
  InferSelect,
  InferUpdate,
  Lookups,
  Relations,
  SelectRelatedPath,
  SelectRelatedResult
} from '@tango-ts/core-types'

import { getConnection } from './connection.js'
import { Field } from './fields.js'
import { QuerySet } from './queryset.js'
import { Relation } from './relations.js'

type NoRelations = Record<never, never>

export interface RelationSpec {
  readonly name: string
  readonly kind: 'belongsTo' | 'hasMany'
  readonly localColumn: string
  readonly target: () => {
    readonly tableName: string
    readonly fields?: Fields
    readonly relations?: Relations
  }
  readonly targetColumn: string
}

function relationNameFor(column: string, configured?: string): string {
  if (configured !== undefined) {
    return configured
  }
  return column.endsWith('Id') ? column.slice(0, -2) : column
}

/**
 * The default manager (`Model.objects`). Provides the declarative query entrypoints;
 * all heavy lifting lives in the lazy `QuerySet`. Types flow from the model's field
 * map — `objects.filter`, `.create`, etc. are all inferred (DESIGN_PRINCIPLES.md P2).
 */
export class Manager<F extends Fields, R extends Relations = NoRelations> {
  private readonly pkColumn: string | undefined
  private readonly pkAutoIncrement: boolean
  private readonly relations: readonly RelationSpec[]

  constructor(
    private readonly tableName: string,
    fields: F,
    declaredRelations: R
  ) {
    let pk: string | undefined
    let auto = false
    const relations: RelationSpec[] = []
    for (const [name, field] of Object.entries(fields)) {
      const { spec } = field as Field
      if (spec.primaryKey) {
        pk = name
        auto = spec.autoIncrement
      }
      if (spec.references !== undefined) {
        relations.push({
          name: relationNameFor(name, spec.references.relationName),
          kind: 'belongsTo',
          localColumn: name,
          target: spec.references.target,
          targetColumn: spec.references.column
        })
      }
    }
    for (const [name, relationDef] of Object.entries(declaredRelations)) {
      const relation = relationDef as Relation<Fields, boolean>
      if (relation.spec.kind === 'hasMany') {
        relations.push({
          name,
          kind: 'hasMany',
          localColumn: 'id',
          target: relation.spec.target,
          targetColumn: relation.spec.foreignKey
        })
      }
    }
    this.pkColumn = pk
    this.pkAutoIncrement = auto
    this.relations = relations
  }

  all(): QuerySet<InferSelect<F>, Lookups<F, R>, SelectRelatedPath<F, R>> {
    return new QuerySet<InferSelect<F>, Lookups<F, R>, SelectRelatedPath<F, R>>(
      this.tableName,
      this.relations
    )
  }

  filter(
    lookups: Lookups<F, R>
  ): QuerySet<InferSelect<F>, Lookups<F, R>, SelectRelatedPath<F, R>> {
    return this.all().filter(lookups)
  }

  exclude(
    lookups: Lookups<F, R>
  ): QuerySet<InferSelect<F>, Lookups<F, R>, SelectRelatedPath<F, R>> {
    return this.all().exclude(lookups)
  }

  get(lookups: Lookups<F, R>): Promise<InferSelect<F>> {
    return this.all().get(lookups)
  }

  count(): Promise<number> {
    return this.all().count()
  }

  selectRelated<Path extends SelectRelatedPath<F, R> & string>(
    path: Path
  ): QuerySet<
    SelectRelatedResult<InferSelect<F>, F, R, Path>,
    Lookups<F, R>,
    SelectRelatedPath<F, R>
  > {
    return this.all().selectRelated<
      Path,
      SelectRelatedResult<InferSelect<F>, F, R, Path>
    >(path)
  }

  async create(data: InferInsert<F>): Promise<InferSelect<F>> {
    const db = getConnection()
    const result = await db
      .insertInto(this.tableName)
      .values(data)
      .executeTakeFirstOrThrow()

    if (
      this.pkColumn !== undefined &&
      this.pkAutoIncrement &&
      result.insertId !== undefined
    ) {
      const row = await db
        .selectFrom(this.tableName)
        .selectAll()
        .where(this.pkColumn, '=', Number(result.insertId))
        .executeTakeFirstOrThrow()
      return row as InferSelect<F>
    }

    if (this.pkColumn !== undefined) {
      const pkValue = (data as Record<string, unknown>)[this.pkColumn]
      const row = await db
        .selectFrom(this.tableName)
        .selectAll()
        .where(this.pkColumn, '=', pkValue)
        .executeTakeFirstOrThrow()
      return row as InferSelect<F>
    }

    return data as unknown as InferSelect<F>
  }

  async update(
    lookups: Lookups<F, R>,
    data: InferUpdate<F>
  ): Promise<InferSelect<F>> {
    const db = getConnection()
    let query = db.updateTable(this.tableName).set(data)
    for (const [key, value] of Object.entries(lookups as Record<string, unknown>)) {
      if (key.includes('__')) {
        throw new Error('Manager.update currently supports exact lookups only.')
      }
      query = query.where(key, '=', value)
    }
    await query.execute()
    return this.get(lookups)
  }

  async delete(lookups: Lookups<F, R>): Promise<void> {
    const db = getConnection()
    let query = db.deleteFrom(this.tableName)
    for (const [key, value] of Object.entries(lookups as Record<string, unknown>)) {
      if (key.includes('__')) {
        throw new Error('Manager.delete currently supports exact lookups only.')
      }
      query = query.where(key, '=', value)
    }
    await query.execute()
  }
}

/** A declared model: its table name, field map, and default manager. */
export interface Model<
  Name extends string,
  F extends Fields,
  R extends Relations = NoRelations
> {
  readonly tableName: Name
  readonly fields: F
  readonly relations: R
  readonly objects: Manager<F, R>
}

export interface ModelOptions<R extends Relations = NoRelations> {
  readonly relations?: R
}

/**
 * Declare a model. This is the single source of truth from which every type
 * (select / insert / update / lookups) and the runtime manager are derived.
 *
 * ```ts
 * const User = model('users', {
 *   id: f.int().primaryKey().autoIncrement(),
 *   email: f.varchar(255).unique(),
 *   age: f.int().nullable()
 * })
 * ```
 */
export function model<
  Name extends string,
  F extends Fields,
  R extends Relations = NoRelations
>(
  tableName: Name,
  fields: F,
  options: ModelOptions<R> = {}
): Model<Name, F, R> {
  const relations = (options.relations ?? {}) as R
  return {
    tableName,
    fields,
    relations,
    objects: new Manager<F, R>(tableName, fields, relations)
  }
}
