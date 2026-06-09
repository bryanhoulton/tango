import { expectTypeOf, test } from 'vitest'

import { f, model, r } from '../src/index.js'
import type { InferSelect } from '../src/index.js'

const User = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age: f.int().nullable(),
  name: f.varchar(255)
})
const Post = model('posts', {
  id: f.int().primaryKey().autoIncrement(),
  authorId: f.foreignKey(() => User, 'id'),
  title: f.varchar(255)
})
const OrganizationBase = model('organizations', {
  id: f.int().primaryKey().autoIncrement(),
  name: f.varchar(255)
})
const AuthorWithOrg = model('authors', {
  id: f.int().primaryKey().autoIncrement(),
  organizationId: f.foreignKey(() => OrganizationBase, 'id'),
  email: f.varchar(255),
  name: f.varchar(255)
})
const Organization = model(
  'organizations',
  {
    id: f.int().primaryKey().autoIncrement(),
    name: f.varchar(255)
  },
  {
    relations: {
      authors: r.hasMany(() => AuthorWithOrg, 'organizationId')
    }
  }
)
const Book = model('books', {
  id: f.int().primaryKey().autoIncrement(),
  authorId: f.foreignKey(() => AuthorWithOrg, 'id'),
  title: f.varchar(255)
})

test('select shape is inferred from the model', () => {
  expectTypeOf<InferSelect<typeof User.fields>>().toEqualTypeOf<{
    id: number
    email: string
    age: number | null
    name: string
  }>()
})

test('filter accepts valid, type-correct lookups', () => {
  type FilterArg = Parameters<typeof User.objects.filter>[0]
  expectTypeOf<FilterArg>().toMatchTypeOf<{
    age__gte?: number
    email__icontains?: string
  }>()
})

test('filter rejects invalid lookups and wrong value types', () => {
  // @ts-expect-error age (number) has no __icontains lookup
  void User.objects.filter({ age__icontains: 'x' })
  // @ts-expect-error wrong value type
  void User.objects.filter({ age__gte: 'old' })
  // @ts-expect-error unknown field
  void User.objects.filter({ nope: 1 })
})

test('create requires non-defaulted, non-nullable fields', () => {
  // @ts-expect-error missing required `email` and `name`
  void User.objects.create({})
  // id (auto-increment) and age (nullable) are optional; email + name required
  void User.objects.create({ email: 'a@b.com', name: 'Ann' })
})

test('foreign keys are typed as the referenced primary-key value', () => {
  void Post.objects.create({ authorId: 1, title: 'Hello' })
  void Post.objects.filter({ authorId: 1 })
  // @ts-expect-error foreign key value must match its declared primary-key type
  void Post.objects.create({ authorId: '1', title: 'Hello' })
})

test('foreign keys expose relation lookups inferred from the target model', () => {
  void Post.objects.filter({ author__email__icontains: 'example.com' })
  void Post.objects.filter({ author__age__gte: 18 })
  // @ts-expect-error related number field has no string lookup
  void Post.objects.filter({ author__age__icontains: '18' })
  // @ts-expect-error unknown relation
  void Post.objects.filter({ nope__email: 'x@example.com' })
})

test('selectRelated narrows returned rows with the related model shape', () => {
  const qs = Post.objects.selectRelated('author')
  void qs
  type Rows = Awaited<ReturnType<typeof qs.fetch>>
  expectTypeOf<Rows>().toMatchTypeOf<
    Array<{
      id: number
      authorId: number
      title: string
      author: {
        id: number
        email: string
        age: number | null
        name: string
      }
    }>
  >()
  // @ts-expect-error only declared FK relations can be selected
  void Post.objects.selectRelated('publisher')
})

test('nested foreign-key relation lookups are inferred through multiple hops', () => {
  void Book.objects.filter({
    author__organization__name__icontains: 'research'
  })
  // @ts-expect-error nested related number field has no string lookup
  void Book.objects.filter({ author__organization__id__icontains: '1' })
  // @ts-expect-error unknown nested relation
  void Book.objects.filter({ author__publisher__name: 'x' })
})

test('declared reverse relations expose typed lookups', () => {
  void Organization.objects.filter({ authors__name__icontains: 'ada' })
  void Organization.objects.filter({ authors__organization__name: 'Tango Labs' })
  // @ts-expect-error reverse relation has no unknown child field
  void Organization.objects.filter({ authors__nickname: 'ada' })
})

test('nested selectRelated narrows rows with nested related shapes', () => {
  const qs = Book.objects.selectRelated('author__organization')
  void qs
  type Rows = Awaited<ReturnType<typeof qs.fetch>>
  expectTypeOf<Rows>().toMatchTypeOf<
    Array<{
      id: number
      authorId: number
      title: string
      author: {
        id: number
        organizationId: number
        email: string
        name: string
        organization: {
          id: number
          name: string
        }
      }
    }>
  >()
})
