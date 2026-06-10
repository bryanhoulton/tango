import type { Fields, Lookups } from '@tango-ts/core-types'
import type { Authentication, Permission } from '@tango-ts/auth'
import { Field, type Model } from '@tango-ts/orm'
import type { Routable } from '@tango-ts/router'
import { modelSerializer } from '@tango-ts/serializers'
import { modelViewSet, type ViewSetOrdering } from '@tango-ts/views'

export interface AdminPagination {
  readonly pageSize: number
  readonly maxPageSize?: number
}

/** Shared viewset wiring resolved by the admin router for every model. */
export interface AdminViewSetContext {
  readonly authentication: readonly Authentication[]
  readonly permissions: readonly Permission[]
  readonly pagination: AdminPagination
}

/**
 * Per-model admin configuration — Django's `ModelAdmin`, declaratively. Every
 * option is metadata: it is serialized into the `/meta/` document that drives
 * the generic admin UI, and where applicable wired into the generated viewset.
 */
export interface AdminModelOptions<F extends Fields> {
  /** Human label override. Defaults to a title-cased table name. */
  readonly label?: string
  /** Fields exposed to the admin. Defaults to every model field. */
  readonly fields?: readonly (keyof F & string)[]
  /**
   * Fields shown but never written. Defaults to primary keys, auto-increment
   * columns, and `autoNow`/`autoNowAdd` timestamps.
   */
  readonly readOnlyFields?: readonly (keyof F & string)[]
  /** Columns of the list table. Defaults to all exposed fields. */
  readonly listDisplay?: readonly (keyof F & string)[]
  /**
   * Fields searchable from the list view's search box. Each becomes an
   * `<field>__icontains` filter on the admin viewset.
   */
  readonly searchFields?: readonly (keyof F & string)[]
  /** Extra filter lookups (e.g. `published`, `created_at__gte`) for the sidebar. */
  readonly listFilters?: readonly string[]
  /** Default list ordering. Defaults to the primary key. */
  readonly ordering?: readonly ViewSetOrdering<F>[]
}

/**
 * A registered admin model, type-erased for heterogeneous registration lists.
 * Produced by `adminModel()`, which captures the typed model in a closure so
 * the generated serializer and viewset keep full field typing internally.
 */
export interface AdminModelDefinition {
  readonly name: string
  readonly label: string | undefined
  readonly tableName: string
  readonly modelFields: Fields
  readonly fieldNames: readonly string[]
  readonly readOnlyFields: readonly string[]
  readonly listDisplay: readonly string[]
  readonly searchFields: readonly string[]
  readonly listFilters: readonly string[]
  readonly ordering: readonly string[]
  createRoutable(shared: AdminViewSetContext): Routable
}

function asField(value: unknown): Field {
  return value as Field
}

/**
 * Fields the admin shows but never writes: primary keys, auto-increment
 * columns, and auto-managed timestamps.
 */
function defaultReadOnlyFields(
  fields: Fields,
  exposed: readonly string[]
): readonly string[] {
  return exposed.filter((name) => {
    const spec = asField(fields[name]).spec
    return (
      spec.primaryKey ||
      spec.autoIncrement ||
      spec.autoNow === true ||
      spec.autoNowAdd === true
    )
  })
}

/**
 * Register a model with the admin. The same model/serializer machinery that
 * powers public viewsets backs the admin CRUD endpoints — the admin only adds
 * configuration (full-field serializers, staff auth, search filters).
 */
export function adminModel<F extends Fields>(
  model: Model<string, F>,
  options: AdminModelOptions<F> = {}
): AdminModelDefinition {
  const fieldNames = options.fields ?? Object.keys(model.fields)
  const readOnlyFields =
    options.readOnlyFields ?? defaultReadOnlyFields(model.fields, fieldNames)
  const serializer = modelSerializer(model, {
    fields: fieldNames,
    readOnlyFields
  })
  const searchFields = options.searchFields ?? []
  const listFilters = options.listFilters ?? []
  // The search box ANDs nothing extra in: each search field is exposed as its
  // own `icontains` lookup. Multi-field OR search needs ORM support and can
  // upgrade server-side without touching the meta contract.
  const filters = [
    ...listFilters,
    ...searchFields.map((field) => `${field}__icontains`)
  ]

  return {
    name: model.tableName,
    label: options.label,
    tableName: model.tableName,
    modelFields: model.fields,
    fieldNames,
    readOnlyFields,
    listDisplay: options.listDisplay ?? fieldNames,
    searchFields,
    listFilters,
    ordering: options.ordering ?? [],
    createRoutable(shared: AdminViewSetContext): Routable {
      return modelViewSet({
        model,
        serializer,
        filters: filters as unknown as readonly (keyof Lookups<F> & string)[],
        ordering: options.ordering,
        pagination: shared.pagination,
        authentication: shared.authentication,
        permissions: shared.permissions
      })
    }
  }
}
