# @tango-ts/core-types

## Responsibility

The pure **type** layer of Tango. Defines the type-level contract of a model field
(`FieldDef`) and the inference engine that derives every downstream shape from a
model definition: `InferSelect`, `InferInsert`, `InferUpdate`, and `Lookups`. This
package has **zero runtime** — it emits no JavaScript and imports nothing.

## What it responds to

Consumes a `Fields` map (`Record<string, FieldDef>`) — the type the `@tango-ts/orm`
`model()` function produces from `f.*` builders — and produces the inferred types
the rest of the framework (ORM, serializers, admin, views) builds on.

## Functionality

- `FieldDef<TsType, Nullable, HasDefault>` — phantom-typed field contract.
- `InferSelect<F>` — the row shape read from the DB (nullable fields include `null`).
- `InferInsert<F>` — the create shape (nullable / defaulted fields are optional).
- `InferUpdate<F>` — partial update shape.
- `Lookups<F>` — the fully-checked filter object; per-field lookups are gated by the
  field's value type (string vs number/date vs common).
- `Prettify`, `UnionToIntersection` — type utilities.

## Design patterns that matter here

- **Single source of truth (P2):** every shape is derived here from the field map.
  No hand-written row interfaces anywhere in the codebase.
- **Zero runtime:** never add a runtime value to this package. Phantom markers are
  `__`-prefixed and `declare`d by the runtime `Field` class in `@tango-ts/orm`.
- **No `any`:** the "any field" constraint is `FieldDef<unknown, boolean, boolean>`.

## Public contract

Everything re-exported from `src/index.ts` (all `export type`). Changing a signature
here is a contract change and requires its own PR.

## Testing

- Type-level (`vitest --typecheck` via `expectTypeOf`): `test/infer.test-d.ts`,
  including negative cases (`@ts-expect-error`) that assert invalid lookups and wrong
  value types fail to compile.
