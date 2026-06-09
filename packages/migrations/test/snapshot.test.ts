import { f, model } from '@tango-ts/orm'
import { describe, expect, it } from 'vitest'

import { buildSnapshot } from '../src/index.js'

const User = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age: f.int().nullable()
})

describe('buildSnapshot', () => {
  it('captures primary key and unique constraints from FieldSpec', () => {
    const snapshot = buildSnapshot([User])
    const users = snapshot.tables['users']
    expect(users?.primaryKey).toEqual(['id'])
    expect(users?.uniques).toEqual([['email']])
  })

  it('captures column attributes from FieldSpec', () => {
    const snapshot = buildSnapshot([User])
    const users = snapshot.tables['users']
    expect(users?.columns['id']).toEqual({
      name: 'id',
      type: 'int',
      nullable: false,
      hasDefault: true,
      autoIncrement: true,
      primaryKey: true,
      unique: false
    })
    expect(users?.columns['email']).toEqual({
      name: 'email',
      type: 'varchar',
      nullable: false,
      hasDefault: false,
      autoIncrement: false,
      primaryKey: false,
      unique: true,
      maxLength: 255
    })
    expect(users?.columns['age']).toEqual({
      name: 'age',
      type: 'int',
      nullable: true,
      hasDefault: false,
      autoIncrement: false,
      primaryKey: false,
      unique: false
    })
  })
})
