import { describe, expect, it } from 'vitest'

import { f, model } from '@tango-ts/orm'
import { modelSerializer } from '@tango-ts/serializers'

import { modelViewSet } from '../src/index.js'

const User = model('users', {
  id: f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  name: f.varchar(255)
})

const UserSerializer = modelSerializer(User, {
  fields: ['id', 'email', 'name'] as const,
  readOnlyFields: ['id'] as const
})

describe('modelViewSet', () => {
  it('declares DRF-style list/retrieve/create routes for a basename', () => {
    const viewset = modelViewSet({ model: User, serializer: UserSerializer })

    expect(viewset.routes('/users').map((route) => [route.method, route.path])).toEqual([
      ['GET', '/users/'],
      ['POST', '/users/'],
      ['GET', '/users/:id/'],
      ['PATCH', '/users/:id/'],
      ['DELETE', '/users/:id/']
    ])
  })

  it('declares collection and detail custom action routes', () => {
    const viewset = modelViewSet({
      model: User,
      serializer: UserSerializer,
      actions: [
        {
          name: 'export',
          method: 'GET',
          path: 'export',
          detail: false,
          handler: () => Response.json({ ok: true })
        },
        // `detail` defaults to false: collection action.
        {
          name: 'stats',
          method: 'GET',
          path: 'stats',
          handler: () => Response.json({ ok: true })
        },
        {
          name: 'activate',
          method: 'POST',
          path: 'activate',
          detail: true,
          // Detail handlers receive the resolved row, fully typed.
          handler: (_ctx, user) => Response.json({ email: user.email })
        }
      ]
    })

    // Collection actions register before `/:id/` so the router never
    // captures `/users/export/` as a retrieve with id "export".
    expect(viewset.routes('/users').map((route) => [route.method, route.path])).toEqual([
      ['GET', '/users/'],
      ['POST', '/users/'],
      ['GET', '/users/export/'],
      ['GET', '/users/stats/'],
      ['GET', '/users/:id/'],
      ['PATCH', '/users/:id/'],
      ['DELETE', '/users/:id/'],
      ['POST', '/users/:id/activate/']
    ])
  })

  it('exposes nested serializer metadata on routes (consumed by OpenAPI)', () => {
    const Post = model('posts', {
      id: f.int().primaryKey().autoIncrement(),
      title: f.varchar(255),
      authorId: f.foreignKey(() => User, 'id')
    })
    const PostSerializer = modelSerializer(Post, {
      fields: ['id', 'title', 'authorId'] as const,
      readOnlyFields: ['id'] as const,
      nested: { author: UserSerializer }
    })
    const viewset = modelViewSet({ model: Post, serializer: PostSerializer })

    const [listRoute] = viewset.routes('/posts')
    const metadata = listRoute?.metadata
    expect(metadata).toMatchObject({
      kind: 'modelViewSet',
      serializer: {
        fields: ['id', 'title', 'authorId'],
        readOnlyFields: ['id'],
        nested: {
          author: {
            fields: ['id', 'email', 'name'],
            readOnlyFields: ['id'],
            modelFields: User.fields,
            nested: {}
          }
        }
      }
    })
  })
})
