import { expectTypeOf, test } from 'vitest'

import { f, model } from '@tango-ts/orm'

import { modelSerializer } from '../src/index.js'

const User = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age: f.int().nullable(),
  name: f.varchar(255)
})

const UserSerializer = modelSerializer(User, {
  fields: ['id', 'email', 'age', 'name'] as const,
  readOnlyFields: ['id'] as const
})

test('serialized output is inferred from configured fields', () => {
  const output = UserSerializer.serialize({
    id: 1,
    email: 'ada@example.com',
    age: null,
    name: 'Ada'
  })
  expectTypeOf(output).toEqualTypeOf<{
    id: number
    email: string
    age: number | null
    name: string
  }>()
})

test('input data excludes read-only fields and keeps nullable fields optional', () => {
  const serializer = UserSerializer.forInput({
    email: 'ada@example.com',
    name: 'Ada',
    age: null
  })
  expectTypeOf(serializer.validatedData).toEqualTypeOf<
    | {
        email: string
        name: string
        age?: number | null
      }
    | undefined
  >()
  // @ts-expect-error id is read-only input
  UserSerializer.forInput({ id: 1, email: 'ada@example.com', name: 'Ada' })
  // @ts-expect-error email is required
  UserSerializer.forInput({ name: 'Ada' })
})

test('configured fields must exist on the model', () => {
  modelSerializer(User, {
    // @ts-expect-error not a model field
    fields: ['id', 'nickname'] as const
  })
})
