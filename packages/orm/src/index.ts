export { f, Field } from './fields.js'
export type {
  ColumnType,
  FieldSpec,
  ReferenceSpec,
  ReferenceTarget,
  ReferentialAction
} from './fields.js'
export { model, Manager } from './model.js'
export type { Model, ModelOptions, RelationSpec } from './model.js'
export { r, Relation } from './relations.js'
export type { HasManySpec, RelationMap, RelationTarget } from './relations.js'
export { defineApp } from './registry.js'
export type { AnyModel, TangoApp, TangoAppConfig } from './registry.js'
export { QuerySet, parseLookup } from './queryset.js'
export { DoesNotExist, MultipleObjectsReturned } from './errors.js'
export {
  COMPILE_ONLY,
  createMysqlConnection,
  getConnection,
  withConnection
} from './connection.js'
export type { LooseDatabase, LooseRow } from './connection.js'

// Re-export the inferred ORM types so consumers import them from one place.
export type {
  InferInsert,
  InferSelect,
  InferUpdate,
  Lookups
} from '@tango-ts/core-types'
