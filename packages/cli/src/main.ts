#!/usr/bin/env node
import { createMysqlConnection } from '@tango-ts/orm'

import {
  checkMigrations,
  ensureMysqlDatabase,
  loadApp,
  makemigrations,
  migrateApp,
  mysqlConnectionOptionsFromEnv,
  runDevServer,
  runServer,
  startApp,
  startProject
} from './index.js'

function valueAfter(args: readonly string[], flag: string): string | undefined {
  const idx = args.indexOf(flag)
  return idx === -1 ? undefined : args[idx + 1]
}

function valuesAfter(args: readonly string[], flag: string): string[] {
  const values: string[] = []
  for (let idx = 0; idx < args.length; idx += 1) {
    const value = args[idx + 1]
    if (args[idx] === flag && value !== undefined) {
      values.push(value)
    }
  }
  return values
}

async function main(): Promise<void> {
  const [, , command, ...args] = process.argv

  if (command === 'serve') {
    const handlerPath = valueAfter(args, '--handler')
    const rawPort = valueAfter(args, '--port') ?? process.env.PORT ?? '8000'
    const port = Number(rawPort)
    if (!Number.isInteger(port) || port < 0) {
      throw new Error(`Invalid port "${rawPort}".`)
    }
    const host = valueAfter(args, '--host') ?? process.env.HOST ?? '127.0.0.1'
    // Blocks until SIGINT/SIGTERM, then drains requests and closes the DB pool.
    await runServer({ handlerPath, host, port })
    return
  }

  if (command === 'dev') {
    const handlerPath = valueAfter(args, '--handler')
    if (handlerPath === undefined) {
      throw new Error('Missing --handler <path-to-web-handler-module>.')
    }
    const port = Number(valueAfter(args, '--port') ?? 8000)
    const host = valueAfter(args, '--host') ?? '127.0.0.1'
    const buildCommand = valueAfter(args, '--build')
    const watchDirs = valuesAfter(args, '--watch')
    await runDevServer({ handlerPath, host, port, buildCommand, watchDirs })
    return
  }

  if (command === 'startproject') {
    const name = args[0]
    if (name === undefined) {
      throw new Error('Missing project name.')
    }
    const directory = valueAfter(args, '--directory') ?? name
    await startProject({ name, directory })
    console.log(`Created Tango project ${name} at ${directory}`)
    return
  }

  if (command === 'startapp') {
    const name = args[0]
    if (name === undefined) {
      throw new Error('Missing app name.')
    }
    const directory = valueAfter(args, '--directory') ?? name
    await startApp({ name, directory })
    console.log(`Created Tango app ${name} at ${directory}`)
    return
  }

  const appPath = valueAfter(args, '--app')
  if (appPath === undefined) {
    throw new Error('Missing --app <path-to-app-module>.')
  }
  const app = await loadApp(appPath)
  const migrationsDir = valueAfter(args, '--migrations-dir')

  if (command === 'makemigrations') {
    const name = valueAfter(args, '--name') ?? 'auto'
    const result = await makemigrations({
      app,
      migrationsDir,
      name
    })
    if (result.written) {
      console.log(`Created ${result.path}`)
    } else {
      console.log('No changes detected.')
    }
    return
  }

  if (command === 'check') {
    await checkMigrations({ app, migrationsDir })
    console.log('No model changes detected.')
    return
  }

  if (command === 'migrate') {
    const database = valueAfter(args, '--database')
    const dbOptions = {
      ...mysqlConnectionOptionsFromEnv(),
      ...(database === undefined ? {} : { database })
    }
    await ensureMysqlDatabase(dbOptions)
    const db = createMysqlConnection(dbOptions)
    try {
      const applied = await migrateApp({ app, db, migrationsDir })
      console.log(
        applied.length === 0
          ? 'No migrations to apply.'
          : `Applied migrations: ${applied.join(', ')}`
      )
    } finally {
      await db.destroy()
    }
    return
  }

  throw new Error(
    `Unknown command "${command ?? ''}". Use startproject, startapp, makemigrations, migrate, check, serve, or dev.`
  )
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  console.error(message)
  process.exitCode = 1
})
