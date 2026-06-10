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

const Author = model('authors', {
  id: f.int().primaryKey().autoIncrement(),
  name: f.varchar(255)
})

const Post = model('posts', {
  id: f.int().primaryKey().autoIncrement(),
  title: f.varchar(255),
  authorId: f.foreignKey(() => Author, 'id')
})

const AuthorSerializer = modelSerializer(Author, {
  fields: ['name'] as const
})

// Mirrors the oracle's PostSerializer: `author = AuthorSerializer(read_only=True)`.
const PostSerializer = modelSerializer(Post, {
  fields: ['title', 'authorId'] as const,
  nested: { author: AuthorSerializer }
})

interface DrfVerdict {
  readonly valid: boolean
  readonly errors: ValidationErrors
  readonly validatedData: Record<string, unknown> | null
}

function drfVerdict(serializer: string, payload: unknown): DrfVerdict {
  const stdout = execFileSync(
    'uv',
    ['run', '--with', 'django==4.2.4', '--with', 'djangorestframework==3.15.2', 'python', SCRIPT],
    { input: JSON.stringify({ serializer, payload }), encoding: 'utf8' }
  )
  return JSON.parse(stdout) as DrfVerdict
}

// The first oracle invocation may resolve and install Django/DRF via uv on a
// cold cache (especially in CI), which can far exceed the default 5s timeout.
describe('ModelSerializer validation parity with DRF', { timeout: 120_000 }, () => {
  it('matches DRF required-field error envelope', () => {
    const payload = { email: 'ada@example.com' }
    const serializer = UserSerializer.forUnknownInput(payload)

    const oracle = drfVerdict('user', payload)
    expect(oracle.valid).toBe(false)
    expect(serializer.isValid()).toBe(false)
    expect(serializer.errors).toEqual(oracle.errors)
  })

  it('matches DRF: a read-only nested key in input is silently ignored', () => {
    const payload = { title: 'Hi', authorId: 1, author: { name: 'Ada' } }
    const serializer = PostSerializer.forUnknownInput(payload)

    const oracle = drfVerdict('post', payload)
    expect(oracle.valid).toBe(true)
    expect(serializer.isValid()).toBe(true)
    expect(serializer.errors).toEqual(oracle.errors)
    expect(serializer.validatedData).toEqual(oracle.validatedData)
  })

  it('matches DRF: nested input does not satisfy required writable fields', () => {
    const payload = { author: { name: 'Ada' } }
    const serializer = PostSerializer.forUnknownInput(payload)

    const oracle = drfVerdict('post', payload)
    expect(oracle.valid).toBe(false)
    expect(serializer.isValid()).toBe(false)
    expect(serializer.errors).toEqual(oracle.errors)
  })
})
