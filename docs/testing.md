# Testing

## Unit tests (Vitest)

`pnpm test`. Covers the algorithmic core only —
`src/lib/scheduling/generate.ts` (the scheduling algorithm, including the
shift-lead guarantee and its trim-protection edge cases),
`src/lib/scheduling/quota.ts`, and `src/lib/shift-time.ts` (the past-shift
boundary math). All pure functions, no DB, fast and deterministic.

`vitest.config.mts` excludes `**/e2e/**` — without that, Vitest picks up
Playwright spec files and fails trying to run them.

If you're testing something whose real trigger only matters in the future —
like `hasShiftStarted`'s exact boundary — prefer a direct unit test over a
live click-through. This app's scheduling only ever operates on "the
upcoming week" (`getOrCreateUpcomingWeek()` always resolves to next Sunday or
later), so there's no naturally-occurring *past* shift to click through in a
live browser test without manipulating the system clock.

## e2e tests (Playwright)

`pnpm test:e2e`. Needs the local Supabase stack running and migrated
(`pnpm supabase:start && pnpm db:migrate`) — the dev server itself is started
automatically by Playwright's `webServer` config.

**Why `e2e/db-cli.ts` exists instead of just importing Prisma:** the
generated Prisma client is ESM-only (`import.meta.url`, etc.), and anything
that imports `"server-only"` (which most of this app's DB code does)
outright throws when loaded by a tool that isn't Next's own bundler — the
`server-only` package's condition-based export map only resolves correctly
under Next's `react-server` condition. Playwright's Node-side loader (global
setup/teardown, spec files) hits both problems if it imports the real
Prisma client or anything that transitively pulls in `server-only`.

The fix: **all e2e DB access funnels through `e2e/db-cli.ts`, run as a `tsx`
subprocess** (`e2e/run-db.ts`'s `runDb()` helper) — a separate process
Playwright never actually `import`s, just shells out to. If you're adding a
new e2e helper that needs the DB, add a command to `db-cli.ts` and call it
through `runDb()`, never import Prisma (or anything importing
`run-generation.ts`, `dal.ts`, etc.) directly into a spec file or
`global-setup.ts`/`global-teardown.ts`.

The same ESM/`server-only` problem shows up any time you write a one-off
script outside Next (a scratch debugging script, a manual DB check) — if it
hangs on `WebSocket` errors or throws "This module cannot be imported from a
Client Component," the fix is either running it through `tsx` specifically
(not plain `node`) and/or importing `src/lib/supabase/ws-polyfill.ts` first,
or avoiding the import entirely the way `db-cli.ts` does.

**`playwright.config.ts` sets `workers: 1`.** Specs share one live local DB
and a small set of dedicated `e2e-*@e2e.test` accounts
(`e2e/global-setup.ts`/`global-teardown.ts`) — even with `fullyParallel:
false`, two spec files touching the same e2e TA's availability concurrently
corrupted shared state before this was added. The e2e accounts are separate
from the `@test.dev` demo/seed accounts specifically so e2e runs can't
clobber your own manual testing in the same local DB.

## Seed / demo data

- `pnpm db:seed` — the small 8-account demo roster (`prisma/seed.ts`):
  2 professors (Izzi Hinks, Kris Jordan — the real course staff names, not
  placeholders) + 6 TAs, a fixed mix of `taType`/`isReturning`. Password
  `password123` for everyone, all `@test.dev`.
- `pnpm db:unseed` — removes every `@test.dev` account (`prisma/unseed.ts`).
  Deliberately a *domain* sweep, not a specific-email list, so it also
  cleans up anything `db:seed:loadtest` added.
- `pnpm db:seed:loadtest` — adds 40 more TAs with randomized (seeded RNG, so
  reruns are reproducible) availability and a realistic mix (`isReturning`
  at ~80%, matching the real ratio), then triggers real schedule generation
  via HTTP against `/api/schedule/generate` — deliberately *not* by
  importing `run-generation.ts` directly, same ESM/`server-only` reasoning
  as the e2e suite above. Requires the dev server to already be running and
  `CRON_SECRET` set. Not part of the regular seed/unseed pair; purely for
  exploring the algorithm/UI at realistic scale. Clean up with
  `db:unseed && db:seed`.

All three read `DIRECT_URL` (falling back to `DATABASE_URL`) so they work
unmodified against either local dev or a hosted Supabase project — see
`docs/deployment.md` for why those differ.
