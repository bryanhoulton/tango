import { Field } from '@tango-ts/orm'
import type { Router } from '@tango-ts/router'
import type {
  ModelViewSetRouteMetadata,
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
  return readOnly ? { ...base, readOnly: true } : base
}

function isRequired(field: Field): boolean {
  return !field.spec.nullable && !field.spec.hasDefault
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

export function generateOpenApi(router: Router, info: OpenApiInfo): OpenApiDocument {
  const paths: Record<string, PathItem> = {}
  const schemas: Record<string, SchemaObject> = {}

  for (const route of router.routes()) {
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
    info,
    paths,
    components: { schemas }
  }
}
