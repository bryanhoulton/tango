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

let db: Kysely<LooseDatabase>

beforeAll(async () => {
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })
  await sql`drop table if exists serializer_users`.execute(db)
  await sql`
    create table serializer_users (
      id int primary key auto_increment,
      email varchar(255) not null unique,
      age int null,
      name varchar(255) not null
    )
  `.execute(db)
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists serializer_users`.execute(db)
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
})
