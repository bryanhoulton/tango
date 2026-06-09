import { describe, expect, it } from 'vitest'

import { f, model } from '@tango-ts/orm'
import { createRouter } from '@tango-ts/router'
import { modelSerializer } from '@tango-ts/serializers'
import { modelViewSet } from '@tango-ts/views'

import { generateOpenApi } from '../src/index.js'

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

describe('generateOpenApi', () => {
  it('generates paths and schemas from a registered ModelViewSet', () => {
    const router = createRouter()
    router.register('/users', modelViewSet({ model: User, serializer: UserSerializer }))

    const schema = generateOpenApi(router, {
      title: 'Tango API',
      version: '1.0.0'
    })

    expect(schema.openapi).toBe('3.1.0')
    expect(schema.info).toEqual({ title: 'Tango API', version: '1.0.0' })
    expect(Object.keys(schema.paths)).toEqual(['/users/', '/users/{id}/'])
    expect(schema.paths['/users/']?.get?.operationId).toBe('listUsers')
    expect(schema.paths['/users/']?.post?.operationId).toBe('createUser')
    expect(schema.paths['/users/{id}/']?.get?.parameters).toEqual([
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'integer' }
      }
    ])
    expect(schema.components.schemas['User']).toEqual({
      type: 'object',
      properties: {
        id: { type: 'integer', readOnly: true },
        email: { type: 'string', maxLength: 255 },
        age: { type: ['integer', 'null'] },
        active: { type: 'boolean' },
        name: { type: 'string', maxLength: 255 }
      },
      required: ['email', 'name']
    })
    expect(schema.components.schemas['UserInput']).toEqual({
      type: 'object',
      properties: {
        email: { type: 'string', maxLength: 255 },
        age: { type: ['integer', 'null'] },
        active: { type: 'boolean' },
        name: { type: 'string', maxLength: 255 }
      },
      required: ['email', 'name']
    })
  })

  it('merges view-specific OpenAPI overrides and documents custom actions', () => {
    const router = createRouter()
    router.register(
      '/users',
      modelViewSet({
        model: User,
        serializer: UserSerializer,
        openApi: {
          list: {
            parameters: [
              {
                name: 'search',
                in: 'query',
                required: false,
                schema: { type: 'string' }
              }
            ]
          }
        },
        actions: [
          {
            name: 'activate',
            method: 'POST',
            path: 'activate',
            detail: true,
            handler: () => Response.json({ ok: true }),
            openApi: {
              operationId: 'activateUser',
              responses: {
                '200': {
                  description: 'Activated',
                  content: {
                    'application/json': {
                      schema: {
                        type: 'object',
                        properties: { ok: { type: 'boolean' } },
                        required: ['ok']
                      }
                    }
                  }
                }
              }
            }
          }
        ]
      })
    )

    const schema = generateOpenApi(router, {
      title: 'Tango API',
      version: '1.0.0'
    })

    expect(schema.paths['/users/']?.get?.parameters).toEqual([
      {
        name: 'search',
        in: 'query',
        required: false,
        schema: { type: 'string' }
      }
    ])
    expect(schema.paths['/users/{id}/activate/']?.post?.operationId).toBe(
      'activateUser'
    )
    expect(schema.paths['/users/{id}/activate/']?.post?.parameters).toEqual([
      {
        name: 'id',
        in: 'path',
        required: true,
        schema: { type: 'integer' }
      }
    ])
    expect(schema.paths['/users/{id}/activate/']?.post?.responses['200']).toEqual({
      description: 'Activated',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { ok: { type: 'boolean' } },
            required: ['ok']
          }
        }
      }
    })
  })
})
