import { Field } from '@tango-ts/orm'
import type { Router } from '@tango-ts/router'
import type { TangoProject } from '@tango-ts/server'
import type {
  ModelViewSetRouteMetadata,
  NestedSerializerMetadata,
  OpenApiOperationOverride,
  OpenApiParameterObject,
  OpenApiRequestBodyObject,
  OpenApiResponseObject,
  OpenApiSchemaObject
} from '@tango-ts/views'

export interface OpenApiInfo {
  readonly title: string
  readonly version: string
}

export interface OpenApiOptions {
  readonly title?: string
  readonly version?: string
}

export interface OpenApiDocument {
  readonly openapi: '3.1.0'
  readonly info: OpenApiInfo
  readonly paths: Record<string, PathItem>
  readonly components: {
    readonly schemas: Record<string, SchemaObject>
  }
}

export interface PathItem {
  readonly get?: OperationObject
  readonly post?: OperationObject
  readonly put?: OperationObject
  readonly patch?: OperationObject
  readonly delete?: OperationObject
}

export interface OperationObject {
  readonly operationId?: string
  readonly tags?: string[]
  readonly parameters?: readonly ParameterObject[]
  readonly requestBody?: RequestBodyObject
  readonly responses: Record<string, ResponseObject>
}

export type ParameterObject = OpenApiParameterObject
export type RequestBodyObject = OpenApiRequestBodyObject
export type ResponseObject = OpenApiResponseObject
export type SchemaObject = OpenApiSchemaObject

type HttpOperationKey = keyof Pick<PathItem, 'delete' | 'get' | 'patch' | 'post' | 'put'>

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function isModelViewSetMetadata(
  value: unknown
): value is ModelViewSetRouteMetadata<Record<string, never>> {
  return isRecord(value) && value['kind'] === 'modelViewSet'
}

function operationKey(method: string): HttpOperationKey {
  return method.toLowerCase() as HttpOperationKey
}

function openApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

function singularName(tableName: string): string {
  return tableName.endsWith('s') ? tableName.slice(0, -1) : tableName
}

function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join('')
}

function componentName(meta: ModelViewSetRouteMetadata<Record<string, never>>): string {
  return pascalCase(singularName(meta.model.tableName))
}

function fieldSchema(field: Field, readOnly: boolean): SchemaObject {
  const nullable = field.spec.nullable
  const withNull = (type: string): string | readonly string[] =>
    nullable ? [type, 'null'] : type
  const base: SchemaObject =
    field.spec.columnType === 'int'
      ? { type: withNull('integer') }
      : field.spec.columnType === 'float'
        ? { type: withNull('number') }
        : field.spec.columnType === 'boolean'
          ? { type: withNull('boolean') }
          : field.spec.columnType === 'date'
            ? { type: withNull('string'), format: 'date' }
            : field.spec.columnType === 'datetime'
              ? { type: withNull('string'), format: 'date-time' }
              : {
                  type: withNull('string'),
                  ...(field.spec.maxLength === undefined
                    ? {}
                    : { maxLength: field.spec.maxLength })
                }
  // Choices become a JSON Schema enum; nullable choice fields include null.
  const withChoices: SchemaObject =
    field.spec.choices === undefined
      ? base
      : { ...base, enum: nullable ? [...field.spec.choices, null] : field.spec.choices }
  return readOnly ? { ...withChoices, readOnly: true } : withChoices
}

function isRequired(field: Field): boolean {
  return !field.spec.nullable && !field.spec.hasDefault
}

/**
 * The object schema of a read-only nested serializer's output, recursing into
 * deeper nesting. Always `readOnly`: nested serializers never accept input.
 * Relations behind a nullable FK render as `null`, so their type includes it.
 */
function nestedObjectSchema(meta: NestedSerializerMetadata): SchemaObject {
  const readOnlyFields = new Set<string>(meta.readOnlyFields)
  const properties: Record<string, SchemaObject> = {}
  for (const name of meta.fields) {
    const field = meta.modelFields[name] as Field | undefined
    if (field === undefined) {
      continue
    }
    properties[name] = fieldSchema(field, readOnlyFields.has(name))
  }
  for (const [name, child] of Object.entries(meta.nested)) {
    properties[name] = nestedObjectSchema(child)
  }
  return {
    type: meta.nullable ? ['object', 'null'] : 'object',
    readOnly: true,
    properties
  }
}

function buildSchema(
  meta: ModelViewSetRouteMetadata<Record<string, never>>,
  mode: 'input' | 'output'
): SchemaObject {
  const readOnlyFields = new Set<string>(meta.serializer.readOnlyFields)
  const properties: Record<string, SchemaObject> = {}
  const required: string[] = []

  for (const name of meta.serializer.fields) {
    if (mode === 'input' && readOnlyFields.has(name)) {
      continue
    }
    const field = meta.model.fields[name] as Field | undefined
    if (field === undefined) {
      continue
    }
    properties[name] = fieldSchema(field, mode === 'output' && readOnlyFields.has(name))
    if (!readOnlyFields.has(name) && isRequired(field)) {
      required.push(name)
    }
  }

  if (mode === 'output') {
    for (const [name, child] of Object.entries(meta.serializer.nested)) {
      properties[name] = nestedObjectSchema(child)
    }
  }

  return {
    type: 'object',
    properties,
    ...(required.length === 0 ? {} : { required })
  }
}

function jsonContent(schema: SchemaObject) {
  return { 'application/json': { schema } }
}

function response(description: string, schema?: SchemaObject): ResponseObject {
  return schema === undefined
    ? { description }
    : { description, content: jsonContent(schema) }
}

function operationFor(
  routePath: string,
  meta: ModelViewSetRouteMetadata<Record<string, never>>
): OperationObject {
  const name = componentName(meta)
  const tag = `${name}s`
  const outputRef: SchemaObject = { $ref: `#/components/schemas/${name}` }
  const inputRef: SchemaObject = { $ref: `#/components/schemas/${name}Input` }

  if (meta.action === 'custom') {
    const actionName = meta.actionName ?? 'custom'
    return {
      operationId: `${actionName}${name}`,
      tags: [tag],
      parameters: routePath.includes('{id}')
        ? [
            {
              name: 'id',
              in: 'path',
              required: true,
              schema: { type: 'integer' }
            }
          ]
        : undefined,
      responses: {
        '200': response('OK')
      }
    }
  }

  if (meta.action === 'list') {
    return {
      operationId: `list${tag}`,
      tags: [tag],
      responses: {
        '200': response('OK', { type: 'array', items: outputRef })
      }
    }
  }

  if (meta.action === 'create') {
    return {
      operationId: `create${name}`,
      tags: [tag],
      requestBody: {
        required: true,
        content: jsonContent(inputRef)
      },
      responses: {
        '201': response('Created', outputRef),
        '400': response('Bad request')
      }
    }
  }

  return {
    operationId: `retrieve${name}`,
    tags: [tag],
    parameters: routePath.includes('{id}')
      ? [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'integer' }
          }
        ]
      : undefined,
    responses: {
      '200': response('OK', outputRef),
      '404': response('Not found')
    }
  }
}

function mergeOperation(
  base: OperationObject,
  override: OpenApiOperationOverride | undefined
): OperationObject {
  if (override === undefined) {
    return base
  }
  return {
    ...base,
    ...override,
    parameters: override.parameters ?? base.parameters,
    responses: override.responses ?? base.responses
  }
}

function isProject(source: Router | TangoProject): source is TangoProject {
  return typeof source === 'function' && 'routes' in source
}

function sourceRoutes(source: Router | TangoProject): Router {
  return isProject(source) ? source.routes : source
}

function sourceInfo(
  source: Router | TangoProject,
  options: OpenApiOptions | undefined
): OpenApiInfo {
  return {
    title: options?.title ?? (isProject(source) ? source.name : 'Tango API'),
    version: options?.version ?? '0.0.0'
  }
}

export interface OpenApiRouteOptions extends OpenApiOptions {
  /** Where to serve the document. Defaults to `/openapi.json`. */
  readonly path?: string
}

/**
 * Serve the project's OpenAPI document from the project itself (DRF's
 * `get_schema_view`). Call after `defineProject` — the document is generated
 * from the project's final route table on first request, then cached (routes
 * are static after startup):
 *
 * ```ts
 * export const project = defineProject({ ... })
 * addOpenApiRoute(project, { version: '1.0.0' })
 * ```
 */
export function addOpenApiRoute(
  project: TangoProject,
  options: OpenApiRouteOptions = {}
): void {
  let document: OpenApiDocument | undefined
  project.routes.add('GET', options.path ?? '/openapi.json', () => {
    document ??= generateOpenApi(project, options)
    return new Response(JSON.stringify(document), {
      headers: { 'content-type': 'application/json' }
    })
  })
}

export function generateOpenApi(
  source: Router | TangoProject,
  options?: OpenApiOptions
): OpenApiDocument {
  const paths: Record<string, PathItem> = {}
  const schemas: Record<string, SchemaObject> = {}

  for (const route of sourceRoutes(source).routes()) {
    if (!isModelViewSetMetadata(route.metadata)) {
      continue
    }
    const path = openApiPath(route.path)
    const item = paths[path] ?? {}
    const key = operationKey(route.method)
    paths[path] = {
      ...item,
      [key]: mergeOperation(operationFor(path, route.metadata), route.metadata.openApi)
    }

    const name = componentName(route.metadata)
    schemas[name] = buildSchema(route.metadata, 'output')
    schemas[`${name}Input`] = buildSchema(route.metadata, 'input')
  }

  return {
    openapi: '3.1.0',
    info: sourceInfo(source, options),
    paths,
    components: { schemas }
  }
}
