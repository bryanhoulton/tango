# @tango-ts/openapi

## Responsibility

OpenAPI 3.1 generation from Tango's declarative router/viewset/model/serializer
metadata. This package turns registered `ModelViewSet` routes into paths, operations,
request bodies, responses, and component schemas. It does not own routing or request
handling.

## What it responds to

- A `Router` with registered routes.
- `ModelViewSet` route metadata.
- Model field specs and serializer field/read-only configuration.

## Functionality

- `generateOpenApi(router, { title, version })`.
- `generateOpenApi(project)` defaults `info.title` from the project name and
  `info.version` to `0.0.0`.
- Path generation for list/create/retrieve routes.
- Path generation for custom `ModelViewSet` actions.
- Component schemas inferred from model fields.
- Input schemas that omit serializer read-only fields.
- Per-operation overrides for parameters, request bodies, responses, tags, and
  operation IDs.

## Design patterns that matter here

- **Declarative docs:** no hand-written endpoint schemas for normal `ModelViewSet`
  routes.
- **Single source of truth:** schemas derive from the same model and serializer config
  used at runtime.
- **Boundary with views:** `@tango-ts/views` owns lightweight metadata and per-action
  override shapes; this package owns all OpenAPI document generation logic.
- **OpenAPI as verification:** route/serializer/model declarations are introspectable,
  which will keep future API behavior honest.
- **Override escape hatch:** overridden handlers/custom actions can still publish exact
  schema details without hand-writing the whole document.

## Public contract

Everything exported from `src/index.ts`.

## Testing

- Unit (`test/openapi.test.ts`): path operations, operation IDs, path params, and
  component schemas derived from a registered `ModelViewSet`, including custom actions
  and view-specific OpenAPI overrides.
