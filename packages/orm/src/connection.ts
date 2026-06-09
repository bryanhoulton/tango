import { AsyncLocalStorage } from 'node:async_hooks'

import {
  DummyDriver,
  Kysely,
  MysqlAdapter,
  MysqlDialect,
  MysqlIntrospector,
  MysqlQueryCompiler,
  type Transaction
} from 'kysely'
import { createPool, type PoolOptions } from 'mysql2'

/** A row of unknown columns — keeps the internal Kysely bridge typed without `any`. */
export type LooseRow = Record<string, unknown>
/** The loosely-typed database Kysely operates on internally. */
export type LooseDatabase = Record<string, LooseRow>
export type ActiveConnection = Kysely<LooseDatabase> | Transaction<LooseDatabase>
type MysqlDialectPool = ConstructorParameters<typeof MysqlDialect>[0]['pool']

// Request-scoped connection. Using AsyncLocalStorage keeps `Model.objects` ergonomic
// (no threading a `db` everywhere) while staying serverless-safe: the connection is
// scoped to one invocation and never leaks across requests in a warm container
// (DESIGN_PRINCIPLES.md P5). There is no module-level *mutable* connection.
const storage = new AsyncLocalStorage<ActiveConnection>()

/** Run `fn` with `db` as the active connection for everything inside it. */
export function withConnection<T>(
  db: Kysely<LooseDatabase>,
  fn: () => Promise<T>
): Promise<T> {
  return storage.run(db, fn)
}

/** Get the active connection, or throw if execution isn't inside `withConnection`. */
export function getConnection(): ActiveConnection {
  const db = storage.getStore()
  if (db === undefined) {
    throw new Error(
      'No Tango database connection in scope. Wrap execution in withConnection(db, () => ...).'
    )
  }
  return db
}

function canStartTransaction(
  db: ActiveConnection
): db is Kysely<LooseDatabase> {
  return 'transaction' in db
}

export async function atomic<T>(fn: () => Promise<T>): Promise<T> {
  const db = getConnection()
  if (!canStartTransaction(db)) {
    return fn()
  }
  return db.transaction().execute((trx) => storage.run(trx, fn))
}

/** Build a real MySQL connection from mysql2 pool options. */
export function createMysqlConnection(
  options: PoolOptions
): Kysely<LooseDatabase> {
  const pool = createPool(options) as unknown as MysqlDialectPool
  return new Kysely<LooseDatabase>({
    dialect: new MysqlDialect({ pool })
  })
}

/**
 * A driverless Kysely used only to compile queries to SQL — no database required.
 * This powers the unit tests that assert generated SQL. It is pure, deterministic,
 * and immutable, so it is safe as a module constant (it holds no request state).
 */
export const COMPILE_ONLY: Kysely<LooseDatabase> = new Kysely<LooseDatabase>({
  dialect: {
    createAdapter: () => new MysqlAdapter(),
    createDriver: () => new DummyDriver(),
    createQueryCompiler: () => new MysqlQueryCompiler(),
    createIntrospector: (db) => new MysqlIntrospector(db)
  }
})
