import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { authenticateUser, User } from '@tango-ts/contrib-auth'
import {
  createMysqlConnection,
  withConnection,
  type LooseDatabase
} from '@tango-ts/orm'

import { createSuperuserCommand, migrateApp } from '../src/index.js'
import { app as authApp } from '../../contrib-auth/src/app.js'

let db: Kysely<LooseDatabase>

beforeAll(async () => {
  // `createSuperuserCommand` resolves its connection from the environment,
  // exactly like the real `tango createsuperuser` invocation.
  process.env.TANGO_DB_HOST = process.env.TANGO_DB_HOST ?? '127.0.0.1'
  process.env.TANGO_DB_PORT = process.env.TANGO_DB_PORT ?? '3307'
  process.env.TANGO_DB_USER = process.env.TANGO_DB_USER ?? 'root'
  process.env.TANGO_DB_PASSWORD = process.env.TANGO_DB_PASSWORD ?? 'tango'
  process.env.TANGO_DB_NAME = process.env.TANGO_DB_NAME ?? 'tango_test'

  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST,
    port: Number(process.env.TANGO_DB_PORT),
    user: process.env.TANGO_DB_USER,
    password: process.env.TANGO_DB_PASSWORD,
    database: process.env.TANGO_DB_NAME
  })
  await sql`drop table if exists auth_tokens`.execute(db)
  await sql`drop table if exists auth_users`.execute(db)
  await sql`
    delete from tango_migrations where name like 'auth.%'
  `.execute(db).catch(() => undefined)
  await migrateApp({ app: authApp, db })
})

afterAll(async () => {
  if (db !== undefined) {
    await sql`drop table if exists auth_tokens`.execute(db)
    await sql`drop table if exists auth_users`.execute(db)
    await sql`
      delete from tango_migrations where name like 'auth.%'
    `.execute(db).catch(() => undefined)
    await db.destroy()
  }
})

describe('tango createsuperuser', () => {
  it('creates a working staff + superuser account from env-configured DB', async () => {
    const user = await createSuperuserCommand({
      email: 'root@example.com',
      password: 'root-pass-123',
      firstName: 'Root'
    })
    expect(user.email).toBe('root@example.com')
    expect(user.isStaff).toBeTruthy()
    expect(user.isSuperuser).toBeTruthy()

    // The created account must actually be able to log in.
    const authenticated = await withConnection(db, () =>
      authenticateUser('root@example.com', 'root-pass-123')
    )
    expect(authenticated?.id).toBe(user.id)

    // And the stored password is a Django-format hash, never plaintext.
    const row = await withConnection(db, () =>
      User.objects.get({ email: 'root@example.com' })
    )
    expect(row.password.startsWith('pbkdf2_sha256$')).toBe(true)
  })

  it('reports duplicate emails as a friendly error', async () => {
    await expect(
      createSuperuserCommand({
        email: 'root@example.com',
        password: 'other-pass-123'
      })
    ).rejects.toThrow('A user with email root@example.com already exists.')
  })
})
