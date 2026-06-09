import type { Fields, RelationDef } from '@tango-ts/core-types'

import type { ReferenceTarget } from './fields.js'

export interface RelationTarget extends ReferenceTarget {
  readonly fields: Fields
}

export interface HasManySpec {
  readonly kind: 'hasMany'
  readonly target: () => RelationTarget
  readonly foreignKey: string
}

export class Relation<
  RelatedFields extends Fields,
  Many extends boolean
> implements RelationDef<RelatedFields, Many>
{
  declare readonly __relatedFields: RelatedFields
  declare readonly __many: Many

  constructor(readonly spec: HasManySpec) {}
}

export type RelationMap = Record<string, Relation<Fields, boolean>>

export const r = {
  hasMany: <Target extends RelationTarget>(
    target: () => Target,
    foreignKey: keyof Target['fields'] & string
  ): Relation<Target['fields'], true> =>
    new Relation<Target['fields'], true>({
      kind: 'hasMany',
      target,
      foreignKey
    })
} as const
