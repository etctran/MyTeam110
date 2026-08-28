# Deployment: Vercel + hosted Supabase

## Two connection strings, not one

Hosted Supabase needs **both** of these set (local dev needs neither split —
one plain Postgres, `DATABASE_URL` alone is fine):

```
# App runtime (Server Actions, route handlers) — transaction-mode pooler.
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Prisma CLI only (migrate deploy, db seed, unseed, load-test) — session-mode pooler.
DIRECT_URL="postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres"
```

**Why:** transaction-mode pooling (6543) doesn't support the session-level
advisory locks Prisma's migration engine takes out — it doesn't error, it
just **hangs indefinitely**. If `prisma migrate deploy` (or `db:seed`, or
anything else run through the CLI) hangs against a hosted project with no
error at all, this is almost certainly why — switch that one command to
`DIRECT_URL` (session pooler, 5432), don't debug it as a network/credentials
issue. `prisma.config.ts` and every seed/unseed script already prefer
`DIRECT_URL` and fall back to `DATABASE_URL`, so this should already be
handled — the failure mode to watch for is a *new* script that constructs
its own Prisma client and forgets the fallback.

Runtime (`src/lib/prisma.ts`) always uses `DATABASE_URL` (transaction pooler)
— that's the correct choice for serverless, and it's also capped at
`max: 4` connections (see `docs/architecture.md`) to avoid connection-pool
exhaustion under concurrent invocations.

## Region

Next 16 deprecated the old `preferredRegion` route-segment export and
`vercel.json`'s `regions` array (Vercel now only accepts
`'auto'|'global'|'home'` there) — region pinning moved to a Vercel
project-dashboard setting instead of a code file. This was discovered mid-
session; if latency to the DB seems to matter, check the dashboard directly
(Project Settings) rather than reaching for a `vercel.json` regions array —
that mechanism no longer does anything on this Next version. The DB itself
is on AWS `us-east-2` (Ohio).

## Env vars the app actually reads at runtime

From `src/lib/supabase/{client,server,admin}.ts`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — the **Publishable key** goes here (new
  Supabase key naming; drop-in compatible with the legacy anon key)
- `SUPABASE_SERVICE_ROLE_KEY` — the **Secret key** goes here
- `DATABASE_URL` (see above)
- `CRON_SECRET` — arbitrary, invented (not fetched from anywhere); shared
  between the `/api/schedule/generate` route and the pg_cron job that calls
  it. Generate a fresh one for production, don't reuse a local-dev value.

`DIRECT_URL`, `SEED_TEST_PASSWORD`, and `RESEND_*` are **not** needed on
Vercel — the CLI-only ones because Vercel's build only ever runs `prisma
generate` (via `postinstall`), never `migrate deploy`; `RESEND_*` only if you
actually want email notifications on top of in-app ones.

## The cron job

`supabase/migrations/*_schedule_generation_cron.sql` sets up a Thursday 5pm
pg_cron job that POSTs to `/api/schedule/generate` with
`Authorization: Bearer <CRON_SECRET>`. The secret is **not** hardcoded in
that migration (it's committed to git) — it's read from a small
`private.app_secrets` table, populated once, separately, outside any
migration:

```sql
insert into private.app_secrets (key, value) values ('cron_secret', '<same value as CRON_SECRET>')
on conflict (key) do update set value = excluded.value;
```

The cron job's target URL needs updating to the real Vercel domain once one
exists (it's a placeholder until then).

## Housekeeping

Because the hosted DB password has passed through plaintext chat more than
once during setup/debugging, reset it again (Supabase dashboard → Database →
"Reset database password") once deployment work is genuinely done, and don't
reuse whatever value is sitting in old chat history.
