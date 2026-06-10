import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  createMysqlConnection,
  f,
  model,
  withConnection,
  type LooseDatabase
} from '@tango-ts/orm'

import { modelSerializer } from '../src/index.js'

const User = model('serializer_users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age: f.int().nullable(),
  name: f.varchar(255)
})

const UserSerializer = modelSerializer(User, {
  fields: ['id', 'email', 'age', 'name'] as const,
  readOnlyFields: ['id'] as const
})

const Event = model('serializer_events', {
  id: f.int().primaryKey().autoIncrement(),
  startsAt: f.datetime(),
  day: f.date()
})

const EventSerializer = modelSerializer(Event, {
  fields: ['id', 'startsAt', 'day'] as const,
  readOnlyFields: ['id'] as const
})

const Author = model('serializer_authors', {
  id: f.int().primaryKey().autoIncrement(),
  name: f.varchar(255),
  email: f.varchar(255)
})

const Post = model('serializer_posts', {
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

let db: Kysely<LooseDatabase>

beforeAll(async () => {
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })
  await sql`drop table if exists serializer_posts`.execute(db)
  await sql`drop table if exists serializer_authors`.execute(db)
  await sql`drop table if exists serializer_users`.execute(db)
  await sql`drop table if exists serializer_events`.execute(db)
  await sql`
    create table serializer_users (
      id int primary key auto_increment,
      email varchar(255) not null unique,
      age int null,
      name varchar(255) not null
    )
  `.execute(db)
  await sql`
    create table serializer_events (
      id int primary key auto_increment,
      startsAt datetime not null,
      day date not null
    )
  `.execute(db)
  await sql`
    create table serializer_authors (
      id int primary key auto_increment,
      name varchar(255) not null,
      email varchar(255) not null
    )
  `.execute(db)
  await sql`
    create table serializer_posts (
      id int primary key auto_increment,
      title varchar(255) not null,
      authorId int not null,
      foreign key (authorId) references serializer_authors(id)
    )
  `.execute(db)
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists serializer_posts`.execute(db)
    await sql`drop table if exists serializer_authors`.execute(db)
    await sql`drop table if exists serializer_users`.execute(db)
    await sql`drop table if exists serializer_events`.execute(db)
    await db.destroy()
  }
})

describe('ModelSerializer.save against a real ORM connection', () => {
  it('validates input and creates a row through Model.objects.create', async () => {
    await withConnection(db, async () => {
      const serializer = UserSerializer.forInput({
        email: 'ada@example.com',
        age: null,
        name: 'Ada'
      })

      expect(serializer.isValid()).toBe(true)
      const user = await serializer.save()

      expect(user.id).toBeGreaterThan(0)
      expect(user.email).toBe('ada@example.com')
      expect(UserSerializer.serialize(user)).toEqual({
        id: user.id,
        email: 'ada@example.com',
        age: null,
        name: 'Ada'
      })
    })
  })

  it('persists ISO string datetime/date input as JSON clients send it', async () => {
    await withConnection(db, async () => {
      // Exactly what arrives over HTTP: strings, because JSON has no Date.
      const serializer = EventSerializer.forUnknownInput({
        startsAt: '2026-06-09T12:30:00Z',
        day: '2026-06-09'
      })

      expect(serializer.isValid()).toBe(true)
      const event = await serializer.save()

      expect(event.id).toBeGreaterThan(0)
      expect(event.startsAt).toBeInstanceOf(Date)
      expect(event.startsAt.toISOString()).toBe('2026-06-09T12:30:00.000Z')
      expect(event.day).toBeInstanceOf(Date)
      expect(event.day.getFullYear()).toBe(2026)
      expect(event.day.getMonth()).toBe(5)
      expect(event.day.getDate()).toBe(9)
    })
  })
})

describe('nested serialization against a real ORM connection', () => {
  it('serializes selectRelated rows through the nested serializer', async () => {
    await withConnection(db, async () => {
      const ada = await Author.objects.create({
        name: 'Ada',
        email: 'ada@example.com'
      })
      const created = await PostSerializer.forUnknownInput({
        title: 'Analytical Engine',
        authorId: ada.id
      }).save()

      const row = await Post.objects
        .selectRelated('author')
        .get({ id: created.id })

      expect(PostSerializer.serialize(row)).toEqual({
        id: created.id,
        title: 'Analytical Engine',
        authorId: ada.id,
        // Only the nested serializer's fields: email stays internal.
        author: { id: ada.id, name: 'Ada' }
      })
    })
  })
})
