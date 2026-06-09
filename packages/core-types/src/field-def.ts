/**
 * The type-level description of a model field. The three phantom markers carry
 * everything the inference engine needs:
 *
 * - `TsType`     the TypeScript type of a non-null value of this column
 * - `Nullable`   whether the column may be `null`
 * - `HasDefault` whether a value is optional on insert (DB default, auto-increment,
 *                or auto-now), i.e. the caller may omit it
 *
 * These are phantom (`__`-prefixed) so the runtime `Field` class in `@tango-ts/orm`
 * can `declare` them with zero runtime cost while still satisfying this contract.
 * There is intentionally no runtime in this package (DESIGN_PRINCIPLES.md P2).
 */
export interface FieldDef<
  TsType = unknown,
  Nullable extends boolean = boolean,
  HasDefault extends boolean = boolean,
  RelatedFields extends Fields | undefined = undefined
> {
  readonly __tsType: TsType
  readonly __nullable: Nullable
  readonly __hasDefault: HasDefault
  readonly __relatedFields: RelatedFields
}

/** A field whose specifics are unknown — the constraint for "any field" without `any`. */
export type AnyFieldDef = FieldDef<
  unknown,
  boolean,
  boolean,
  Fields | undefined
>

/** A model's field map: column name -> field definition. */
export type Fields = Record<string, AnyFieldDef>

export interface RelationDef<
  RelatedFields extends Fields = Fields,
  Many extends boolean = boolean
> {
  readonly __relatedFields: RelatedFields
  readonly __many: Many
}

export type AnyRelationDef = RelationDef<Fields, boolean>
export type Relations = Record<string, AnyRelationDef>

/** The runtime value of a field, accounting for nullability. */
export type FieldValue<F extends AnyFieldDef> = F extends FieldDef<
  infer T,
  infer N,
  boolean,
  Fields | undefined
>
  ? N extends true
    ? T | null
    : T
  : never
