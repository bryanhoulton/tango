import { describe, expect, it } from 'vitest'

import { defineFunction, FUNCTIONS_PATH_PREFIX } from '@tango-ts/functions'
import { f, model } from '@tango-ts/orm'
import { createRouter } from '@tango-ts/router'
import { modelSerializer } from '@tango-ts/serializers'
import { defineApp, defineProject } from '@tango-ts/server'
import { modelViewSet } from '@tango-ts/views'
import { COMPILE_ONLY } from '@tango-ts/orm'

import { addOpenApiRoute, generateOpenApi } from '../src/index.js'

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

  it('emits enum for choice fields, including null for nullable ones', () => {
    const Article = model('articles', {
      id: f.int().primaryKey().autoIncrement(),
      status: f.varchar(20).choices(['draft', 'published']).default('draft'),
      priority: f.int().choices([1, 2, 3]).nullable()
    })
    const ArticleSerializer = modelSerializer(Article, {
      fields: ['id', 'status', 'priority'] as const,
      readOnlyFields: ['id'] as const
    })
    const router = createRouter()
    router.register(
      '/articles',
      modelViewSet({ model: Article, serializer: ArticleSerializer })
    )

    const schema = generateOpenApi(router, { title: 'Tango API', version: '1.0.0' })

    expect(schema.components.schemas['Article']).toEqual({
      type: 'object',
      properties: {
        id: { type: 'integer', readOnly: true },
        status: {
          type: 'string',
          maxLength: 20,
          enum: ['draft', 'published']
        },
        priority: { type: ['integer', 'null'], enum: [1, 2, 3, null] }
      }
    })
  })

  it('emits nested serializer output as read-only object schemas', () => {
    const Author = model('authors', {
      id: f.int().primaryKey().autoIncrement(),
      name: f.varchar(255),
      email: f.varchar(255)
    })
    const Post = model('posts', {
      id: f.int().primaryKey().autoIncrement(),
      title: f.varchar(255),
      authorId: f.foreignKey(() => Author, 'id')
    })
    const AuthorSerializer = modelSerializer(Author, {
      fields: ['id', 'name'] as const,
      readOnlyFields: ['id'] as const
    })
    const PostSerializer = modelSerializer(Post, {
      fields: ['id', 'title', 'authorId'] as const,
      readOnlyFields: ['id'] as const,
      nested: { author: AuthorSerializer }
    })
    const router = createRouter()
    router.register(
      '/posts',
      modelViewSet({ model: Post, serializer: PostSerializer })
    )

    const schema = generateOpenApi(router, { title: 'Tango API', version: '1.0.0' })

    expect(schema.components.schemas['Post']).toEqual({
      type: 'object',
      properties: {
        id: { type: 'integer', readOnly: true },
        title: { type: 'string', maxLength: 255 },
        authorId: { type: 'integer' },
        author: {
          type: 'object',
          readOnly: true,
          properties: {
            id: { type: 'integer', readOnly: true },
            name: { type: 'string', maxLength: 255 }
          }
        }
      },
      required: ['title', 'authorId']
    })
    // Nested serializers are read-only: input schemas never include them.
    expect(schema.components.schemas['PostInput']).toEqual({
      type: 'object',
      properties: {
        title: { type: 'string', maxLength: 255 },
        authorId: { type: 'integer' }
      },
      required: ['title', 'authorId']
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

  it('uses project metadata when generating OpenAPI from a named project', () => {
    const router = createRouter()
    router.register('/users', modelViewSet({ model: User, serializer: UserSerializer }))
    const project = defineProject({
      name: 'Commerce API',
      database: COMPILE_ONLY,
      routes: router
    })

    const schema = generateOpenApi(project)

    expect(schema.info).toEqual({ title: 'Commerce API', version: '0.0.0' })
    expect(schema.paths['/users/']?.get?.operationId).toBe('listUsers')
  })

  it('never emits the internal function dispatch endpoint', () => {
    const work = defineFunction({
      name: 'work',
      handler: (p: null) => Promise.resolve(p)
    })
    const router = createRouter()
    router.register('/users', modelViewSet({ model: User, serializer: UserSerializer }))
    const project = defineProject({
      name: 'Commerce API',
      database: COMPILE_ONLY,
      routes: router,
      apps: [defineApp({ name: 'core', functions: [work] })],
      // http transport mounts the dispatch route — the case that must stay
      // invisible to the public API surface.
      functions: { transport: 'http', secret: 's3cret', url: 'https://example.test' }
    })

    const schema = generateOpenApi(project)

    expect(Object.keys(schema.paths)).toEqual(['/users/', '/users/{id}/'])
    expect(
      Object.keys(schema.paths).some((path) => path.startsWith(FUNCTIONS_PATH_PREFIX))
    ).toBe(false)
  })
})

describe('addOpenApiRoute', () => {
  it('serves the generated document from the project at /openapi.json', async () => {
    const router = createRouter()
    router.register('/users', modelViewSet({ model: User, serializer: UserSerializer }))
    const project = defineProject({
      name: 'Commerce API',
      database: COMPILE_ONLY,
      routes: router
    })
    addOpenApiRoute(project, { version: '1.2.3' })

    const response = await project(
      new Request('http://localhost/openapi.json', { method: 'GET' })
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json')
    const document = (await response.json()) as Record<string, unknown>
    expect(document['openapi']).toBe('3.1.0')
    expect(document['info']).toEqual({ title: 'Commerce API', version: '1.2.3' })
    const paths = document['paths'] as Record<string, unknown>
    expect(Object.keys(paths)).toEqual(['/users/', '/users/{id}/'])
  })

  it('serves from a custom path', async () => {
    const project = defineProject({
      name: 'Commerce API',
      database: COMPILE_ONLY
    })
    addOpenApiRoute(project, { path: '/api/schema.json' })

    const response = await project(
      new Request('http://localhost/api/schema.json', { method: 'GET' })
    )
    expect(response.status).toBe(200)

    const missing = await project(
      new Request('http://localhost/openapi.json', { method: 'GET' })
    )
    expect(missing.status).toBe(404)
  })
})
