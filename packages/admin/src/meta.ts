import { Field, type ColumnType } from '@tango-ts/orm'

import type {
  AdminFunctionDefinition,
  AdminModelDefinition,
  AdminPagination
} from './config.js'

/**
 * The `/meta/` document: everything the generic admin SPA needs to render
 * itself. The UI is identical for every project — all per-project shape lives
 * here, derived from the same model metadata that powers OpenAPI generation.
 */
export interface AdminMetaDocument {
  readonly version: 1
  readonly site: {
    readonly title: string
  }
  readonly auth: {
    readonly loginPath: string
    readonly logoutPath: string
    readonly mePath: string
  }
  readonly models: readonly AdminModelMeta[]
  readonly functions: readonly AdminFunctionMeta[]
}

/** A staff-runnable function — the UI lists these in a Functions section. */
export interface AdminFunctionMeta {
  /** Function name, unique within its app. */
  readonly name: string
  /** Owning app name; with `name`, identifies the function and its URL. */
  readonly app: string
  readonly label: string
  readonly appLabel: string
  /** `POST` a `{ payload }` body here to run the function. */
  readonly apiPath: string
}

export interface AdminModelMeta {
  /** URL segment and stable identifier (the table name). */
  readonly name: string
  readonly label: string
  readonly singularLabel: string
  /** Humanized app label — the UI groups sidebar entries by it. */
  readonly app?: string
  readonly apiPath: string
  readonly pk: string
  readonly fields: readonly AdminFieldMeta[]
  readonly listDisplay: readonly string[]
  readonly searchFields: readonly string[]
  readonly filters: readonly string[]
  readonly ordering: readonly string[]
  readonly pagination: AdminPagination
}

export interface AdminFieldMeta {
  readonly name: string
  readonly label: string
  readonly type: ColumnType
  readonly nullable: boolean
  readonly readOnly: boolean
  readonly required: boolean
  readonly hasDefault: boolean
  readonly maxLength?: number
  /** Allowed values (`f.…().choices([...])`) — the UI renders selects. */
  readonly choices?: readonly (string | number)[]
  readonly relation?: AdminRelationMeta
}

/** Foreign key metadata: lets the UI render a related-row picker. */
export interface AdminRelationMeta {
  readonly table: string
  readonly column: string
  /** Admin API path of the referenced model, when it is also registered. */
  readonly apiPath?: string
  /** Field to display as the human label for related rows. */
  readonly displayField?: string
}

function asField(value: unknown): Field {
  return value as Field
}

/** `firstName` / `first_name` → `First name` (Django's field verbose names). */
export function humanize(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** `auth_users` → `Auth users` (plural label) and `Auth user` (singular). */
function tableLabels(tableName: string): { plural: string; singular: string } {
  const plural = humanize(tableName)
  const singular = plural.endsWith('s') ? plural.slice(0, -1) : plural
  return { plural, singular }
}

function primaryKey(definition: AdminModelDefinition): string {
  for (const [name, fieldDef] of Object.entries(definition.modelFields)) {
    if (asField(fieldDef).spec.primaryKey) {
      return name
    }
  }
  return 'id'
}

/** First textual field of a model — what the UI shows for related rows. */
function displayFieldFor(definition: AdminModelDefinition): string {
  for (const name of definition.fieldNames) {
    const spec = asField(definition.modelFields[name]).spec
    if (spec.columnType === 'varchar' || spec.columnType === 'text') {
      return name
    }
  }
  return primaryKey(definition)
}

function relationMeta(
  field: Field,
  byTable: ReadonlyMap<string, { apiPath: string; definition: AdminModelDefinition }>
): AdminRelationMeta | undefined {
  const references = field.spec.references
  if (references === undefined) {
    return undefined
  }
  const target = references.target()
  const registered = byTable.get(target.tableName)
  return {
    table: target.tableName,
    column: references.column,
    apiPath: registered?.apiPath,
    displayField:
      registered === undefined ? undefined : displayFieldFor(registered.definition)
  }
}

function fieldMeta(
  definition: AdminModelDefinition,
  name: string,
  byTable: ReadonlyMap<string, { apiPath: string; definition: AdminModelDefinition }>
): AdminFieldMeta {
  const field = asField(definition.modelFields[name])
  const readOnly = definition.readOnlyFields.includes(name)
  const required = !readOnly && !field.spec.nullable && !field.spec.hasDefault
  return {
    name,
    label: humanize(name),
    type: field.spec.columnType,
    nullable: field.spec.nullable,
    readOnly,
    required,
    hasDefault: field.spec.hasDefault,
    ...(field.spec.maxLength === undefined
      ? {}
      : { maxLength: field.spec.maxLength }),
    ...(field.spec.choices === undefined ? {} : { choices: field.spec.choices }),
    ...(field.spec.references === undefined
      ? {}
      : { relation: relationMeta(field, byTable) })
  }
}

export interface AdminMetaOptions {
  readonly title: string
  readonly basePath: string
  readonly pagination: AdminPagination
  readonly functions?: readonly AdminFunctionDefinition[]
}

export function buildAdminMeta(
  definitions: readonly AdminModelDefinition[],
  options: AdminMetaOptions
): AdminMetaDocument {
  const base = options.basePath.replace(/\/+$/, '')
  const byTable = new Map(
    definitions.map((definition) => [
      definition.tableName,
      { apiPath: `${base}/${definition.name}/`, definition }
    ])
  )

  return {
    version: 1,
    site: { title: options.title },
    auth: {
      loginPath: `${base}/auth/login/`,
      logoutPath: `${base}/auth/logout/`,
      mePath: `${base}/auth/me/`
    },
    models: definitions.map((definition) => {
      const labels = tableLabels(definition.tableName)
      const pk = primaryKey(definition)
      return {
        name: definition.name,
        label: definition.label ?? labels.plural,
        singularLabel: definition.label ?? labels.singular,
        ...(definition.app === undefined ? {} : { app: humanize(definition.app) }),
        apiPath: `${base}/${definition.name}/`,
        pk,
        fields: definition.fieldNames.map((name) =>
          fieldMeta(definition, name, byTable)
        ),
        listDisplay: definition.listDisplay,
        searchFields: definition.searchFields,
        filters: definition.listFilters,
        ordering: definition.ordering.length > 0 ? definition.ordering : [pk],
        pagination: options.pagination
      }
    }),
    functions: (options.functions ?? []).map(({ app, fn }) => ({
      name: fn.name,
      app,
      label: humanize(fn.name),
      appLabel: humanize(app),
      apiPath: `${base}/functions/${app}/${fn.name}/`
    }))
  }
}
