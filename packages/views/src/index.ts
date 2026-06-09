import { detailResponse, jsonResponse, type RequestContext } from '@tango-ts/http'
import type { Authentication, Permission } from '@tango-ts/auth'
import { AuthenticationFailed } from '@tango-ts/auth'
import type { Fields, InferSelect, InferUpdate, Lookups } from '@tango-ts/core-types'
import { DoesNotExist, Field } from '@tango-ts/orm'
import type { Model } from '@tango-ts/orm'
import type {
  ModelSerializerInstance,
  SerializerInstanceOptions,
  ValidationErrors
} from '@tango-ts/serializers'
import type { Route } from '@tango-ts/router'

export interface ViewSetRoute {
  readonly method: Route['method']
  readonly path: string
  readonly handler: Route['handler']
  readonly metadata?: unknown
}

export interface OpenApiSchemaObject {
  readonly $ref?: string
  readonly type?: string | readonly string[]
  readonly format?: string
  readonly maxLength?: number
  readonly readOnly?: boolean
  readonly properties?: Record<string, OpenApiSchemaObject>
  readonly required?: string[]
  readonly items?: OpenApiSchemaObject
}

export interface OpenApiParameterObject {
  readonly name: string
  readonly in: 'path' | 'query'
  readonly required: boolean
  readonly schema: OpenApiSchemaObject
}

export interface OpenApiResponseObject {
  readonly description: string
  readonly content?: {
    readonly 'application/json': {
      readonly schema: OpenApiSchemaObject
    }
  }
}

export interface OpenApiRequestBodyObject {
  readonly required: boolean
  readonly content: {
    readonly 'application/json': {
      readonly schema: OpenApiSchemaObject
    }
  }
}

export interface OpenApiOperationOverride {
  readonly operationId?: string
  readonly tags?: string[]
  readonly parameters?: readonly OpenApiParameterObject[]
  readonly requestBody?: OpenApiRequestBodyObject
  readonly responses?: Record<string, OpenApiResponseObject>
}

export interface ModelSerializerLike<F extends Fields, Out> {
  readonly fields?: readonly (keyof F & string)[]
  readonly readOnlyFields?: readonly (keyof F & string)[]
  serialize(row: InferSelect<F>): Out
  forUnknownInput(
    input: unknown,
    options?: SerializerInstanceOptions
  ): ModelSerializerInstance<
    F,
    readonly (keyof F & string)[],
    readonly (keyof F & string)[]
  >
}

export interface ModelViewSetRouteMetadata<F extends Fields> {
  readonly kind: 'modelViewSet'
  readonly action: 'list' | 'retrieve' | 'create' | 'custom'
  readonly actionName?: string
  readonly model: Model<string, F>
  readonly serializer: {
    readonly fields: readonly (keyof F & string)[]
    readonly readOnlyFields: readonly (keyof F & string)[]
  }
  readonly openApi?: OpenApiOperationOverride
}

export interface ModelViewSetAction {
  readonly name: string
  readonly method: Route['method']
  readonly path: string
  readonly detail: boolean
  readonly handler: Route['handler']
  readonly openApi?: OpenApiOperationOverride
}

export interface ModelViewSetOpenApiOverrides {
  readonly list?: OpenApiOperationOverride
  readonly retrieve?: OpenApiOperationOverride
  readonly create?: OpenApiOperationOverride
}

export type AuthResult =
  | Record<string, unknown>
  | string
  | number
  | boolean
  | null
  | undefined

export interface ModelViewSetOptions<F extends Fields, Out> {
  readonly model: Model<string, F>
  readonly serializer: ModelSerializerLike<F, Out>
  readonly filters?: readonly (keyof Lookups<F> & string)[]
  readonly pagination?: {
    readonly pageSize: number
    readonly maxPageSize?: number
  }
  readonly authenticate?: (ctx: RequestContext) => Promise<AuthResult> | AuthResult
  readonly authentication?: readonly Authentication[]
  readonly permissions?: readonly (Permission | ((
    ctx: RequestContext
  ) => Promise<boolean> | boolean))[]
  readonly actions?: readonly ModelViewSetAction[]
  readonly openApi?: ModelViewSetOpenApiOverrides
}

interface PaginationEnvelope<Out> {
  readonly count: number
  readonly next: string | null
  readonly previous: string | null
  readonly results: Out[]
}

const LOOKUP_SUFFIXES = new Set([
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

function joinPaths(basePath: string, suffix: string): string {
  const base = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  return `${base}${suffix}`
}

function primaryKeyColumn(fields: Fields): string {
  for (const [name, fieldDef] of Object.entries(fields)) {
    const field = fieldDef as Field
    if (field.spec.primaryKey) {
      return name
    }
  }
  return 'id'
}

function coercePrimaryKey(value: string, field: Field): string | number {
  return field.spec.columnType === 'int' || field.spec.columnType === 'float'
    ? Number(value)
    : value
}

function fieldNameFromLookup(lookup: string): string {
  const idx = lookup.lastIndexOf('__')
  if (idx === -1) {
    return lookup
  }
  const suffix = lookup.slice(idx + 2)
  return LOOKUP_SUFFIXES.has(suffix) ? lookup.slice(0, idx) : lookup
}

function coerceFilterValue(field: Field | undefined, lookup: string, value: string): unknown {
  if (lookup.endsWith('__isnull')) {
    return value === 'true' || value === '1'
  }
  if (lookup.endsWith('__in')) {
    return value.split(',').map((item) => coerceFilterValue(field, lookup.slice(0, -4), item))
  }
  if (field === undefined) {
    return value
  }
  switch (field.spec.columnType) {
    case 'int':
    case 'float':
      return Number(value)
    case 'boolean':
      return value === 'true' || value === '1'
    case 'date':
    case 'datetime':
      return new Date(value)
    case 'text':
    case 'varchar':
      return value
  }
}

function pageNumber(ctx: RequestContext): number {
  const page = Number(ctx.query.get('page') ?? 1)
  return Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
}

function pageSize(
  ctx: RequestContext,
  pagination: NonNullable<ModelViewSetOptions<Fields, unknown>['pagination']>
): number {
  const raw = ctx.query.get('pageSize')
  const requested = raw === null ? pagination.pageSize : Number(raw)
  const safe = Number.isFinite(requested) && requested > 0 ? Math.floor(requested) : pagination.pageSize
  return Math.min(safe, pagination.maxPageSize ?? safe)
}

function pageUrl(ctx: RequestContext, page: number): string {
  const url = new URL(ctx.request.url)
  url.searchParams.set('page', String(page))
  return url.toString()
}

export class ModelViewSet<F extends Fields, Out> {
  private readonly pkColumn: string

  constructor(private readonly options: ModelViewSetOptions<F, Out>) {
    this.pkColumn = primaryKeyColumn(options.model.fields)
  }

  routes(basePath: string): readonly ViewSetRoute[] {
    const baseRoutes: ViewSetRoute[] = [
      {
        method: 'GET',
        path: joinPaths(basePath, '/'),
        handler: (ctx) => this.dispatch(ctx, (authedCtx) => this.list(authedCtx)),
        metadata: this.metadata('list', this.options.openApi?.list)
      },
      {
        method: 'POST',
        path: joinPaths(basePath, '/'),
        handler: (ctx) => this.dispatch(ctx, (authedCtx) => this.create(authedCtx)),
        metadata: this.metadata('create', this.options.openApi?.create)
      },
      {
        method: 'GET',
        path: joinPaths(basePath, '/:id/'),
        handler: (ctx) => this.dispatch(ctx, (authedCtx) => this.retrieve(authedCtx)),
        metadata: this.metadata('retrieve', this.options.openApi?.retrieve)
      },
      {
        method: 'PATCH',
        path: joinPaths(basePath, '/:id/'),
        handler: (ctx) => this.dispatch(ctx, (authedCtx) => this.partialUpdate(authedCtx)),
        metadata: this.metadata('custom', undefined, 'partialUpdate')
      },
      {
        method: 'DELETE',
        path: joinPaths(basePath, '/:id/'),
        handler: (ctx) => this.dispatch(ctx, (authedCtx) => this.destroy(authedCtx)),
        metadata: this.metadata('custom', undefined, 'destroy')
      }
    ]
    const customRoutes = (this.options.actions ?? []).map((action) => ({
      method: action.method,
      path: joinPaths(
        basePath,
        action.detail ? `/:id/${action.path}/` : `/${action.path}/`
      ),
      handler: (ctx: RequestContext) =>
        this.dispatch(ctx, (authedCtx) => Promise.resolve(action.handler(authedCtx))),
      metadata: this.metadata('custom', action.openApi, action.name)
    }))
    return [...baseRoutes, ...customRoutes]
  }

  private metadata(
    action: ModelViewSetRouteMetadata<F>['action'],
    openApi?: OpenApiOperationOverride,
    actionName?: string
  ): ModelViewSetRouteMetadata<F> {
    return {
      kind: 'modelViewSet',
      action,
      actionName,
      model: this.options.model,
      serializer: {
        fields: this.options.serializer.fields ?? Object.keys(this.options.model.fields),
        readOnlyFields: this.options.serializer.readOnlyFields ?? []
      },
      openApi
    }
  }

  private async dispatch(
    ctx: RequestContext,
    handler: (ctx: RequestContext) => Promise<Response>
  ): Promise<Response> {
    let user = await this.options.authenticate?.(ctx)
    try {
      for (const authentication of this.options.authentication ?? []) {
        user = await authentication.authenticate(ctx)
        if (user !== undefined) {
          break
        }
      }
    } catch (err) {
      if (err instanceof AuthenticationFailed) {
        return detailResponse(err.message, 401)
      }
      throw err
    }
    const authedCtx: RequestContext = { ...ctx, user }
    for (const permission of this.options.permissions ?? []) {
      const requiresAuthentication =
        typeof permission === 'function'
          ? false
          : permission.requiresAuthentication === true
      if (requiresAuthentication && authedCtx.user === undefined) {
        return detailResponse('Authentication credentials were not provided.', 401)
      }
      const allowed =
        typeof permission === 'function'
          ? await permission(authedCtx)
          : await permission.hasPermission(authedCtx)
      if (!allowed) {
        return detailResponse('Permission denied.', 403)
      }
    }
    return handler(authedCtx)
  }

  private filtersFromQuery(ctx: RequestContext): Lookups<F> {
    const allowed = new Set(this.options.filters ?? [])
    const filters: Record<string, unknown> = {}
    for (const key of allowed) {
      const raw = ctx.query.get(key)
      if (raw === null) {
        continue
      }
      const fieldName = fieldNameFromLookup(key)
      const field = this.options.model.fields[fieldName] as Field | undefined
      filters[key] = coerceFilterValue(field, key, raw)
    }
    return filters as Lookups<F>
  }

  private paginate(ctx: RequestContext, rows: Out[]): PaginationEnvelope<Out> {
    const pagination = this.options.pagination
    if (pagination === undefined) {
      throw new Error('paginate() called without pagination configuration.')
    }
    const page = pageNumber(ctx)
    const size = pageSize(ctx, pagination)
    const start = (page - 1) * size
    const results = rows.slice(start, start + size)
    const next = start + size < rows.length ? pageUrl(ctx, page + 1) : null
    const previous = page > 1 ? pageUrl(ctx, page - 1) : null
    return { count: rows.length, next, previous, results }
  }

  async list(ctx: RequestContext): Promise<Response> {
    const filters = this.filtersFromQuery(ctx)
    const hasFilters = Object.keys(filters).length > 0
    const rows = await (hasFilters
      ? this.options.model.objects.filter(filters)
      : this.options.model.objects.all())
    const serialized = rows.map((row) => this.options.serializer.serialize(row))
    return jsonResponse(
      this.options.pagination === undefined
        ? serialized
        : this.paginate(ctx, serialized)
    )
  }

  async retrieve(ctx: RequestContext): Promise<Response> {
    const id = ctx.params['id']
    if (id === undefined) {
      return detailResponse('Not found.', 404)
    }
    const pkField = this.options.model.fields[this.pkColumn] as Field
    const pkValue = coercePrimaryKey(id, pkField)
    try {
      const row = await this.options.model.objects.get({
        [this.pkColumn]: pkValue
      } as Lookups<F>)
      return jsonResponse(this.options.serializer.serialize(row))
    } catch (err) {
      if (err instanceof DoesNotExist) {
        return detailResponse('Not found.', 404)
      }
      throw err
    }
  }

  async create(ctx: RequestContext): Promise<Response> {
    let payload: unknown
    try {
      payload = await ctx.json()
    } catch {
      return detailResponse('Malformed JSON.', 400)
    }
    const serializer = this.options.serializer.forUnknownInput(payload)
    if (!serializer.isValid()) {
      return jsonResponse(serializer.errors satisfies ValidationErrors, { status: 400 })
    }
    const row = await serializer.save()
    return jsonResponse(this.options.serializer.serialize(row), { status: 201 })
  }

  async partialUpdate(ctx: RequestContext): Promise<Response> {
    const id = ctx.params['id']
    if (id === undefined) {
      return detailResponse('Not found.', 404)
    }
    let payload: unknown
    try {
      payload = await ctx.json()
    } catch {
      return detailResponse('Malformed JSON.', 400)
    }
    const serializer = this.options.serializer.forUnknownInput(payload, {
      partial: true
    })
    if (!serializer.isValid()) {
      return jsonResponse(serializer.errors satisfies ValidationErrors, { status: 400 })
    }
    const pkField = this.options.model.fields[this.pkColumn] as Field
    const pkValue = coercePrimaryKey(id, pkField)
    try {
      const row = await this.options.model.objects.update(
        { [this.pkColumn]: pkValue } as Lookups<F>,
        (serializer.validatedData ?? {}) as InferUpdate<F>
      )
      return jsonResponse(this.options.serializer.serialize(row))
    } catch (err) {
      if (err instanceof DoesNotExist) {
        return detailResponse('Not found.', 404)
      }
      throw err
    }
  }

  async destroy(ctx: RequestContext): Promise<Response> {
    const id = ctx.params['id']
    if (id === undefined) {
      return detailResponse('Not found.', 404)
    }
    const pkField = this.options.model.fields[this.pkColumn] as Field
    const pkValue = coercePrimaryKey(id, pkField)
    try {
      await this.options.model.objects.get({ [this.pkColumn]: pkValue } as Lookups<F>)
      await this.options.model.objects.delete({ [this.pkColumn]: pkValue } as Lookups<F>)
      return new Response(null, { status: 204 })
    } catch (err) {
      if (err instanceof DoesNotExist) {
        return detailResponse('Not found.', 404)
      }
      throw err
    }
  }
}

export function modelViewSet<F extends Fields, Out>(
  options: ModelViewSetOptions<F, Out>
): ModelViewSet<F, Out> {
  return new ModelViewSet(options)
}
