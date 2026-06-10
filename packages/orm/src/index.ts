export { f, Field } from './fields.js'
export type {
  ColumnType,
  FieldSpec,
  ReferenceSpec,
  ReferenceTarget,
  ReferentialAction
} from './fields.js'
export { model, Manager, relationNameFor } from './model.js'
export type { Model, ModelOptions, RelationSpec } from './model.js'
export { r, Relation } from './relations.js'
export type { HasManySpec, RelationMap, RelationTarget } from './relations.js'
export { defineApp } from './registry.js'
export type { AnyModel, TangoApp, TangoAppConfig } from './registry.js'
export { QuerySet, parseLookup } from './queryset.js'
export type { OrderingKey } from './queryset.js'
export { mysqlConfigFromEnv } from './env.js'
export type {
  MysqlConnectionConfig,
  MysqlEnvOptions,
  MysqlSslConfig
} from './env.js'
export { DoesNotExist, MultipleObjectsReturned } from './errors.js'
export {
  atomic,
  COMPILE_ONLY,
  createMysqlConnection,
  getConnection,
  withConnection
} from './connection.js'
export type { ActiveConnection, LooseDatabase, LooseRow } from './connection.js'

// Re-export the inferred ORM types so consumers import them from one place.
export type {
  InferInsert,
  InferSelect,
  InferUpdate,
  Lookups
} from '@tango-ts/core-types'
