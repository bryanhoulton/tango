import { describe, expectTypeOf, it } from 'vitest'

import { defineFunction, type JsonValue } from '../src/index.js'

describe('defineFunction type inference', () => {
  it('infers the payload and result types from the handler', () => {
    const fn = defineFunction({
      name: 'work',
      handler: (payload: { userId: number; tags: string[] }) =>
        Promise.resolve({ sent: payload.tags.length > 0, count: payload.tags.length })
    })

    expectTypeOf(fn.invoke).parameter(0).toEqualTypeOf<{
      userId: number
      tags: string[]
    }>()
    expectTypeOf(fn.invoke).returns.resolves.toEqualTypeOf<{
      sent: boolean
      count: number
    }>()
    expectTypeOf(fn.defer).returns.toEqualTypeOf<void>()
  })

  it('supports void results', () => {
    const fn = defineFunction({
      name: 'notify',
      handler: (payload: { userId: number }): Promise<undefined> => {
        void payload
        return Promise.resolve(undefined)
      }
    })
    expectTypeOf(fn.invoke).returns.resolves.toEqualTypeOf<undefined>()
  })

  it('rejects payloads that cannot round-trip through JSON', () => {
    defineFunction({
      name: 'bad-date',
      // @ts-expect-error - Date is not JSON-serializable (it would silently become a string)
      handler: (payload: { at: Date }) => Promise.resolve(payload.at.getTime())
    })

    defineFunction({
      name: 'bad-callback',
      // @ts-expect-error - functions cannot cross the invocation boundary
      handler: (payload: { onDone: () => void }) => {
        payload.onDone()
        return Promise.resolve(null)
      }
    })

    defineFunction({
      name: 'bad-map',
      // @ts-expect-error - Map is not JSON-serializable
      handler: (payload: Map<string, number>) => Promise.resolve(payload.size)
    })
  })

  it('rejects results that cannot round-trip through JSON', () => {
    defineFunction({
      name: 'bad-result',
      // @ts-expect-error - Date results would corrupt into strings over the wire
      handler: (payload: { id: number }) => Promise.resolve(new Date(payload.id))
    })
  })

  it('rejects mistyped invoke payloads', () => {
    const fn = defineFunction({
      name: 'work',
      handler: (payload: { userId: number }) => Promise.resolve(payload.userId)
    })
    // @ts-expect-error - userId must be a number
    void fn.invoke({ userId: 'one' })
    // @ts-expect-error - payload is required
    void fn.invoke()
    // @ts-expect-error - defer payloads are typed identically to invoke
    fn.defer({ userId: 'one' })
  })

  it('accepts nested JSON structures', () => {
    const fn = defineFunction({
      name: 'nested',
      handler: (payload: {
        items: { id: number; meta: { tags: string[]; note: string | null } }[]
      }) => Promise.resolve(payload.items.length)
    })
    expectTypeOf(fn.invoke).returns.resolves.toEqualTypeOf<number>()
  })

  it('JsonValue accepts readonly arrays and optional properties', () => {
    // The annotations themselves are the assertion: these must type-check.
    const withReadonlyArray: JsonValue = { list: [1, 2, 3] as readonly number[] }
    const withOptional: JsonValue = { maybe: undefined }
    type Payload = { id: number; note?: string }
    const optionalProps: JsonValue = { id: 1 } satisfies Payload
    expectTypeOf(withReadonlyArray).not.toBeNever()
    expectTypeOf(withOptional).not.toBeNever()
    expectTypeOf(optionalProps).not.toBeNever()
  })
})
