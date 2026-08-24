# E2E tests

Real browser tests (Playwright) covering the core user journeys on top
of the Vitest unit tests for the algorithmic core (`src/lib/scheduling`).

## Running

Requires the local Supabase stack running and migrated — same as any
other local dev session:

```
pnpm supabase:start
pnpm db:migrate   # first time only
pnpm test:e2e
```

The dev server is started (or reused, if already running on :3000)
automatically by Playwright's `webServer` config.

## Isolation

Tests run against dedicated `e2e-*@e2e.test` accounts created by
`global-setup.ts` and swept by `global-teardown.ts` — never the shared
`@test.dev` seed accounts, so this can't clobber data from your own
manual testing/demo prep in the same local DB. Specs run fully
serially (`workers: 1` in `playwright.config.ts`) since they share
that one local DB.

## Why db-cli.ts instead of importing Prisma directly

The generated Prisma client (`src/generated/prisma`) is ESM-only
(`import.meta.url`, etc.) — Playwright's own Node-side loader can't
execute that directly (same class of issue as tsx vs. plain `ts-node`
elsewhere in this repo). `db-cli.ts` is a small command dispatcher run
via `tsx` as a subprocess (the one runtime here proven to load it
correctly); `run-db.ts` is the thin, Prisma-free wrapper any
Playwright-loaded file (global setup/teardown, spec files) calls
instead of importing Prisma itself.
