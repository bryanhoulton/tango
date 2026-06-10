# @tango-ts/admin-ui

## 0.8.0

### Minor Changes

- Admin functions: `addAdminRoutes` now exposes staff-runnable functions (every
  function owned by the project's apps by default, or an explicit `functions`
  list). Each function gets a `POST /functions/:app/:name/` endpoint guarded by
  the admin's authentication/permission classes, and the UI lists them in a new
  Functions sidebar section with a run screen (`#/f/<app>/<name>`) that submits a
  JSON payload and shows the result. The sidebar now also groups models by their
  owning app (Django-style admin index), and the document title reflects the
  project's admin site title.

## 0.7.0

### Patch Changes

- 277c847: Admin list views show a loading state when switching models instead of flashing the previous model's rows, and out-of-order responses can no longer overwrite the current page.

## 0.6.0

### Minor Changes

- 2bf9fef: Add `.choices([...])` field modifier (Django's `choices`): pure metadata with no DDL change. The field's TypeScript type narrows to the literal union, serializers reject values outside the set, OpenAPI emits an `enum`, and the admin renders choice fields as selects in both list filters and forms.

## 0.5.0
