import type {
  FieldDef,
  FieldValue,
  Fields,
  Relations
} from '@tango-ts/core-types'

/** Physical column types we know how to emit (extended as migrations grow). */
export type ColumnType =
  | 'int'
  | 'float'
  | 'varchar'
  | 'text'
  | 'boolean'
  | 'datetime'
  | 'date'

/** MySQL referential actions supported by the first FK slice. */
export type ReferentialAction =
  | 'cascade'
  | 'restrict'
  | 'set null'
  | 'no action'

/** Minimal shape needed to resolve a referenced model without importing Model. */
export interface ReferenceTarget {
  readonly tableName: string
  readonly fields?: Fields
  readonly relations?: Relations
}

/** Runtime metadata for a foreign key constraint. */
export interface ReferenceSpec {
  readonly target: () => ReferenceTarget
  readonly column: string
  readonly relationName?: string
  readonly onDelete?: ReferentialAction
  /**
   * When `false`, migrations emit a plain column without FOREIGN KEY DDL
   * (Django's `db_constraint=False`). The reference still powers joins and
   * typing — only the database-level constraint is skipped. Required on
   * databases that reject FK constraints, like PlanetScale (Vitess).
   */
  readonly dbConstraint?: boolean
}

/** Runtime metadata describing a single column. Read by migrations and managers. */
export interface FieldSpec {
  readonly columnType: ColumnType
  readonly nullable: boolean
  /** Optional on insert: DB default, auto-increment, or auto-now. */
  readonly hasDefault: boolean
  readonly primaryKey: boolean
  readonly autoIncrement: boolean
  readonly unique: boolean
  readonly maxLength?: number
  readonly defaultValue?: unknown
  readonly autoNow?: boolean
  readonly autoNowAdd?: boolean
  readonly references?: ReferenceSpec
}

const BASE: Omit<FieldSpec, 'columnType'> = {
  nullable: false,
  hasDefault: false,
  primaryKey: false,
  autoIncrement: false,
  unique: false
}

/**
 * Runtime field builder. Its three type parameters mirror `FieldDef` exactly so
 * the inference engine in `@tango-ts/core-types` can read a model's shape. The
 * phantom markers are `declare`d (zero runtime). Builder methods are immutable:
 * each returns a new `Field` carrying the updated type parameters.
 */
export class Field<
  TsType = unknown,
  Nullable extends boolean = false,
  HasDefault extends boolean = false,
  RelatedFields extends Fields | undefined = undefined
> implements FieldDef<TsType, Nullable, HasDefault, RelatedFields>
{
  declare readonly __tsType: TsType
  declare readonly __nullable: Nullable
  declare readonly __hasDefault: HasDefault
  declare readonly __relatedFields: RelatedFields

  constructor(readonly spec: FieldSpec) {}

  private patch<N extends boolean = Nullable, D extends boolean = HasDefault>(
    changes: Partial<FieldSpec>
  ): Field<TsType, N, D, RelatedFields> {
    return new Field<TsType, N, D, RelatedFields>({
      ...this.spec,
      ...changes
    })
  }

  nullable(): Field<TsType, true, HasDefault, RelatedFields> {
    return this.patch<true, HasDefault>({ nullable: true })
  }

  primaryKey(): Field<TsType, Nullable, HasDefault, RelatedFields> {
    return this.patch({ primaryKey: true })
  }

  autoIncrement(): Field<TsType, Nullable, true, RelatedFields> {
    return this.patch<Nullable, true>({ autoIncrement: true, hasDefault: true })
  }

  unique(): Field<TsType, Nullable, HasDefault, RelatedFields> {
    return this.patch({ unique: true })
  }

  default(value: TsType): Field<TsType, Nullable, true, RelatedFields> {
    return this.patch<Nullable, true>({ hasDefault: true, defaultValue: value })
  }

  /** Set on create only (`auto_now_add`). Marks the field optional on insert. */
  autoNowAdd(): Field<TsType, Nullable, true, RelatedFields> {
    return this.patch<Nullable, true>({ hasDefault: true, autoNowAdd: true })
  }

  /** Set on every save (`auto_now`). Marks the field optional on insert. */
  autoNow(): Field<TsType, Nullable, true, RelatedFields> {
    return this.patch<Nullable, true>({ hasDefault: true, autoNow: true })
  }
}

/**
 * Field constructors. The 90% case is pure declaration (DESIGN_PRINCIPLES.md P4):
 * pick a builder, chain modifiers, done.
 */
export const f = {
  int: (): Field<number> => new Field<number>({ ...BASE, columnType: 'int' }),
  float: (): Field<number> => new Field<number>({ ...BASE, columnType: 'float' }),
  varchar: (maxLength: number): Field<string> =>
    new Field<string>({ ...BASE, columnType: 'varchar', maxLength }),
  text: (): Field<string> => new Field<string>({ ...BASE, columnType: 'text' }),
  boolean: (): Field<boolean> =>
    new Field<boolean>({ ...BASE, columnType: 'boolean' }),
  datetime: (): Field<Date> =>
    new Field<Date>({ ...BASE, columnType: 'datetime' }),
  date: (): Field<Date> => new Field<Date>({ ...BASE, columnType: 'date' }),
  foreignKey: <
    Target extends ReferenceTarget & { readonly fields: Fields },
    Column extends keyof Target['fields'] & string
  >(
    target: () => Target,
    column: Column,
    options: {
      onDelete?: ReferentialAction
      relationName?: string
      /** Set `false` to skip FOREIGN KEY DDL (required on PlanetScale/Vitess). */
      dbConstraint?: boolean
    } = {}
  ): Field<FieldValue<Target['fields'][Column]>, false, false, Target['fields']> =>
    new Field<FieldValue<Target['fields'][Column]>, false, false, Target['fields']>({
      ...BASE,
      columnType: 'int',
      references: {
        target,
        column,
        onDelete: options.onDelete,
        relationName: options.relationName,
        dbConstraint: options.dbConstraint
      }
    })
} as const
