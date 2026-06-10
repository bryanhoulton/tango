# @tango-ts/serializers

## Responsibility

DRF-style serialization and validation. This package turns model definitions into
typed serializers: configured output fields, typed input data, runtime validation,
DRF-shaped error maps, and `save()` through the real ORM manager. It does not own HTTP
views, routing, pagination, or permissions.

## What it responds to

- A model declared with `model(...)`.
- Serializer configuration: `fields`, `readOnlyFields`, and `nested`.
- Typed application input via `forInput(...)`, or request payloads via
  `forUnknownInput(...)`.

## Functionality

- `modelSerializer(model, { fields, readOnlyFields, nested })`.
- `serialize(row)` returns only configured fields with inferred output types.
- Read-only nested serializers (DRF's `author = AuthorSerializer(read_only=True)`):
  `nested: { author: AuthorSerializer }` keys are the model's relation names
  (`authorId` -> `author`) and are type-checked against the related model.
  `serialize` then requires the related row (what `selectRelated` returns,
  recursively for multi-level nesting), renders it through the nested
  serializer, and renders a missing relation as `null`. Nested keys are
  output-only: in input they are silently ignored (DRF parity) and never
  satisfy required writable fields.
- `forInput(data)` is compile-time checked against writable model fields.
- `forUnknownInput(payload)` validates request payloads at runtime.
- `datetime`/`date` fields accept ISO 8601 strings over JSON (validated against
  explicit patterns, not `new Date(...)` parsing) and are normalized to `Date`
  for the ORM.
- `isValid()`, `errors`, `validatedData`.
- `save()` calls `Model.objects.create(...)` using validated data.

## Design patterns that matter here

- **Inferred types:** input/output shapes derive from the model field map and serializer
  config. No hand-written DTO interfaces.
- **Two input paths:** trusted application code uses typed `forInput`; untrusted request
  bodies use `forUnknownInput`.
- **Production overlap:** `save()` is integration-tested against real MySQL through the
  ORM, not mocked.
- **DRF oracle:** validation envelope parity is tested against real DRF for covered
  cases.

## Public contract

Everything exported from `src/index.ts`: `modelSerializer`,
`ModelSerializerInstance`, `ValidationErrors`, `SerializerInput`,
`SerializerOutput`, `SerializerRow`, nested serializer types
(`NestedSerializerLike`, `NestedSerializerMap`, `NestedSerializersOption`),
and config/model interfaces.

## Testing

- Type-level (`test/model-serializer.test-d.ts`): configured fields, readonly input,
  required fields, invalid model fields, nested output inference, and
  invalid nested configs failing to compile.
- Unit (`test/model-serializer.test.ts`): serialization and validation behavior,
  including nested output, null relations, and multi-level nesting.
- Parity (`test/drf-parity.test.ts`): required-field error envelope and read-only
  nested input semantics compared to real DRF via `uv run`.
- Integration (`test/model-serializer.integration.test.ts`): `save()` and nested
  `selectRelated` serialization against real MySQL.
