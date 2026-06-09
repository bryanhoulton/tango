# Tango — Design Principles

> **Tango is Django REST Framework, rebuilt in TypeScript, for serverless.**
> This document is the constitution of the project. Every package, every PR, and
> every contributor (human or agent) is held to it. When in doubt, the rule here
> wins. If a rule needs to change, change it here first, in its own PR.

---

## 1. Mission & scope

Tango ports the **Django + Django REST Framework (DRF)** developer experience to
TypeScript, optimized to run **serverless**.

**In scope (v1):**

- **ORM** — models, managers, lazy QuerySets, relations, built on top of
  [Kysely](https://kysely.dev/) targeting **MySQL / PlanetScale**.
- **Migrations** — `makemigrations` / `migrate`, schema diffing, deploy-time runner.
- **Admin** — auto-generated admin API + SPA.
- **Auth** — basic, stateless authentication & permissions.
- **Management commands** — a `tango` CLI.
- **Caching** — pluggable, external backends.
- **DRF layer** — serializers, viewsets, routers, pagination, permissions.

**Explicitly out of scope (for now):**

- Templating language / server-rendered HTML.
- Signals (deferred — revisit post-v1).
- In-process background workers (use a queue when needed).

---

## 2. Foundation (locked)

| Decision | Choice | Why |
| --- | --- | --- |
| Query builder | **Kysely** | Type-first; we amplify its inference instead of fighting it. |
| Database | **MySQL / PlanetScale** | PlanetScale's HTTP driver is the key to serverless MySQL. |
| DB driver | **`@planetscale/database` via `kysely-planetscale`** | Stateless HTTP — no connection pool to exhaust. |
| HTTP contract | **Web-standard `Request` / `Response`** | Runtime-agnostic core; thin per-platform adapters. |
| Deploy target | **Platform-agnostic adapters** (Vercel / Lambda / Cloudflare / Node) | No lock-in; portability is a CI test. |

---

## 3. The core principles

### P1 — Strictly typed everywhere. Zero `any`.

- `any` is **banned**. Not discouraged — banned, and enforced by lint + pre-commit
  (see `eslint.config.mjs`). Use `unknown` and narrow, or write the precise type.
- Also banned: `@ts-ignore` / `@ts-expect-error` without justification,
  non-null assertions (`!`), and the `no-unsafe-*` family.
- **The compiler is the primary test.** For a framework whose product *is* its
  types, a wrong generic is a bug even if the runtime is correct.
- Type-level behavior gets type-level tests (`expect-type`), including assertions
  that **invalid usage fails to compile**.

### P2 — Inferred ORM types from a single source of truth.

- The **model definition is the only place a shape is declared.** Everything
  downstream — query lookups, result rows, insert/update shapes, serializer
  fields, admin columns, route params — is **inferred** from it.
- No hand-written row interfaces. Ever. If you typed a row by hand, you did it wrong.
- The hard, high-value type machinery is `Lookups<Model>`: each field expands into
  exactly the lookups valid for its type (`__icontains`, `__gte`, `__in`,
  `__isnull`, relation traversal like `author__name`), fully checked & autocompleted.

```ts
const User = model('users', {
  id:    f.int().primaryKey().autoIncrement(),
  email: f.varchar(255).unique(),
  age:   f.int().nullable(),
})

// fully inferred, fully checked — no manual types anywhere:
const adults = User.objects.filter({ age__gte: 18 }) // QuerySet<InferSelect<typeof User>>
```

### P3 — Test-Driven Development, everywhere, against an oracle.

- **The test is the spec.** Write the failing test first; make it green.
- **Django/DRF is the oracle.** Where behavior is defined, a **parity test** diffs
  our output against a real Django/DRF reference running in CI (same SQL shape,
  same validation-error JSON, same pagination envelope). "Correct" is objective.
- A test that passes without exercising real production behavior is **useless and
  forbidden** — no mocked databases, no parity tests that don't actually diff.
- **Never skip a test for missing config** (e.g. no DB / no API key). Fail loudly.
- The one carve-out: API *ergonomics/architecture* is prototyped against the
  example app and frozen as a contract **before** TDD implementation begins.

### P4 — Extremely DRY. Convention over configuration. Declarations, not logic.

This is the Django soul of the project. **Users configure; they do not implement.**

- The 90% case is **boilerplate and template code**: declare a model, declare a
  serializer, declare a viewset, register a route — and full CRUD works.

  ```ts
  // This should be the entire definition of a full CRUD API for a resource.
  class UserViewSet extends ModelViewSet {
    queryset = User.objects.all()
    serializer = UserSerializer
    permissions = [IsAuthenticated]
  }
  ```

- **Customization is declarative, via named hooks — never by rewriting behavior.**
  You override `perform_create`-style hooks, set declarative options, or compose
  provided pieces. You should rarely need to drop to imperative code, and when you
  do, the escape hatch is explicit, narrow, and documented.
- **If two pieces of code do the same thing, that's a bug.** Generate it from one
  declaration. Repetition in user-land means a missing abstraction in framework-land.
- Sensible defaults for everything; configuration overrides, it does not require.

### P5 — Serverless-first. Statelessness is a design constraint, not an afterthought.

Every package is built for ephemeral, stateless, per-request execution from day one.

- **No in-process state between requests.** No in-memory caches, no held DB pools,
  no server-side session memory.
- **DB access is stateless HTTP** (PlanetScale driver) — never a long-lived pool.
- **Migrations run at deploy time only** (in CI/CD via the `tango` CLI), *never*
  at request time.
- **Auth is stateless** (signed tokens / JWT). Sessions, if used, are a pluggable
  DB/KV backend.
- **Caching is external & pluggable** (e.g. Upstash Redis, Cloudflare KV).
- **Core is runtime-agnostic** (Web `Request`/`Response`); platform specifics live
  only in `@tango/adapters/*`.
- Keep the core dependency-light and tree-shakeable; cold starts are a feature cost.

### P6 — Contract-first modularity.

- The codebase is a DAG of small packages, each with a **frozen public contract**
  (`index.ts` surface + a checked-in `.d.ts` snapshot).
- You implement *into* a contract; you do not redesign it mid-stream. Changing a
  contract is a deliberate, reviewed, separate PR.
- Nothing depends "upward" in the DAG (see `README.md` package graph).

### P7 — Every folder documents itself.

- **Every meaningful folder contains a `README.md`** following the template in
  `docs/FOLDER_README_TEMPLATE.md`. See §5.

---

## 4. The verification loop stack

Run cheapest → most expensive. Every PR must pass **all** gates; none are skippable.

1. **`tsc --strict`** — zero errors.
2. **No-`any` / no-unsafe lint** (`eslint.config.mjs`) — enforced in pre-commit and CI.
3. **Type-level tests** (`expect-type`) — inference is correct; invalid usage fails to compile.
4. **Unit tests** — pure logic (lookup → SQL, validation, routing).
5. **Integration tests vs real MySQL** — Dockerized; the ORM's product is its SQL. Never mocked.
6. **Parity tests vs a real Django/DRF reference** — the keystone gate. Objective "is this still Django?".
7. **Public API snapshot** — `.d.ts` diff; contracts can't change silently.
8. **Example-app dogfood** — a real app on public APIs, deployed to all serverless targets in CI.

---

## 5. Per-folder documentation rule

Every meaningful folder MUST contain a `README.md` answering, at minimum:

1. **Responsibility** — what this module is responsible for, in one paragraph.
2. **What it responds to** — its inputs / triggers / the contract it fulfills.
3. **Functionality** — what it currently provides (kept in sync with the code).
4. **Design patterns that matter here** — the patterns a contributor must respect
   (e.g. "serverless: no module-level mutable state", "lazy: nothing executes until
   the QuerySet is awaited", "declarative: behavior comes from config, not overrides").
5. **Public contract** — the frozen surface; what may and may not be imported.
6. **Testing** — where the tests live and which oracle/parity suite covers it.

Template lives at `docs/FOLDER_README_TEMPLATE.md`.

---

## 6. Coding standards (non-negotiable)

- **No `any`.** No `@ts-ignore` / `@ts-expect-error` without an inline justification
  comment that explains the precise, unavoidable reason.
- **No non-null assertions (`!`).** Narrow instead.
- **No module-level mutable state** (serverless safety).
- **No imperative override where a declaration will do** (P4).
- **No new public surface without a contract + tests written first** (P3, P6).
- Comments explain non-obvious *intent/constraints* only — never narrate the code.

---

## 7. Definition of Done (every task)

A task is done only when **all** are true:

- [ ] Behavior was specified by a failing test first; that test is now green.
- [ ] Parity test against Django/DRF passes (where an oracle exists).
- [ ] `tsc --strict` clean; lint clean (**zero `any`**, zero unsafe).
- [ ] Type-level tests assert both correct inference and that misuse won't compile.
- [ ] Integration tests run against a real MySQL (no mocks).
- [ ] Public API snapshot unchanged (or contract change reviewed in its own PR).
- [ ] The folder's `README.md` is updated to match reality.
- [ ] PR is small and scoped to a single task.
