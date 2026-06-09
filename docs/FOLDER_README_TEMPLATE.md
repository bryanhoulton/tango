<!--
  Copy this file to README.md inside any meaningful folder and fill it in.
  Required by DESIGN_PRINCIPLES.md §5. Keep it in sync with the code — a stale
  README is a failing Definition of Done.
-->

# <module name>

## Responsibility

<One paragraph: what this module is responsible for, and just as importantly,
what it is NOT responsible for.>

## What it responds to

<Inputs / triggers / the contract this module fulfills. e.g. "Consumes a
QuerySet AST and produces a Kysely query node." or "Receives a Web `Request`
and returns a Web `Response`.">

## Functionality

<Bullet list of what this module currently provides. Kept in sync with the code.>

- ...

## Design patterns that matter here

<The patterns a contributor MUST respect in this folder. Be specific. Examples:>

- **Serverless:** no module-level mutable state; safe to import in a cold start.
- **Lazy:** nothing executes until the QuerySet is awaited/iterated.
- **Declarative (DRY):** behavior comes from configuration, not from overriding
  methods. New behavior = new declarative option, not new imperative code.
- **Inferred types:** all shapes derive from the model definition; no hand-written
  row interfaces.

## Public contract

<The frozen public surface (what `index.ts` exports). What may and may not be
imported from outside this package. Changing this requires its own PR.>

## Testing

- Unit: `...`
- Type-level (`expect-type`): `...`
- Integration (real MySQL): `...`
- Parity (vs Django/DRF oracle): `...`
