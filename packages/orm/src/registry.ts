import type { Fields } from '@tango-ts/core-types'

export interface AnyModel {
  readonly tableName: string
  readonly fields: Fields
}

export interface TangoAppConfig {
  readonly name: string
  readonly models: readonly AnyModel[]
  /** Directory where generated migration files live. CLI-only metadata. */
  readonly migrationsDir?: string
}

export interface TangoApp {
  readonly name: string
  readonly models: readonly AnyModel[]
  readonly migrationsDir?: string
}

/**
 * Explicit app registry consumed by the CLI. We avoid filesystem model discovery so
 * serverless bundles stay deterministic and tree-shakeable.
 */
export function defineApp(config: TangoAppConfig): TangoApp {
  const seen = new Set<string>()
  for (const model of config.models) {
    if (seen.has(model.tableName)) {
      throw new Error(`Duplicate model table registered: ${model.tableName}`)
    }
    seen.add(model.tableName)
  }
  return {
    name: config.name,
    models: [...config.models],
    migrationsDir: config.migrationsDir
  }
}
