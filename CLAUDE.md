@AGENTS.md

# MyTeam110 — TA Scheduler

Office-hours and lecture-help scheduling for undergraduate TAs (COMP110-style
course). One professor-facing dashboard, one TA-facing schedule/availability
flow, built as a single Next.js app — no separate backend.

Deeper reference docs live in `docs/` and are **not** auto-loaded — open the
relevant one when a task actually touches that area, rather than reading all
of them up front:

- `docs/architecture.md` — data model, auth/security model, Realtime, why
  Prisma is wired the way it is
- `docs/scheduling.md` — the auto-scheduling algorithm, shift-lead rules,
  swap mechanics
- `docs/testing.md` — unit tests, e2e suite, seed/load-test scripts
- `docs/deployment.md` — Vercel + hosted Supabase, env vars, the cron job

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript · Prisma 7 (`@prisma/adapter-pg`
driver adapter, not the classic engine) · Supabase (Postgres + Auth + Realtime
Broadcast) · Tailwind v4 · Vitest (unit) + Playwright (e2e) · Vercel.

## Non-negotiable conventions

- **Never add a `Co-Authored-By` trailer to any commit.** The user has said
  this explicitly and it has had to be corrected via history rewrite before —
  don't reintroduce it.
- **Commit and push only when the user asks**, even mid-feature. Don't assume
  a prior "yes" carries forward to unrelated work.
- **Read `node_modules/next/dist/docs/`** before assuming any Next.js API
  behaves like your training data — see `AGENTS.md` above. This bit us
  concretely once already (`preferredRegion`/`vercel.json` regions turned out
  deprecated; Proxy's official guidance turned out to be "optimistic cookie
  read only," not `auth.getUser()`).
- **Never import anything that pulls in `"server-only"` from a file Playwright
  (or any non-Next tool) loads directly** — the generated Prisma client and
  anything importing it falls in this category outside of Next's own bundler.
  See `docs/testing.md`.

## Quick commands

```
pnpm dev                 # local dev server (needs local Supabase running)
pnpm supabase:start       # start local Supabase (needs Docker running)
pnpm db:migrate           # apply a new migration locally
pnpm db:seed              # 8-account demo roster (prof1/prof2 + ta1-6, password123)
pnpm db:unseed            # remove every @test.dev account
pnpm db:seed:loadtest     # +40 realistic TAs, then generates a schedule
pnpm test                 # vitest (pure-function unit tests only)
pnpm test:e2e             # playwright (needs local Supabase + workers:1)
```

## Where things live

```
src/app/(app)/                  # authenticated routes, shared layout + sidebar
  professor/                    # dashboard: announcements, generate, needs-attention
  uta/schedule/                 # the grid — self-move, swap requests, lead toggling
  uta/availability/              # TA-only (redirects professors away)
  uta/lecture-help/              # standing roster, shared by both roles
  profile/                       # Add-TA flow, edit taType/isReturning/quota
src/app/api/schedule/generate/   # the one real API route — cron + manual "Generate"
src/lib/scheduling/              # generate.ts (pure algorithm) + run-generation.ts (DB glue)
src/lib/auth/dal.ts              # the actual security boundary — see docs/architecture.md
src/lib/shift-time.ts            # "has this shift already started" — no server-only import
prisma/seed.ts                   # small demo roster; seed-load-test.ts — 40-TA realistic mix
e2e/                              # db-cli.ts is the one way e2e touches the DB — see docs/testing.md
```
