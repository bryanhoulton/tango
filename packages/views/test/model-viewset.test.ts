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
        {
          name: 'activate',
          method: 'POST',
          path: 'activate',
          detail: true,
          handler: () => Response.json({ ok: true })
        }
      ]
    })

    expect(viewset.routes('/users').map((route) => [route.method, route.path])).toEqual([
      ['GET', '/users/'],
      ['POST', '/users/'],
      ['GET', '/users/:id/'],
      ['PATCH', '/users/:id/'],
      ['DELETE', '/users/:id/'],
      ['GET', '/users/export/'],
      ['POST', '/users/:id/activate/']
    ])
  })
})
