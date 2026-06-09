import type {
  AnyFieldDef,
  FieldDef,
  Fields,
  FieldValue,
  RelationDef,
  Relations
} from './field-def.js'
import type { Prettify, UnionToIntersection } from './utils.js'

/**
 * The shape of a row as read from the database (Django's `Model` instance / a
 * serializer's representation). Nullable fields include `null`.
 */
export type InferSelect<F extends Fields> = Prettify<{
  [K in keyof F]: FieldValue<F[K]>
}>

// --- Insert inference -------------------------------------------------------
// A field is optional on insert when it is nullable OR has a default
// (DB default / auto-increment / auto-now). Everything else is required.

type OptionalInsertKeys<F extends Fields> = {
  [K in keyof F]: F[K] extends FieldDef<unknown, infer N, infer D>
    ? N extends true
      ? K
      : D extends true
        ? K
        : never
    : never
}[keyof F]

type RequiredInsertKeys<F extends Fields> = Exclude<keyof F, OptionalInsertKeys<F>>

/** The shape accepted when creating a row (`Model.objects.create(...)`). */
export type InferInsert<F extends Fields> = Prettify<
  { [K in RequiredInsertKeys<F>]: FieldValue<F[K]> } & {
    [K in OptionalInsertKeys<F>]?: FieldValue<F[K]>
  }
>

/** Partial shape accepted when updating rows. */
export type InferUpdate<F extends Fields> = Prettify<{
  [K in keyof F]?: FieldValue<F[K]>
}>

// --- Lookup inference -------------------------------------------------------
// Each field expands into exactly the lookups valid for its value type, mirroring
// Django's field lookups (DESIGN_PRINCIPLES.md P2). This is the high-value type.

type Base<F extends AnyFieldDef> = NonNullable<FieldValue<F>>

/** Lookups valid for every field type. */
type CommonLookups<K extends string, V> = {
  [P in K | `${K}__exact`]?: V
} & {
  [P in `${K}__in`]?: readonly V[]
} & {
  [P in `${K}__isnull`]?: boolean
}

/** String-only lookups. */
type StringLookups<K extends string, V> = {
  [P in
    | `${K}__contains`
    | `${K}__icontains`
    | `${K}__startswith`
    | `${K}__endswith`]?: V
}

/** Ordered (number/date) lookups. */
type OrderLookups<K extends string, V> = {
  [P in `${K}__gt` | `${K}__gte` | `${K}__lt` | `${K}__lte`]?: V
}

type FieldLookups<K extends string, F extends AnyFieldDef> = CommonLookups<
  K,
  Base<F>
> &
  (Base<F> extends string ? StringLookups<K, Base<F>> : object) &
  (Base<F> extends number | Date ? OrderLookups<K, Base<F>> : object)

export type RelationName<K extends string> = K extends `${infer Base}Id`
  ? Base
  : K

type PrefixLookups<Prefix extends string, L> = {
  [K in keyof L & string as `${Prefix}__${K}`]?: L[K]
}

type RelatedLookups<K extends string, F extends AnyFieldDef> = F extends FieldDef<
  unknown,
  boolean,
  boolean,
  infer Related
>
  ? Related extends Fields
    ? PrefixLookups<RelationName<K>, Lookups<Related>>
    : object
  : object

type DeclaredRelationLookups<R extends Relations> = UnionToIntersection<
  {
    [K in keyof R & string]: R[K] extends RelationDef<infer Related, boolean>
      ? PrefixLookups<K, Lookups<Related>>
      : object
  }[keyof R & string]
>

/**
 * The fully-inferred, fully-checked filter object for a model. Passing a lookup
 * that doesn't exist for a field's type (e.g. `age__icontains` on a number) or a
 * value of the wrong type is a compile error.
 */
type NoRelations = Record<never, never>

export type Lookups<F extends Fields, R extends Relations = NoRelations> = Prettify<
  UnionToIntersection<
    {
      [K in keyof F & string]: FieldLookups<K, F[K]> & RelatedLookups<K, F[K]>
    }[keyof F & string]
  > &
    DeclaredRelationLookups<R>
>

export type RelatedSelects<
  F extends Fields,
  R extends Relations = NoRelations
> = Prettify<
  UnionToIntersection<
    {
      [K in keyof F & string]: F[K] extends FieldDef<
        unknown,
        boolean,
        boolean,
        infer Related
      >
        ? Related extends Fields
          ? { [P in RelationName<K>]: InferSelect<Related> }
          : object
        : object
    }[keyof F & string]
  > &
    UnionToIntersection<
      {
        [K in keyof R & string]: R[K] extends RelationDef<infer Related, false>
          ? { [P in K]: InferSelect<Related> }
          : object
      }[keyof R & string]
    >
>

type FieldSelectPath<K extends string, F extends AnyFieldDef> = F extends FieldDef<
  unknown,
  boolean,
  boolean,
  infer Related
>
  ? Related extends Fields
    ?
        | RelationName<K>
        | `${RelationName<K>}__${SelectRelatedPath<Related>}`
    : never
  : never

export type SelectRelatedPath<
  F extends Fields,
  R extends Relations = NoRelations
> =
  | {
      [K in keyof F & string]: FieldSelectPath<K, F[K]>
    }[keyof F & string]
  | {
      [K in keyof R & string]: R[K] extends RelationDef<infer Related, false>
        ? K | `${K}__${SelectRelatedPath<Related>}`
        : never
    }[keyof R & string]

type FieldRelatedFieldsByName<
  F extends Fields,
  Name extends string
> = {
  [K in keyof F & string]: F[K] extends FieldDef<
    unknown,
    boolean,
    boolean,
    infer Related
  >
    ? Related extends Fields
      ? RelationName<K> extends Name
        ? Related
        : never
      : never
    : never
}[keyof F & string]

type DeclaredRelatedFieldsByName<
  R extends Relations,
  Name extends string
> = {
  [K in keyof R & string]: R[K] extends RelationDef<infer Related, false>
    ? K extends Name
      ? Related
      : never
    : never
}[keyof R & string]

type RelatedFieldsByName<
  F extends Fields,
  R extends Relations,
  Name extends string
> =
  | FieldRelatedFieldsByName<F, Name>
  | DeclaredRelatedFieldsByName<R, Name>

type SelectRelatedNested<
  F extends Fields,
  R extends Relations,
  Path extends string
> = Path extends `${infer Head}__${infer Tail}`
  ? RelatedFieldsByName<F, R, Head> extends infer Related
    ? Related extends Fields
      ? {
          [K in Head]: InferSelect<Related> &
            SelectRelatedNested<Related, NoRelations, Tail>
        }
      : object
    : object
  : RelatedFieldsByName<F, R, Path> extends infer Related
    ? Related extends Fields
      ? { [K in Path]: InferSelect<Related> }
      : object
    : object

export type SelectRelatedResult<
  Row,
  F extends Fields,
  R extends Relations,
  Path extends string
> = Prettify<
  Row &
    SelectRelatedNested<F, R, Path>
>
