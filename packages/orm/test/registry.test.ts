import { describe, expect, it } from 'vitest'

import { defineApp, f, model } from '../src/index.js'

describe('defineApp', () => {
  it('registers models explicitly for CLI discovery', () => {
    const User = model('users', {
      id: f.int().primaryKey().autoIncrement()
    })
    const app = defineApp({
      name: 'blog',
      models: [User],
      migrationsDir: 'migrations'
    })

    expect(app.name).toBe('blog')
    expect(app.models).toEqual([User])
    expect(app.migrationsDir).toBe('migrations')
  })

  it('rejects duplicate table names', () => {
    const First = model('users', {
      id: f.int().primaryKey().autoIncrement()
    })
    const Second = model('users', {
      id: f.int().primaryKey().autoIncrement()
    })

    expect(() =>
      defineApp({ name: 'bad', models: [First, Second] })
    ).toThrow('Duplicate model table registered: users')
  })
})
