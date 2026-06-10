---
'@tango-ts/orm': minor
'@tango-ts/serializers': minor
'@tango-ts/views': minor
'@tango-ts/openapi': minor
'@tango-ts/admin': minor
'@tango-ts/admin-ui': minor
---

Add `.choices([...])` field modifier (Django's `choices`): pure metadata with no DDL change. The field's TypeScript type narrows to the literal union, serializers reject values outside the set, OpenAPI emits an `enum`, and the admin renders choice fields as selects in both list filters and forms.
