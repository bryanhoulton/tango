import { describe, expect, it } from 'vitest'

import { f, model } from '@tango-ts/orm'

import { modelSerializer } from '../src/index.js'

const User = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age: f.int().nullable(),
  active: f.boolean().default(true),
  name: f.varchar(255)
})

const UserSerializer = modelSerializer(User, {
  fields: ['id', 'email', 'age', 'active', 'name'] as const,
  readOnlyFields: ['id'] as const
})

describe('modelSerializer', () => {
  it('serializes configured fields only', () => {
    const data = UserSerializer.serialize({
      id: 1,
      email: 'ada@example.com',
      age: null,
      active: true,
      name: 'Ada'
    })

    expect(data).toEqual({
      id: 1,
      email: 'ada@example.com',
      age: null,
      active: true,
      name: 'Ada'
    })
  })

  it('validates required, nullable, and typed fields', () => {
    const serializer = UserSerializer.forUnknownInput({
      email: 42,
      age: 'old',
      active: 'yes'
    })

    expect(serializer.isValid()).toBe(false)
    expect(serializer.errors).toEqual({
      email: ['Expected string.'],
      age: ['Expected number or null.'],
      active: ['Expected boolean.'],
      name: ['This field is required.']
    })
    expect(serializer.validatedData).toBeUndefined()
  })

  it('accepts nullable/defaulted fields as optional input', () => {
    const serializer = UserSerializer.forInput({
      email: 'ada@example.com',
      name: 'Ada'
    })

    expect(serializer.isValid()).toBe(true)
    expect(serializer.errors).toEqual({})
    expect(serializer.validatedData).toEqual({
      email: 'ada@example.com',
      name: 'Ada'
    })
  })

  it('rejects unknown input fields', () => {
    const serializer = UserSerializer.forUnknownInput({
      email: 'ada@example.com',
      name: 'Ada',
      nickname: 'countess'
    })

    expect(serializer.isValid()).toBe(false)
    expect(serializer.errors).toEqual({
      nickname: ['Unknown field.']
    })
  })
})
