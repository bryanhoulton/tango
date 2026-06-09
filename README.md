# @tango-ts/core

**Django REST Framework, in TypeScript, for serverless.**

Tango ports the Django + DRF developer experience to TypeScript — ORM, migrations,
admin, auth, management commands, caching, and the full DRF layer — built on
[Kysely](https://kysely.dev/) targeting MySQL / PlanetScale, and designed to run
serverless on any platform.

> Read [`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md) before contributing. It is
> the constitution of the project. **Zero `any`. TDD against a Django oracle.
> Declarations, not logic. Serverless-first.**

## Package graph (planned)

Dependencies point downward only; nothing depends upward.

```
@tango/core-types     phantom types, InferSelect/Insert/Lookups (pure types)
        ↓
@tango/orm            model(), fields, Manager, QuerySet, Kysely compilation (MySQL)
        ↓
@tango/migrations     schema diff, makemigrations / migrate, MySQL DDL
        ↓
@tango/serializers    DRF serializers, validation, inferred from models
        ↓
@tango/views          APIView, ViewSet, routers, pagination, Web Request/Response
        ↓
@tango/auth           stateless token/JWT auth, permissions
@tango/cache          pluggable external backend (KV / Upstash)
@tango/admin          auto-generated admin API + SPA
@tango/cli            management commands (makemigrations, migrate, createsuperuser)
        ↓
@tango/adapters       node / vercel / lambda / cloudflare handlers
```

## Scripts

```sh
yarn build        # tsc
yarn typecheck    # tsc --noEmit
yarn lint         # eslint — bans `any` and unsafe types
yarn test         # vitest (added per package)
```

## Documentation

- [`DESIGN_PRINCIPLES.md`](./DESIGN_PRINCIPLES.md) — the rules.
- [`docs/FOLDER_README_TEMPLATE.md`](./docs/FOLDER_README_TEMPLATE.md) — every
  meaningful folder gets a `README.md` from this template.
