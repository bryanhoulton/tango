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

  it('accepts ISO 8601 strings for datetime fields and normalizes to Date', () => {
    const Event = model('events', {
      id: f.int().primaryKey().autoIncrement(),
      startsAt: f.datetime(),
      day: f.date()
    })
    const EventSerializer = modelSerializer(Event, {
      fields: ['id', 'startsAt', 'day'] as const,
      readOnlyFields: ['id'] as const
    })

    const serializer = EventSerializer.forUnknownInput({
      startsAt: '2026-06-09T12:30:00Z',
      day: '2026-06-09'
    })

    expect(serializer.isValid()).toBe(true)
    const data = serializer.validatedData as { startsAt: Date; day: Date }
    expect(data.startsAt).toBeInstanceOf(Date)
    expect(data.startsAt.toISOString()).toBe('2026-06-09T12:30:00.000Z')
    expect(data.day).toBeInstanceOf(Date)
    // Local midnight, so the calendar date round-trips through MySQL DATE.
    expect(data.day.getFullYear()).toBe(2026)
    expect(data.day.getMonth()).toBe(5)
    expect(data.day.getDate()).toBe(9)
  })

  it('rejects strings that are not valid ISO dates', () => {
    const Event = model('events', {
      id: f.int().primaryKey().autoIncrement(),
      startsAt: f.datetime(),
      day: f.date().nullable()
    })
    const EventSerializer = modelSerializer(Event, {
      fields: ['id', 'startsAt', 'day'] as const,
      readOnlyFields: ['id'] as const
    })

    const cases: [unknown, unknown][] = [
      ['5', '2026-02-30'], // `new Date('5')` parses but is not ISO; Feb 30 is not a real date
      ['2026-06-09', 'June 9'], // date-only is not a datetime; prose is not ISO
      [1717939800000, true] // epoch numbers and booleans are rejected
    ]
    for (const [startsAt, day] of cases) {
      const serializer = EventSerializer.forUnknownInput({ startsAt, day })
      expect(serializer.isValid()).toBe(false)
      expect(serializer.errors).toEqual({
        startsAt: ['Expected ISO 8601 datetime.'],
        day: ['Expected ISO 8601 date (YYYY-MM-DD) or null.']
      })
    }
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
