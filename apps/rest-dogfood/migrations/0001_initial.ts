import {
  buildSnapshot,
  emptySnapshot,
  planMigration,
  type Migration,
  type SchemaSnapshot
} from '@tango-ts/migrations'

import { models } from '../src/models.js'

export const snapshotAfter: SchemaSnapshot = buildSnapshot(models)
export const migration: Migration = planMigration(
  'rest_dogfood_0001_initial',
  emptySnapshot(),
  snapshotAfter
)

export default migration
