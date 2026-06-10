# @tango-ts/admin

## 0.7.0

### Patch Changes

- Updated dependencies [ed15d6b]
  - @tango-ts/server@0.7.0
  - @tango-ts/auth@0.7.0
  - @tango-ts/contrib-auth@0.7.0
  - @tango-ts/core-types@0.7.0
  - @tango-ts/http@0.7.0
  - @tango-ts/orm@0.7.0
  - @tango-ts/router@0.7.0
  - @tango-ts/serializers@0.7.0
  - @tango-ts/views@0.7.0

## 0.6.0

### Minor Changes

- 2bf9fef: Add `.choices([...])` field modifier (Django's `choices`): pure metadata with no DDL change. The field's TypeScript type narrows to the literal union, serializers reject values outside the set, OpenAPI emits an `enum`, and the admin renders choice fields as selects in both list filters and forms.

### Patch Changes

- Updated dependencies [2bf9fef]
  - @tango-ts/orm@0.6.0
  - @tango-ts/serializers@0.6.0
  - @tango-ts/views@0.6.0
  - @tango-ts/auth@0.6.0
  - @tango-ts/contrib-auth@0.6.0
  - @tango-ts/core-types@0.6.0
  - @tango-ts/http@0.6.0
  - @tango-ts/router@0.6.0
  - @tango-ts/server@0.6.0

## 0.5.0

### Patch Changes

- Updated dependencies
  - @tango-ts/auth@0.5.0
  - @tango-ts/http@0.5.0
  - @tango-ts/router@0.5.0
  - @tango-ts/server@0.5.0
  - @tango-ts/views@0.5.0
  - @tango-ts/contrib-auth@0.5.0
  - @tango-ts/core-types@0.5.0
  - @tango-ts/orm@0.5.0
  - @tango-ts/serializers@0.5.0
