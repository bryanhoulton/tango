import { describe, expect, it } from 'vitest'

import { f, model, parseLookup, r } from '../src/index.js'

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

describe('parseLookup', () => {
  it('defaults to exact when there is no operator suffix', () => {
    expect(parseLookup('email')).toEqual({ column: 'email', operator: 'exact' })
  })
  it('splits a known operator suffix', () => {
    expect(parseLookup('age__gte')).toEqual({ column: 'age', operator: 'gte' })
  })
  it('treats an unknown suffix as part of the column', () => {
    expect(parseLookup('author__name')).toEqual({
      column: 'author__name',
      operator: 'exact'
    })
  })
})

describe('QuerySet SQL compilation', () => {
  it('selects all rows', () => {
    const { sql, parameters } = User.objects.all().compile()
    expect(sql).toBe('select * from `users`')
    expect(parameters).toEqual([])
  })

  it('compiles an exact lookup', () => {
    const { sql, parameters } = User.objects
      .filter({ email: 'a@b.com' })
      .compile()
    expect(sql).toBe('select * from `users` where `email` = ?')
    expect(parameters).toEqual(['a@b.com'])
  })

  it('combines multiple lookups in one filter with AND', () => {
    const { sql, parameters } = User.objects
      .filter({ age__gte: 18, name: 'Bryan' })
      .compile()
    expect(sql).toBe(
      'select * from `users` where (`age` >= ? and `name` = ?)'
    )
    expect(parameters).toEqual([18, 'Bryan'])
  })

  it('compiles an `in` lookup', () => {
    const { sql, parameters } = User.objects
      .filter({ id__in: [1, 2, 3] })
      .compile()
    expect(sql).toBe('select * from `users` where `id` in (?, ?, ?)')
    expect(parameters).toEqual([1, 2, 3])
  })

  it('compiles isnull', () => {
    const trueCase = User.objects.filter({ age__isnull: true }).compile()
    expect(trueCase.sql).toBe('select * from `users` where `age` is null')

    const falseCase = User.objects.filter({ age__isnull: false }).compile()
    expect(falseCase.sql).toBe('select * from `users` where `age` is not null')
  })

  it('compiles icontains as a case-insensitive LIKE with escaped wildcards', () => {
    const { sql, parameters } = User.objects
      .filter({ name__icontains: '50%_off' })
      .compile()
    expect(sql).toBe('select * from `users` where `name` like ?')
    expect(parameters).toEqual(['%50\\%\\_off%'])
  })

  it('compiles startswith as case-sensitive LIKE BINARY', () => {
    const { sql, parameters } = User.objects
      .filter({ name__startswith: 'Br' })
      .compile()
    expect(sql).toBe('select * from `users` where `name` like binary ?')
    expect(parameters).toEqual(['Br%'])
  })

  it('chains filters as ANDed clauses', () => {
    const { sql, parameters } = User.objects
      .filter({ age__gte: 18 })
      .filter({ name: 'Bryan' })
      .compile()
    expect(sql).toBe(
      'select * from `users` where `age` >= ? and `name` = ?'
    )
    expect(parameters).toEqual([18, 'Bryan'])
  })

  it('negates an exclude clause', () => {
    const { sql, parameters } = User.objects
      .exclude({ age__gte: 18 })
      .compile()
    expect(sql).toBe('select * from `users` where not `age` >= ?')
    expect(parameters).toEqual([18])
  })

  it('compiles relation lookups as left joins', () => {
    const { sql, parameters } = Post.objects
      .filter({ author__email__icontains: 'example.com' })
      .compile()
    expect(sql).toBe(
      'select `posts`.* from `posts` left join `users` as `author` on `posts`.`authorId` = `author`.`id` where `author`.`email` like ?'
    )
    expect(parameters).toEqual(['%example.com%'])
  })

  it('compiles selectRelated as a left join with aliased related columns', () => {
    const { sql, parameters } = Post.objects.selectRelated('author').compile()
    expect(sql).toBe(
      'select `posts`.*, `author`.`id` as `author__id`, `author`.`email` as `author__email`, `author`.`age` as `author__age`, `author`.`name` as `author__name` from `posts` left join `users` as `author` on `posts`.`authorId` = `author`.`id`'
    )
    expect(parameters).toEqual([])
  })

  it('strips snake_case _id suffixes into relation names (tag_id -> tag)', () => {
    const Tag = model('tags', {
      id: f.int().primaryKey().autoIncrement(),
      name: f.varchar(255)
    })
    const Task = model('tasks', {
      id: f.int().primaryKey().autoIncrement(),
      tag_id: f.foreignKey(() => Tag, 'id').nullable(),
      title: f.varchar(255)
    })

    const related = Task.objects.selectRelated('tag').compile()
    expect(related.sql).toBe(
      'select `tasks`.*, `tag`.`id` as `tag__id`, `tag`.`name` as `tag__name` from `tasks` left join `tags` as `tag` on `tasks`.`tag_id` = `tag`.`id`'
    )

    const filtered = Task.objects.filter({ tag__name__icontains: 'ops' }).compile()
    expect(filtered.sql).toBe(
      'select `tasks`.* from `tasks` left join `tags` as `tag` on `tasks`.`tag_id` = `tag`.`id` where `tag`.`name` like ?'
    )
    expect(filtered.parameters).toEqual(['%ops%'])
  })

  it('compiles nested FK relation lookups as deterministic join chains', () => {
    const { sql, parameters } = Book.objects
      .filter({ author__organization__name__icontains: 'labs' })
      .compile()
    expect(sql).toBe(
      'select `books`.* from `books` left join `authors` as `author` on `books`.`authorId` = `author`.`id` left join `organizations` as `author__organization` on `author`.`organizationId` = `author__organization`.`id` where `author__organization`.`name` like ?'
    )
    expect(parameters).toEqual(['%labs%'])
  })

  it('compiles reverse relation lookups from declared hasMany relations', () => {
    const { sql, parameters } = Organization.objects
      .filter({ authors__name__icontains: 'ada' })
      .compile()
    expect(sql).toBe(
      'select `organizations`.* from `organizations` left join `authors` as `authors` on `organizations`.`id` = `authors`.`organizationId` where `authors`.`name` like ?'
    )
    expect(parameters).toEqual(['%ada%'])
  })

  it('compiles orderBy with ascending and descending keys', () => {
    const { sql, parameters } = User.objects
      .all()
      .orderBy('name', '-age')
      .compile()
    expect(sql).toBe('select * from `users` order by `name` asc, `age` desc')
    expect(parameters).toEqual([])
  })

  it('replaces previous ordering when orderBy is called again', () => {
    const { sql } = User.objects.all().orderBy('name').orderBy('-id').compile()
    expect(sql).toBe('select * from `users` order by `id` desc')
  })

  it('compiles limit and offset as bound parameters', () => {
    const { sql, parameters } = User.objects
      .all()
      .orderBy('id')
      .limit(10)
      .offset(20)
      .compile()
    expect(sql).toBe('select * from `users` order by `id` asc limit ? offset ?')
    expect(parameters).toEqual([10, 20])
  })

  it('emits an unlimited LIMIT when only offset is set (MySQL requires LIMIT)', () => {
    const { sql, parameters } = User.objects.all().offset(5).compile()
    expect(sql).toBe('select * from `users` limit ? offset ?')
    expect(parameters).toEqual([Number.MAX_SAFE_INTEGER, 5])
  })

  it('rejects non-integer or negative limit/offset', () => {
    expect(() => User.objects.all().limit(-1)).toThrow()
    expect(() => User.objects.all().offset(1.5)).toThrow()
  })

  it('compiles count over the filtered set, ignoring ordering and slicing', () => {
    const { sql, parameters } = User.objects
      .filter({ age__gte: 18 })
      .orderBy('name')
      .limit(2)
      .offset(4)
      .compileCount()
    expect(sql).toBe(
      'select count(*) as `count` from `users` where `age` >= ?'
    )
    expect(parameters).toEqual([18])
  })

  it('compiles count with relation-filter joins preserved', () => {
    const { sql } = Post.objects
      .filter({ author__name__icontains: 'ada' })
      .compileCount()
    expect(sql).toBe(
      'select count(*) as `count` from `posts` left join `users` as `author` on `posts`.`authorId` = `author`.`id` where `author`.`name` like ?'
    )
  })

  it('compiles nested selectRelated chains and aliases nested columns', () => {
    const { sql, parameters } = Book.objects
      .selectRelated('author__organization')
      .compile()
    expect(sql).toBe(
      'select `books`.*, `author`.`id` as `author__id`, `author`.`organizationId` as `author__organizationId`, `author`.`email` as `author__email`, `author`.`name` as `author__name`, `author__organization`.`id` as `author__organization__id`, `author__organization`.`name` as `author__organization__name` from `books` left join `authors` as `author` on `books`.`authorId` = `author`.`id` left join `organizations` as `author__organization` on `author`.`organizationId` = `author__organization`.`id`'
    )
    expect(parameters).toEqual([])
  })
})
