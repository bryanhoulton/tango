import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createMysqlConnection,
  DoesNotExist,
  atomic,
  f,
  model,
  r,
  withConnection
} from '../src/index.js'
import type { LooseDatabase } from '../src/index.js'

const User = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age: f.int().nullable(),
  name: f.varchar(255)
})
const Author = model('authors', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  name: f.varchar(255)
})
const Post = model('posts', {
  id: f.int().primaryKey().autoIncrement(),
  authorId: f.foreignKey(() => Author, 'id', { onDelete: 'cascade' }),
  title: f.varchar(255)
})
const OrganizationBase = model('organizations', {
  id: f.int().primaryKey().autoIncrement(),
  name: f.varchar(255)
})
const AuthorWithOrg = model('authors_with_org', {
  id: f.int().primaryKey().autoIncrement(),
  organizationId: f.foreignKey(() => OrganizationBase, 'id', { onDelete: 'cascade' }),
  email: f.varchar(255).unique(),
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
  authorId: f.foreignKey(() => AuthorWithOrg, 'id', { onDelete: 'cascade' }),
  title: f.varchar(255)
})
const Feature = model('features', {
  id: f.int().primaryKey().autoIncrement(),
  name: f.varchar(255),
  enabled: f.boolean().default(false)
})

let db: Kysely<LooseDatabase>

beforeAll(async () => {
  // No silent skip when the DB is missing — this throws loudly (project policy).
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })

  await sql`drop table if exists posts`.execute(db)
  await sql`drop table if exists books`.execute(db)
  await sql`drop table if exists authors_with_org`.execute(db)
  await sql`drop table if exists organizations`.execute(db)
  await sql`drop table if exists authors`.execute(db)
  await sql`drop table if exists users`.execute(db)
  await sql`
    create table users (
      id int primary key auto_increment,
      email varchar(255) not null unique,
      age int null,
      name varchar(255) not null
    )
  `.execute(db)
  await sql`
    create table authors (
      id int primary key auto_increment,
      email varchar(255) not null unique,
      name varchar(255) not null
    )
  `.execute(db)
  await sql`
    create table posts (
      id int primary key auto_increment,
      authorId int not null,
      title varchar(255) not null,
      constraint posts_authorId_fk foreign key (authorId) references authors(id) on delete cascade
    )
  `.execute(db)
  await sql`
    create table organizations (
      id int primary key auto_increment,
      name varchar(255) not null
    )
  `.execute(db)
  await sql`
    create table authors_with_org (
      id int primary key auto_increment,
      organizationId int not null,
      email varchar(255) not null unique,
      name varchar(255) not null,
      constraint authors_with_org_organizationId_fk foreign key (organizationId) references organizations(id) on delete cascade
    )
  `.execute(db)
  await sql`
    create table books (
      id int primary key auto_increment,
      authorId int not null,
      title varchar(255) not null,
      constraint books_authorId_fk foreign key (authorId) references authors_with_org(id) on delete cascade
    )
  `.execute(db)
  await sql`
    create table features (
      id int primary key auto_increment,
      name varchar(255) not null,
      enabled tinyint(1) not null default 0
    )
  `.execute(db)
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists features`.execute(db)
    await sql`drop table if exists posts`.execute(db)
    await sql`drop table if exists books`.execute(db)
    await sql`drop table if exists authors_with_org`.execute(db)
    await sql`drop table if exists organizations`.execute(db)
    await sql`drop table if exists authors`.execute(db)
    await sql`drop table if exists users`.execute(db)
    await db.destroy()
  }
})

describe('ORM against a real MySQL', () => {
  it('creates a row and reads it back with inferred types', async () => {
    await withConnection(db, async () => {
      const created = await User.objects.create({
        email: 'ann@example.com',
        name: 'Ann',
        age: 30
      })
      expect(created.id).toBeGreaterThan(0)
      expect(created.email).toBe('ann@example.com')
      expect(created.age).toBe(30)
    })
  })

  it('filters rows with Django-style lookups', async () => {
    await withConnection(db, async () => {
      await User.objects.create({ email: 'bob@example.com', name: 'Bob', age: 17 })
      await User.objects.create({ email: 'cy@example.com', name: 'Cy', age: 50 })

      const adults = await User.objects.filter({ age__gte: 18 })
      const emails = adults.map((u) => u.email).sort()

      expect(emails).toContain('ann@example.com')
      expect(emails).toContain('cy@example.com')
      expect(emails).not.toContain('bob@example.com')
    })
  })

  it('excludes rows', async () => {
    await withConnection(db, async () => {
      const nonAdults = await User.objects.exclude({ age__gte: 18 })
      expect(nonAdults.map((u) => u.email)).toEqual(['bob@example.com'])
    })
  })

  it('get() returns one row', async () => {
    await withConnection(db, async () => {
      const ann = await User.objects.get({ email: 'ann@example.com' })
      expect(ann.name).toBe('Ann')
    })
  })

  it('get() throws DoesNotExist when nothing matches', async () => {
    await withConnection(db, async () => {
      await expect(
        User.objects.get({ email: 'nobody@example.com' })
      ).rejects.toBeInstanceOf(DoesNotExist)
    })
  })

  it('awaiting a QuerySet executes it (thenable)', async () => {
    await withConnection(db, async () => {
      const everyone = await User.objects.all()
      expect(everyone.length).toBe(3)
    })
  })

  it('counts in SQL without fetching rows', async () => {
    await withConnection(db, async () => {
      expect(await User.objects.count()).toBe(3)
      expect(await User.objects.filter({ age__gte: 18 }).count()).toBe(2)
    })
  })

  it('reads boolean columns back as true/false, not tinyint 0/1', async () => {
    await withConnection(db, async () => {
      const on = await Feature.objects.create({ name: 'dark-mode', enabled: true })
      const off = await Feature.objects.create({ name: 'beta-flow', enabled: false })

      // toBe(true), not toBeTruthy(): tinyint comes back as 1 without the
      // driver-level cast, and 1 is truthy — that's the exact bug this guards.
      expect(on.enabled).toBe(true)
      expect(off.enabled).toBe(false)

      const fetched = await Feature.objects.get({ name: 'dark-mode' })
      expect(fetched.enabled).toBe(true)

      const enabledRows = await Feature.objects.filter({ enabled: true })
      expect(enabledRows.map((row) => row.name)).toEqual(['dark-mode'])
    })
  })

  it('orders, limits, and offsets in SQL', async () => {
    await withConnection(db, async () => {
      const oldestFirst = await User.objects.all().orderBy('-age')
      expect(oldestFirst.map((u) => u.email)).toEqual([
        'cy@example.com',
        'ann@example.com',
        'bob@example.com'
      ])

      const secondPage = await User.objects
        .all()
        .orderBy('-age')
        .limit(1)
        .offset(1)
      expect(secondPage.map((u) => u.email)).toEqual(['ann@example.com'])
    })
  })
})

describe('ORM atomic transactions against a real MySQL', () => {
  it('rolls back all writes when the transaction callback throws', async () => {
    await withConnection(db, async () => {
      await expect(
        atomic(async () => {
          await User.objects.create({
            email: 'rollback@example.com',
            name: 'Rollback',
            age: 1
          })
          throw new Error('rollback')
        })
      ).rejects.toThrow('rollback')

      await expect(
        User.objects.get({ email: 'rollback@example.com' })
      ).rejects.toBeInstanceOf(DoesNotExist)
    })
  })

  it('commits writes when the transaction callback succeeds', async () => {
    await withConnection(db, async () => {
      await atomic(async () => {
        await User.objects.create({
          email: 'commit@example.com',
          name: 'Commit',
          age: 2
        })
      })

      const row = await User.objects.get({ email: 'commit@example.com' })
      expect(row.name).toBe('Commit')
    })
  })
})

describe('nested and reverse relation traversal against a real MySQL', () => {
  it('filters through nested FK paths, reverse paths, and inflates nested selectRelated', async () => {
    await withConnection(db, async () => {
      const labs = await Organization.objects.create({ name: 'Tango Labs' })
      const archive = await Organization.objects.create({ name: 'Archive' })
      const ada = await AuthorWithOrg.objects.create({
        organizationId: labs.id,
        email: 'ada@labs.example',
        name: 'Ada'
      })
      const grace = await AuthorWithOrg.objects.create({
        organizationId: archive.id,
        email: 'grace@archive.example',
        name: 'Grace'
      })
      await Book.objects.create({ authorId: ada.id, title: 'Analytical Notes' })
      await Book.objects.create({ authorId: grace.id, title: 'Compiler Notes' })

      const labBooks = await Book.objects.filter({
        author__organization__name__icontains: 'tango'
      })
      expect(labBooks.map((book) => book.title)).toEqual(['Analytical Notes'])

      const adaOrganizations = await Organization.objects.filter({
        authors__name__icontains: 'ada'
      })
      expect(adaOrganizations.map((org) => org.name)).toEqual(['Tango Labs'])

      const [book] = await Book.objects
        .selectRelated('author__organization')
        .filter({ title: 'Analytical Notes' })

      expect(book?.author.organization).toEqual({
        id: labs.id,
        name: 'Tango Labs'
      })
    })
  })
})

describe('ORM relation traversal against a real MySQL', () => {
  it('filters through FK relations and selectRelated inflates the joined row', async () => {
    await withConnection(db, async () => {
      const ada = await Author.objects.create({
        email: 'ada@example.com',
        name: 'Ada'
      })
      const grace = await Author.objects.create({
        email: 'grace@example.com',
        name: 'Grace'
      })
      await Post.objects.create({ authorId: ada.id, title: 'Analytical Engine' })
      await Post.objects.create({ authorId: grace.id, title: 'Compiler Notes' })

      const adaPosts = await Post.objects.filter({
        author__email__icontains: 'ada@'
      })
      expect(adaPosts.map((post) => post.title)).toEqual(['Analytical Engine'])

      const [post] = await Post.objects
        .selectRelated('author')
        .filter({ title: 'Compiler Notes' })

      expect(post?.author).toEqual({
        id: grace.id,
        email: 'grace@example.com',
        name: 'Grace'
      })
    })
  })
})
