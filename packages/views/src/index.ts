import { detailResponse, jsonResponse, type RequestContext } from '@tango-ts/http'
import type {
  AuthenticatedUser,
  Authentication,
  MaybePromise,
  PermissionCheck
} from '@tango-ts/auth'
import {
  AuthenticationFailed,
  checkObjectPermissions,
  checkPermissions,
  runAuthentication
} from '@tango-ts/auth'
import type { Fields, InferSelect, InferUpdate, Lookups } from '@tango-ts/core-types'
import { DoesNotExist, Field, relationNameFor } from '@tango-ts/orm'
import type { Model, OrderingKey, QuerySet } from '@tango-ts/orm'
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
  readonly enum?: readonly (string | number | null)[]
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

/**
 * What the viewset can see of a nested serializer (read-only nesting): enough
 * to select the relations it serializes and to describe its output schema.
 */
export interface NestedSerializerInfo {
  serialize(row: never): unknown
  readonly model?: { readonly fields: Fields }
  readonly fields?: readonly string[]
  readonly readOnlyFields?: readonly string[]
  readonly nested?: NestedSerializerInfoMap
}

export type NestedSerializerInfoMap = Readonly<
  Record<string, NestedSerializerInfo | undefined>
>

export interface ModelSerializerLike<F extends Fields, Out> {
  readonly fields?: readonly (keyof F & string)[]
  readonly readOnlyFields?: readonly (keyof F & string)[]
  readonly nested?: NestedSerializerInfoMap
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

/** Schema metadata for one nested serializer, consumed by OpenAPI generation. */
export interface NestedSerializerMetadata {
  readonly fields: readonly string[]
  readonly readOnlyFields: readonly string[]
  readonly modelFields: Fields
  /** Whether the relation sits behind a nullable FK (the output may be null). */
  readonly nullable: boolean
  readonly nested: Readonly<Record<string, NestedSerializerMetadata>>
}

export interface ModelViewSetRouteMetadata<F extends Fields> {
  readonly kind: 'modelViewSet'
  readonly action: 'list' | 'retrieve' | 'create' | 'custom'
  readonly actionName?: string
  readonly model: Model<string, F>
  readonly serializer: {
    readonly fields: readonly (keyof F & string)[]
    readonly readOnlyFields: readonly (keyof F & string)[]
    readonly nested: Readonly<Record<string, NestedSerializerMetadata>>
  }
  readonly openApi?: OpenApiOperationOverride
}

interface ModelViewSetActionCommon<User = unknown> {
  readonly name: string
  readonly method: Route['method']
  /**
   * The action's URL segment — just the action name (e.g. `'close'`), never a
   * path pattern. The viewset builds the full route itself: detail actions
   * mount at `/:id/<path>/` (the `/:id/` prefix is prepended automatically)
   * and collection actions at `/<path>/`. A path containing `:` params (e.g.
   * `'/:id/close/'`) is a configuration error and throws at route build time.
   */
  readonly path: string
  /**
   * Per-action authentication classes (DRF's `@action(authentication_classes)`).
   * When set, replaces the viewset-level `authentication` for this action.
   */
  readonly authentication?: readonly Authentication<User>[]
  /**
   * Per-action permissions (DRF's `@action(permission_classes)`). When set,
   * replaces the viewset-level `permissions` for this action — including the
   * object-level pass for detail actions.
   */
  readonly permissions?: readonly PermissionCheck<User>[]
  readonly openApi?: OpenApiOperationOverride
}

export interface ModelViewSetCollectionAction<User = unknown>
  extends ModelViewSetActionCommon<User> {
  readonly detail?: false
  readonly handler: (ctx: RequestContext<User>) => MaybePromise<Response>
}

export interface ModelViewSetDetailAction<F extends Fields, User = unknown>
  extends ModelViewSetActionCommon<User> {
  readonly detail: true
  /**
   * Detail handlers receive the row, already resolved DRF-style: fetched
   * through the scoped queryset (out-of-scope rows 404) and past the
   * object-permission pass.
   */
  readonly handler: (
    ctx: RequestContext<User>,
    row: InferSelect<F>
  ) => MaybePromise<Response>
}

export type ModelViewSetAction<F extends Fields = Fields, User = unknown> =
  | ModelViewSetCollectionAction<User>
  | ModelViewSetDetailAction<F, User>

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

/** Django-style ordering for a viewset: a field name, or `-field` for descending. */
export type ViewSetOrdering<F extends Fields> =
  | (keyof F & string)
  | `-${keyof F & string}`

export interface ModelViewSetOptions<
  F extends Fields,
  Out,
  User = AuthenticatedUser
> {
  readonly model: Model<string, F>
  readonly serializer: ModelSerializerLike<F, Out>
  /**
   * Scope every action to a per-request queryset (Django's `get_queryset()`).
   * `list` queries it, and detail actions 404 for rows outside it — out-of-scope
   * rows simply do not exist for the caller. Defaults to `model.objects.all()`.
   */
  readonly queryset?: (
    ctx: RequestContext<NoInfer<User>>
  ) => QuerySet<InferSelect<F>, Lookups<F>>
  /**
   * Object-level permission (DRF's `has_object_permission`) for detail actions,
   * checked after the row is fetched; denial is a 403. Permission classes in
   * `permissions` may also implement `hasObjectPermission`.
   */
  readonly objectPermission?: (
    ctx: RequestContext<NoInfer<User>>,
    row: InferSelect<F>
  ) => MaybePromise<boolean>
  readonly filters?: readonly (keyof Lookups<F> & string)[]
  /**
   * Default ordering applied to list responses. Paginated lists always have a
   * deterministic order: this option when set, otherwise the primary key.
   */
  readonly ordering?: readonly ViewSetOrdering<F>[]
  readonly pagination?: {
    readonly pageSize: number
    readonly maxPageSize?: number
  }
  readonly authenticate?: (ctx: RequestContext) => Promise<AuthResult> | AuthResult
  /**
   * Authentication classes. They also decide what `ctx.user` is typed as in
   * action handlers, `queryset`, `objectPermission`, and permission predicates:
   * `Authentication<PublicUser>` yields `ctx.user?: PublicUser`.
   */
  readonly authentication?: readonly Authentication<User>[]
  // NoInfer on every other `User` position: only `authentication` decides the
  // user type — a wider `Permission` or an unannotated handler must not widen it.
  readonly permissions?: readonly PermissionCheck<NoInfer<User>>[]
  readonly actions?: readonly ModelViewSetAction<F, NoInfer<User>>[]
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

/**
 * The `selectRelated` paths a serializer's nested config requires, including
 * deeper paths when nested serializers nest again (`author`, `author__org`).
 */
function nestedRelationPaths(
  nested: NestedSerializerInfoMap | undefined,
  prefix?: string
): readonly string[] {
  const paths: string[] = []
  for (const [name, child] of Object.entries(nested ?? {})) {
    if (child === undefined) {
      continue
    }
    const path = prefix === undefined ? name : `${prefix}__${name}`
    paths.push(path, ...nestedRelationPaths(child.nested, path))
  }
  return paths
}

/** Whether relation `name` on a model's field map sits behind a nullable FK. */
function relationIsNullable(parentFields: Fields, name: string): boolean {
  for (const [column, fieldDef] of Object.entries(parentFields)) {
    const field = fieldDef as Field
    const references = field.spec.references
    if (
      references !== undefined &&
      relationNameFor(column, references.relationName) === name
    ) {
      return field.spec.nullable
    }
  }
  return false
}

function nestedSerializerMetadata(
  nested: NestedSerializerInfoMap | undefined,
  parentFields: Fields
): Readonly<Record<string, NestedSerializerMetadata>> {
  const metadata: Record<string, NestedSerializerMetadata> = {}
  for (const [name, child] of Object.entries(nested ?? {})) {
    if (child === undefined) {
      continue
    }
    const modelFields = child.model?.fields ?? {}
    metadata[name] = {
      fields: child.fields ?? Object.keys(modelFields),
      readOnlyFields: child.readOnlyFields ?? [],
      modelFields,
      nullable: relationIsNullable(parentFields, name),
      nested: nestedSerializerMetadata(child.nested, modelFields)
    }
  }
  return metadata
}

/**
 * Normalize an action's `path` to its URL segment. Accepts `'close'` or
 * `'/close/'`; rejects `:` params loudly — the viewset prepends `/:id/` for
 * detail actions itself, so `path: '/:id/close/'` would double the prefix.
 */
function actionPathSegment(action: { name: string; path: string }): string {
  const trimmed = action.path.replace(/^\/+|\/+$/g, '')
  if (trimmed.length === 0 || trimmed.includes(':')) {
    throw new Error(
      `Invalid path ${JSON.stringify(action.path)} for action "${action.name}": ` +
        `pass just the action's URL segment (e.g. "close"). The viewset builds ` +
        `the full route itself — detail actions mount at /:id/<path>/ and ` +
        `collection actions at /<path>/.`
    )
  }
  return trimmed
}

export class ModelViewSet<F extends Fields, Out, User = AuthenticatedUser> {
  private readonly pkColumn: string

  constructor(private readonly options: ModelViewSetOptions<F, Out, User>) {
    this.pkColumn = primaryKeyColumn(options.model.fields)
  }

  routes(basePath: string): readonly ViewSetRoute[] {
    const collectionRoutes: ViewSetRoute[] = [
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
      }
    ]
    const detailRoutes: ViewSetRoute[] = [
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
    const actionRoute = (action: ModelViewSetAction<F, User>): ViewSetRoute => {
      const segment = actionPathSegment(action)
      return {
        method: action.method,
        path: joinPaths(
          basePath,
          action.detail === true ? `/:id/${segment}/` : `/${segment}/`
        ),
        handler: (ctx: RequestContext) =>
          this.dispatch(
            ctx,
            (authedCtx) =>
              action.detail === true
                ? this.runDetailAction(authedCtx, action)
                : Promise.resolve(action.handler(authedCtx)),
            action
          ),
        metadata: this.metadata('custom', action.openApi, action.name)
      }
    }
    const actions = this.options.actions ?? []
    // DRF route ordering: collection actions register before the `/:id/`
    // routes so `GET /users/export/` is not captured by `GET /users/:id/`.
    return [
      ...collectionRoutes,
      ...actions.filter((action) => action.detail !== true).map(actionRoute),
      ...detailRoutes,
      ...actions.filter((action) => action.detail === true).map(actionRoute)
    ]
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
        readOnlyFields: this.options.serializer.readOnlyFields ?? [],
        nested: nestedSerializerMetadata(
          this.options.serializer.nested,
          this.options.model.fields
        )
      },
      openApi
    }
  }

  private async dispatch(
    ctx: RequestContext,
    handler: (ctx: RequestContext<User>) => Promise<Response>,
    overrides?: Pick<
      ModelViewSetActionCommon<User>,
      'authentication' | 'permissions'
    >
  ): Promise<Response> {
    // Precedence: the action's (or this viewset's) authentication classes,
    // then the legacy `authenticate` hook, then any user already on the
    // context (set by project-level authentication in `defineServer`/
    // `defineProject`).
    const authentication =
      overrides?.authentication ?? this.options.authentication ?? []
    let user: unknown
    try {
      user =
        (await runAuthentication(ctx, authentication)) ??
        (await this.options.authenticate?.(ctx)) ??
        ctx.user
    } catch (err) {
      if (err instanceof AuthenticationFailed) {
        return detailResponse(err.message, 401)
      }
      throw err
    }
    const authedCtx = { ...ctx, user } as RequestContext<User>
    const permissions = overrides?.permissions ?? this.options.permissions ?? []
    const denied = await checkPermissions(authedCtx, permissions)
    if (denied !== undefined) {
      return denied
    }
    return handler(authedCtx)
  }

  /**
   * Detail custom actions get DRF's `get_object()` treatment: pk coercion,
   * scoped-queryset fetch (out-of-scope rows 404), and the object-permission
   * pass — using the action's permissions when it declares its own.
   */
  private async runDetailAction(
    ctx: RequestContext<User>,
    action: ModelViewSetDetailAction<F, User>
  ): Promise<Response> {
    const id = ctx.params['id']
    if (id === undefined) {
      return detailResponse('Not found.', 404)
    }
    const pkField = this.options.model.fields[this.pkColumn] as Field
    const pkValue = coercePrimaryKey(id, pkField)
    try {
      const row = await this.getScopedObject(ctx, pkValue)
      const denied = await this.deniedForObject(ctx, row, action.permissions)
      if (denied !== undefined) {
        return denied
      }
      return await action.handler(ctx, row)
    } catch (err) {
      if (err instanceof DoesNotExist) {
        return detailResponse('Not found.', 404)
      }
      throw err
    }
  }

  private scopedQuery(
    ctx: RequestContext<User>
  ): QuerySet<InferSelect<F>, Lookups<F>> {
    return this.options.queryset === undefined
      ? this.options.model.objects.all()
      : this.options.queryset(ctx)
  }

  /**
   * Apply `selectRelated` for every relation the serializer's nested config
   * serializes, so rows reach `serialize` with their related data attached.
   */
  private withNestedRelations(
    query: QuerySet<InferSelect<F>, Lookups<F>>
  ): QuerySet<InferSelect<F>, Lookups<F>> {
    // The serializer's nested keys are validated relation names at its own
    // type level; the viewset applies them as runtime paths.
    let related = query as QuerySet<InferSelect<F>, Lookups<F>, string>
    for (const path of nestedRelationPaths(this.options.serializer.nested)) {
      related = related.selectRelated(path)
    }
    return related
  }

  /**
   * Re-fetch a row with nested relations attached before serializing it.
   * Used after writes (`create`/`update`), which return flat rows. Unscoped on
   * purpose: the write already passed scoping, and DRF serializes the saved
   * instance even when the write moves it out of scope.
   */
  private async hydrateNested(row: InferSelect<F>): Promise<InferSelect<F>> {
    if (nestedRelationPaths(this.options.serializer.nested).length === 0) {
      return row
    }
    const pkValue = (row as Record<string, unknown>)[this.pkColumn]
    return this.withNestedRelations(this.options.model.objects.all()).get({
      [this.pkColumn]: pkValue
    } as Lookups<F>)
  }

  /** Fetch one row by pk through the scoped queryset; out of scope = DoesNotExist. */
  private getScopedObject(
    ctx: RequestContext<User>,
    pkValue: string | number
  ): Promise<InferSelect<F>> {
    return this.withNestedRelations(this.scopedQuery(ctx)).get({
      [this.pkColumn]: pkValue
    } as Lookups<F>)
  }

  /**
   * Object-level permission pass for detail actions: every permission class
   * implementing `hasObjectPermission`, then the `objectPermission` option.
   * Returns the 403 response on denial, undefined when allowed.
   */
  private async deniedForObject(
    ctx: RequestContext<User>,
    row: InferSelect<F>,
    permissions?: readonly PermissionCheck<User>[]
  ): Promise<Response | undefined> {
    const denied = await checkObjectPermissions(
      ctx,
      permissions ?? this.options.permissions ?? [],
      row
    )
    if (denied !== undefined) {
      return denied
    }
    const objectPermission = this.options.objectPermission
    if (objectPermission !== undefined && !(await objectPermission(ctx, row))) {
      return detailResponse('Permission denied.', 403)
    }
    return undefined
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

  private orderingKeys(): readonly OrderingKey<InferSelect<F>>[] {
    const configured = this.options.ordering
    if (configured !== undefined && configured.length > 0) {
      return configured as readonly OrderingKey<InferSelect<F>>[]
    }
    return [this.pkColumn as OrderingKey<InferSelect<F>>]
  }

  /**
   * Pagination happens in SQL: one COUNT(*) plus one ordered LIMIT/OFFSET page.
   * The table is never loaded into memory.
   */
  private async paginatedList(
    ctx: RequestContext,
    query: QuerySet<InferSelect<F>, Lookups<F>>,
    pagination: NonNullable<ModelViewSetOptions<F, Out, User>['pagination']>
  ): Promise<PaginationEnvelope<Out>> {
    const page = pageNumber(ctx)
    const size = pageSize(ctx, pagination)
    const start = (page - 1) * size
    const count = await query.count()
    const rows = await query.orderBy(...this.orderingKeys()).limit(size).offset(start)
    const results = rows.map((row) => this.options.serializer.serialize(row))
    const next = start + size < count ? pageUrl(ctx, page + 1) : null
    const previous = page > 1 ? pageUrl(ctx, page - 1) : null
    return { count, next, previous, results }
  }

  async list(ctx: RequestContext<User>): Promise<Response> {
    const filters = this.filtersFromQuery(ctx)
    const hasFilters = Object.keys(filters).length > 0
    const base = this.withNestedRelations(this.scopedQuery(ctx))
    const query = hasFilters ? base.filter(filters) : base
    if (this.options.pagination !== undefined) {
      return jsonResponse(
        await this.paginatedList(ctx, query, this.options.pagination)
      )
    }
    const rows =
      this.options.ordering === undefined
        ? await query
        : await query.orderBy(...this.orderingKeys())
    return jsonResponse(rows.map((row) => this.options.serializer.serialize(row)))
  }

  async retrieve(ctx: RequestContext<User>): Promise<Response> {
    const id = ctx.params['id']
    if (id === undefined) {
      return detailResponse('Not found.', 404)
    }
    const pkField = this.options.model.fields[this.pkColumn] as Field
    const pkValue = coercePrimaryKey(id, pkField)
    try {
      const row = await this.getScopedObject(ctx, pkValue)
      const denied = await this.deniedForObject(ctx, row)
      if (denied !== undefined) {
        return denied
      }
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
    return jsonResponse(
      this.options.serializer.serialize(await this.hydrateNested(row)),
      { status: 201 }
    )
  }

  async partialUpdate(ctx: RequestContext<User>): Promise<Response> {
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
      // Scope check first: a row outside the queryset 404s before any write.
      const existing = await this.getScopedObject(ctx, pkValue)
      const denied = await this.deniedForObject(ctx, existing)
      if (denied !== undefined) {
        return denied
      }
      const row = await this.options.model.objects.update(
        { [this.pkColumn]: pkValue } as Lookups<F>,
        (serializer.validatedData ?? {}) as InferUpdate<F>
      )
      return jsonResponse(
        this.options.serializer.serialize(await this.hydrateNested(row))
      )
    } catch (err) {
      if (err instanceof DoesNotExist) {
        return detailResponse('Not found.', 404)
      }
      throw err
    }
  }

  async destroy(ctx: RequestContext<User>): Promise<Response> {
    const id = ctx.params['id']
    if (id === undefined) {
      return detailResponse('Not found.', 404)
    }
    const pkField = this.options.model.fields[this.pkColumn] as Field
    const pkValue = coercePrimaryKey(id, pkField)
    try {
      const existing = await this.getScopedObject(ctx, pkValue)
      const denied = await this.deniedForObject(ctx, existing)
      if (denied !== undefined) {
        return denied
      }
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

export function modelViewSet<F extends Fields, Out, User = AuthenticatedUser>(
  options: ModelViewSetOptions<F, Out, User>
): ModelViewSet<F, Out, User> {
  return new ModelViewSet(options)
}
