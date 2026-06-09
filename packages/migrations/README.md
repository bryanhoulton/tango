# @tango-ts/migrations

## Responsibility

Schema **state**, the **autodetector**, the **MySQL renderers**, and the **executor**.
Turns model definitions into a normalized `SchemaSnapshot`, diffs two snapshots
(expected -> target) into reversible `Operation`s, renders those to MySQL DDL, and
applies/rolls them back against a real database with a `tango_migrations` ledger.
`introspectSchema` reads the live DB back into a snapshot for round-trip verification
and drift detection. Detection is **pure and DB-free** (CI/serverless friendly);
application runs at **deploy time**, never per request.

## What it responds to

- An array of models (`Model[]`) -> `buildSnapshot` -> `SchemaSnapshot`.
- Two snapshots (from a prior migration vs current models) -> `diffSnapshots` -> `Operation[]`.

## Functionality

- `buildSnapshot(models)` / `buildTableSnapshot(model)` / `emptySnapshot()`.
- `Operation` IR: `createTable`, `dropTable`, `renameTable`, `addColumn`, `dropColumn`,
  `alterColumn`, `renameColumn`, `addUnique`, `dropUnique`, `runSql` (escape hatch).
- `diffSnapshots(from, to, { renames })` — deterministic, ordered autodetector.
- `detectRenameCandidates(from, to)` — ambiguous drop+add pairs for the CLI to prompt on.
- `renderOperation` / `renderOperations` — `Operation` -> forward + reverse MySQL DDL.
- `introspectSchema(db)` — live MySQL (`information_schema`) -> `SchemaSnapshot`.
- `planMigration`, `migrate`, `rollback`, `appliedMigrations`, `ensureMigrationsTable`.

## Design patterns that matter here

- **Single source of truth (P2):** snapshots are derived from the same `FieldSpec`
  that drives the ORM. No separate schema declaration.
- **Pure / DB-free:** detection never touches a database (CI + serverless friendly).
- **Snapshot-diff, not replay:** the "from" state is a stored snapshot, not a replay of
  historical operations — simpler and deterministic.
- **No destructive guessing:** renames are supplied explicitly (interactive prompt or
  `renamedFrom()` hints). `detectRenameCandidates` surfaces ambiguity; it never resolves
  it silently.

## Public contract

Everything re-exported from `src/index.ts`.

## Testing

- Unit (`test/diff.test.ts`, `test/snapshot.test.ts`): exact `Operation[]` assertions
  for create/drop/add/alter/rename/unique scenarios.
- Unit (`test/mysql.test.ts`): exact forward/reverse DDL per operation.
- Parity (`test/django-parity.test.ts`): the same scenarios are fed to a real Django
  `MigrationAutodetector` (via `uv run` + Django) and compared. Fails loudly if uv or
  Django is unavailable — it never skips.
- Integration (`test/executor.integration.test.ts`): the round-trip keystone — apply to
  real MySQL, `introspectSchema`, and assert the live schema equals the target snapshot;
  plus idempotency and rollback.
