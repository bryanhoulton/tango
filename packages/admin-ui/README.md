# @tango-ts/admin-ui

The Tango admin UI: a prebuilt, schema-driven React SPA built with
[shadcn/ui](https://ui.shadcn.com) and Tailwind. It is the browser half of
`@tango-ts/admin` — one generic app for every project, driven entirely by the
admin `/meta/` endpoint at runtime.

**Never import this package from server code.** It ships compiled static
assets (`dist/`) meant to be served from a CDN or static directory. Keeping it
out of the server import graph is what keeps Vercel function bundles free of
React, and the monorepo enforces that with lint, manifest, and bundle-trace
guards.

## Serving the UI

The published package contains only `dist/` (index.html + hashed assets). The
SPA uses hash routing and relative asset URLs, so it works from any mount
point with zero server rewrites:

- **Vercel:** copy `node_modules/@tango-ts/admin-ui/dist` into `public/admin/`
  during the build. Static files win over the catch-all rewrite, so the UI is
  served from the CDN and adds nothing to the function bundle.
- **Containers:** serve the same directory with any static file middleware.

By default the app talks to `/admin/api` (where `addAdminRoutes` mounts).
Override with a global before the bundle loads:

```html
<script>window.__TANGO_ADMIN__ = { apiBase: '/internal/admin/api' }</script>
```

## Development

```sh
yarn workspace @tango-ts/admin-ui dev
```

The dev server proxies `/admin/api` to `http://127.0.0.1:8000`, so run a Tango
project with `addAdminRoutes` locally and log in with a staff user
(`createSuperuser`).

## What it renders

Everything comes from the meta document:

- Sidebar of registered models
- List views with the configured `listDisplay` columns, search
  (`searchFields`), boolean/lookup filters (`listFilters`), and pagination
- Create/edit forms with widgets per column type, read-only fields, per-field
  validation errors straight from the serializer
- Foreign-key pickers that search the related model's admin endpoint and show
  its display field
- Staff login backed by the contrib-auth token model
