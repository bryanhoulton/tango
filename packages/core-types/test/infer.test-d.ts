import { expectTypeOf, test } from 'vitest'

import type {
  FieldDef,
  InferInsert,
  InferSelect,
  Lookups
} from '../src/index.js'

// A representative model expressed purely at the type level (no runtime needed):
// id is an auto-increment PK (optional on insert), email is required, age is
// nullable, createdAt has a default (optional on insert).
type Users = {
  id: FieldDef<number, false, true>
  email: FieldDef<string, false, false>
  age: FieldDef<number, true, false>
  createdAt: FieldDef<Date, false, true>
}

test('InferSelect: nullable fields include null', () => {
  expectTypeOf<InferSelect<Users>>().toEqualTypeOf<{
    id: number
    email: string
    age: number | null
    createdAt: Date
  }>()
})

test('InferInsert: defaulted and nullable fields are optional', () => {
  expectTypeOf<InferInsert<Users>>().toEqualTypeOf<{
    email: string
    id?: number
    age?: number | null
    createdAt?: Date
  }>()
})

test('Lookups: valid lookups are accepted', () => {
  expectTypeOf<Lookups<Users>>().toMatchTypeOf<{
    email?: string
    email__icontains?: string
    age__gte?: number
    age__in?: readonly number[]
    age__isnull?: boolean
    createdAt__lt?: Date
  }>()
})

test('Lookups: invalid lookups fail to compile', () => {
  // @ts-expect-error number fields have no string lookups
  const a: Lookups<Users> = { age__icontains: 'x' }
  // @ts-expect-error string fields have no order lookups
  const b: Lookups<Users> = { email__gte: 'x' }
  // @ts-expect-error wrong value type for an order lookup
  const c: Lookups<Users> = { age__gte: 'old' }
  // @ts-expect-error unknown field
  const d: Lookups<Users> = { nope: 1 }
  void a
  void b
  void c
  void d
})
