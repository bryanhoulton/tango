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

  it('validates values against choices', () => {
    const Post = model('posts', {
      id: f.int().primaryKey().autoIncrement(),
      status: f.varchar(20).choices(['draft', 'published']).default('draft'),
      priority: f.int().choices([1, 2, 3]).nullable()
    })
    const PostSerializer = modelSerializer(Post, {
      fields: ['id', 'status', 'priority'] as const,
      readOnlyFields: ['id'] as const
    })

    const valid = PostSerializer.forUnknownInput({ status: 'published', priority: 2 })
    expect(valid.isValid()).toBe(true)
    expect(valid.validatedData).toEqual({ status: 'published', priority: 2 })

    const invalid = PostSerializer.forUnknownInput({ status: 'archived', priority: 9 })
    expect(invalid.isValid()).toBe(false)
    expect(invalid.errors).toEqual({
      status: ['Expected one of: "draft", "published".'],
      priority: ['Expected one of: 1, 2, 3 or null.']
    })

    // Nullable choice fields still accept null.
    const nullable = PostSerializer.forUnknownInput({ status: 'draft', priority: null })
    expect(nullable.isValid()).toBe(true)
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

describe('nested serializers', () => {
  const Author = model('authors', {
    id: f.int().primaryKey().autoIncrement(),
    name: f.varchar(255),
    secret: f.varchar(255)
  })

  const Post = model('posts', {
    id: f.int().primaryKey().autoIncrement(),
    title: f.varchar(255),
    authorId: f.foreignKey(() => Author, 'id')
  })

  const AuthorSerializer = modelSerializer(Author, {
    fields: ['id', 'name'] as const,
    readOnlyFields: ['id'] as const
  })

  const PostSerializer = modelSerializer(Post, {
    fields: ['id', 'title', 'authorId'] as const,
    readOnlyFields: ['id'] as const,
    nested: { author: AuthorSerializer }
  })

  it('serializes nested relations through the nested serializer', () => {
    const output = PostSerializer.serialize({
      id: 1,
      title: 'Hi',
      authorId: 2,
      author: { id: 2, name: 'Ada', secret: 'hidden' }
    })

    // Only the nested serializer's configured fields appear.
    expect(output).toEqual({
      id: 1,
      title: 'Hi',
      authorId: 2,
      author: { id: 2, name: 'Ada' }
    })
  })

  it('serializes a missing relation as null', () => {
    const row = {
      id: 1,
      title: 'Hi',
      authorId: 2,
      author: null
    } as unknown as Parameters<typeof PostSerializer.serialize>[0]

    expect(PostSerializer.serialize(row)).toEqual({
      id: 1,
      title: 'Hi',
      authorId: 2,
      author: null
    })
  })

  it('serializes a null relation behind a nullable FK as null', () => {
    const Tag = model('tags', {
      id: f.int().primaryKey().autoIncrement(),
      name: f.varchar(255)
    })
    // snake_case FK column: the nested key is the logical name `tag`.
    const Item = model('items', {
      id: f.int().primaryKey().autoIncrement(),
      tag_id: f.foreignKey(() => Tag, 'id').nullable(),
      label: f.varchar(255)
    })
    const TagSerializer = modelSerializer(Tag, {
      fields: ['id', 'name'] as const
    })
    const ItemSerializer = modelSerializer(Item, {
      fields: ['id', 'label', 'tag_id'] as const,
      nested: { tag: TagSerializer }
    })

    expect(
      ItemSerializer.serialize({ id: 1, label: 'Untagged', tag_id: null, tag: null })
    ).toEqual({ id: 1, label: 'Untagged', tag_id: null, tag: null })

    expect(
      ItemSerializer.serialize({
        id: 2,
        label: 'Tagged',
        tag_id: 7,
        tag: { id: 7, name: 'ops' }
      })
    ).toEqual({ id: 2, label: 'Tagged', tag_id: 7, tag: { id: 7, name: 'ops' } })
  })

  it('silently ignores read-only nested keys in input (DRF parity)', () => {
    const serializer = PostSerializer.forUnknownInput({
      title: 'Hi',
      authorId: 2,
      author: { name: 'Ada' }
    })

    expect(serializer.isValid()).toBe(true)
    expect(serializer.errors).toEqual({})
    expect(serializer.validatedData).toEqual({ title: 'Hi', authorId: 2 })
  })

  it('nested input does not satisfy required writable fields', () => {
    const serializer = PostSerializer.forUnknownInput({
      author: { name: 'Ada' }
    })

    expect(serializer.isValid()).toBe(false)
    expect(serializer.errors).toEqual({
      title: ['This field is required.'],
      authorId: ['This field is required.']
    })
  })

  it('supports multi-level nesting', () => {
    const Publisher = model('publishers', {
      id: f.int().primaryKey().autoIncrement(),
      name: f.varchar(255)
    })
    const Book = model('books', {
      id: f.int().primaryKey().autoIncrement(),
      title: f.varchar(255),
      publisherId: f.foreignKey(() => Publisher, 'id')
    })
    const Review = model('reviews', {
      id: f.int().primaryKey().autoIncrement(),
      stars: f.int(),
      bookId: f.foreignKey(() => Book, 'id')
    })

    const PublisherSerializer = modelSerializer(Publisher, {
      fields: ['id', 'name'] as const
    })
    const BookSerializer = modelSerializer(Book, {
      fields: ['id', 'title'] as const,
      nested: { publisher: PublisherSerializer }
    })
    const ReviewSerializer = modelSerializer(Review, {
      fields: ['id', 'stars'] as const,
      nested: { book: BookSerializer }
    })

    expect(
      ReviewSerializer.serialize({
        id: 1,
        stars: 5,
        bookId: 2,
        book: {
          id: 2,
          title: 'Dune',
          publisherId: 3,
          publisher: { id: 3, name: 'Chilton' }
        }
      })
    ).toEqual({
      id: 1,
      stars: 5,
      book: {
        id: 2,
        title: 'Dune',
        publisher: { id: 3, name: 'Chilton' }
      }
    })
  })
})
