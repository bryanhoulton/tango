import { createServer } from 'node:net'

import { sql, type Kysely } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { serve, type DevServer } from '@tango-ts/adapters'
import { jsonResponse } from '@tango-ts/http'
import {
  createMysqlConnection,
  f,
  model,
  withConnection,
  type LooseDatabase
} from '@tango-ts/orm'
import { defineRoutes, route } from '@tango-ts/router'
import { defineApp, defineProject, type TangoProject } from '@tango-ts/server'

import { defineFunction, functionDispatchPath } from '../src/index.js'

// The full production path of the http transport, over real sockets and a real
// MySQL: route handler → fn.invoke() → signed POST to the project's own server
// → dispatch route → connection scope → ORM write — exactly what runs on Vercel
// behind the catch-all rewrite.

const EmailLog = model('function_email_logs', {
  id: f.int().primaryKey().autoIncrement(),
  recipient: f.varchar(255)
})

const recordEmail = defineFunction({
  name: 'recordEmail',
  handler: async (payload: { recipient: string }) => {
    const row = await EmailLog.objects.create({ recipient: payload.recipient })
    const total = await EmailLog.objects.count()
    return { id: row.id, total }
  }
})

const failingJob = defineFunction({
  name: 'failingJob',
  handler: (payload: null): Promise<undefined> => {
    void payload
    throw new Error('boom: recipient rejected')
  }
})

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Unable to allocate a test port.'))
        return
      }
      const { port } = address
      probe.close(() => resolve(port))
    })
  })
}

let db: Kysely<LooseDatabase>
let project: TangoProject
let server: DevServer

beforeAll(async () => {
  // No silent skip when the DB is missing — this throws loudly (project policy).
  db = createMysqlConnection({
    host: process.env.TANGO_DB_HOST ?? '127.0.0.1',
    port: Number(process.env.TANGO_DB_PORT ?? 3307),
    user: process.env.TANGO_DB_USER ?? 'root',
    password: process.env.TANGO_DB_PASSWORD ?? 'tango',
    database: process.env.TANGO_DB_NAME ?? 'tango_test'
  })
  await sql`drop table if exists function_email_logs`.execute(db)
  await sql`
    create table function_email_logs (
      id int primary key auto_increment,
      recipient varchar(255) not null
    )
  `.execute(db)

  const port = await freePort()
  const coreApp = defineApp({
    name: 'core',
    models: [EmailLog],
    routes: defineRoutes([
      route('POST', '/welcome/', async (ctx) => {
        const body = (await ctx.json()) as { recipient: string }
        const result = await recordEmail.invoke({ recipient: body.recipient })
        return jsonResponse(result)
      }),
      route('POST', '/welcome-deferred/', (ctx) => {
        const recipient = ctx.query.get('recipient') ?? 'missing'
        recordEmail.defer({ recipient })
        return jsonResponse({ queued: true })
      }),
      route('POST', '/failing/', async () => {
        try {
          await failingJob.invoke(null)
          return jsonResponse({ ok: true })
        } catch (err) {
          return jsonResponse(
            { detail: err instanceof Error ? err.message : 'unknown' },
            { status: 502 }
          )
        }
      })
    ]),
    functions: [recordEmail, failingJob]
  })
  project = defineProject({
    name: 'functions-integration',
    database: db,
    apps: [coreApp],
    functions: {
      transport: 'http',
      secret: 'integration-secret',
      url: `http://127.0.0.1:${port}`
    }
  })
  server = await serve(project, { port })
})

afterAll(async () => {
  await sql`drop table if exists function_email_logs`.execute(db)
  await server.close()
  // Drains deferred work, then destroys the pool.
  await project.dispose()
})

describe('functions over the http transport against a real MySQL', () => {
  it('invoke() round-trips through a second HTTP invocation and writes via the ORM', async () => {
    const response = await fetch(`${server.url}/core/welcome/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ recipient: 'ann@example.com' })
    })

    expect(response.status).toBe(200)
    const result = (await response.json()) as { id: number; total: number }
    expect(result.id).toBeGreaterThan(0)
    expect(result.total).toBe(1)

    await withConnection(db, async () => {
      const row = await EmailLog.objects.get({ id: result.id })
      expect(row.recipient).toBe('ann@example.com')
    })
  })

  it('handler errors propagate back to the calling route', async () => {
    const response = await fetch(`${server.url}/core/failing/`, {
      method: 'POST'
    })
    expect(response.status).toBe(502)
    const body = (await response.json()) as { detail: string }
    expect(body.detail).toContain('boom: recipient rejected')
    expect(body.detail).toContain('core/failingJob')
  })

  it('defer() returns immediately and the work lands in the database', async () => {
    const response = await fetch(
      `${server.url}/core/welcome-deferred/?recipient=deferred@example.com`,
      { method: 'POST' }
    )
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ queued: true })

    const deadline = Date.now() + 5000
    let count = 0
    while (Date.now() < deadline) {
      count = await withConnection(db, () =>
        EmailLog.objects.filter({ recipient: 'deferred@example.com' }).count()
      )
      if (count > 0) {
        break
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    expect(count).toBe(1)
  })

  it('the dispatch endpoint is not callable without a valid signature', async () => {
    const unsigned = await fetch(
      `${server.url}${functionDispatchPath('core', 'recordEmail')}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ payload: { recipient: 'attacker@example.com' } })
      }
    )
    expect(unsigned.status).toBe(404)
    expect(await unsigned.json()).toEqual({ detail: 'Not found.' })

    await withConnection(db, async () => {
      const count = await EmailLog.objects
        .filter({ recipient: 'attacker@example.com' })
        .count()
      expect(count).toBe(0)
    })
  })
})
