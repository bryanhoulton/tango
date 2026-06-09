import { execFileSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { f, model } from '@tango-ts/orm'

import { modelSerializer, type ValidationErrors } from '../src/index.js'

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'drf', 'validate.py')

const User = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age: f.int().nullable(),
  active: f.boolean().default(true),
  name: f.varchar(255)
})

const UserSerializer = modelSerializer(User, {
  fields: ['id', 'email', 'age', 'active', 'name'] as const,
  readOnlyFields: ['id'] as const
})

function drfErrors(payload: unknown): ValidationErrors {
  const stdout = execFileSync(
    'uv',
    ['run', '--with', 'django==4.2.4', '--with', 'djangorestframework==3.15.2', 'python', SCRIPT],
    { input: JSON.stringify(payload), encoding: 'utf8' }
  )
  return JSON.parse(stdout) as ValidationErrors
}

// The first oracle invocation may resolve and install Django/DRF via uv on a
// cold cache (especially in CI), which can far exceed the default 5s timeout.
describe('ModelSerializer validation parity with DRF', { timeout: 120_000 }, () => {
  it('matches DRF required-field error envelope', () => {
    const payload = { email: 'ada@example.com' }
    const serializer = UserSerializer.forUnknownInput(payload)

    expect(serializer.isValid()).toBe(false)
    expect(serializer.errors).toEqual(drfErrors(payload))
  })
})
