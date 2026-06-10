# @tango-ts/core-types

## 0.9.0

### Minor Changes

- DX fixes from the latest feedback round:

  - **snake_case FK relation names**: `tag_id`/`customer_id` columns now expose the
    logical relation name (`tag`, `customer`) for filters, `selectRelated`, and
    nested serializer keys — matching the existing `tagId` -> `tag` behavior.
  - **Null FKs render as `null`**: a nullable FK with no row now inflates and
    serializes as `null` instead of an object whose columns are all null. The
    relation is typed `| null` end-to-end (ORM rows, serializer output, OpenAPI
    schemas emit `type: ['object', 'null']`).
  - **Typed `ctx.user`**: `RequestContext<User>`, `Authentication<User>`, and the
    pipeline thread the authenticated user's type into `apiView` handlers,
    viewset actions, `queryset`, `objectPermission`, and permission predicates.
    `authTokenAuthentication()` is `Authentication<PublicUser>`, so
    `ctx.user?.id` works without casts.
  - **Action `path` validation**: viewset action paths must be plain URL
    segments (`'close'`); paths containing `:` params (e.g. `'/:id/close/'`)
    now throw at route build time with a pointer to the right shape.

## 0.8.1

## 0.8.0

## 0.7.0

## 0.6.0

## 0.5.0

## 0.4.0

## 0.3.0

## 0.2.2

## 0.2.1

## 0.2.0

## 0.1.2

## 0.1.1

## 0.1.0

### Minor Changes

- Publish the first public Tango package release.
