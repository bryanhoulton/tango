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

// --- Nested serializers ------------------------------------------------------

const Author = model('authors', {
  id: f.int().primaryKey().autoIncrement(),
  name: f.varchar(255)
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

test('nested output is inferred from the nested serializer', () => {
  const output = PostSerializer.serialize({
    id: 1,
    title: 'Hi',
    authorId: 2,
    author: { id: 2, name: 'Ada' }
  })
  expectTypeOf(output).toEqualTypeOf<{
    id: number
    title: string
    authorId: number
    author: {
      id: number
      name: string
    }
  }>()
})

test('serialize requires the related row when nesting is configured', () => {
  // @ts-expect-error author relation data is required by the nested serializer
  PostSerializer.serialize({ id: 1, title: 'Hi', authorId: 2 })
})

test('nested keys must be relation names on the model', () => {
  modelSerializer(Post, {
    fields: ['id', 'title'] as const,
    // @ts-expect-error reviewer is not a relation of Post
    nested: { reviewer: AuthorSerializer }
  })
})

test('nested serializers must serialize the related model', () => {
  const Tag = model('tags', {
    id: f.int().primaryKey().autoIncrement(),
    label: f.varchar(255)
  })
  const TagSerializer = modelSerializer(Tag, {
    fields: ['id', 'label'] as const
  })
  modelSerializer(Post, {
    fields: ['id', 'title'] as const,
    // @ts-expect-error TagSerializer cannot serialize Post's author rows
    nested: { author: TagSerializer }
  })
})

test('models without relations accept no nested keys', () => {
  modelSerializer(User, {
    fields: ['id', 'email'] as const,
    // @ts-expect-error User has no relations
    nested: { author: AuthorSerializer }
  })
})

// --- Nullable FKs and snake_case columns --------------------------------------

const Tag = model('tags', {
  id: f.int().primaryKey().autoIncrement(),
  name: f.varchar(255)
})

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

test('snake_case FK columns nest under the logical relation name', () => {
  modelSerializer(Item, {
    fields: ['id', 'label'] as const,
    // @ts-expect-error the relation is `tag`, not the raw column `tag_id`
    nested: { tag_id: TagSerializer }
  })
})

test('a nullable FK relation accepts and outputs null', () => {
  const output = ItemSerializer.serialize({
    id: 1,
    label: 'Untagged',
    tag_id: null,
    tag: null
  })
  expectTypeOf(output).toEqualTypeOf<{
    id: number
    label: string
    tag_id: number | null
    tag: { id: number; name: string } | null
  }>()

  // A non-nullable FK relation never types as null.
  const post = PostSerializer.serialize({
    id: 1,
    title: 'Hi',
    authorId: 2,
    // @ts-expect-error author sits behind a non-nullable FK
    author: null
  })
  void post
})
