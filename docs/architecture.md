# Architecture

## Data model

Nine models in `prisma/schema.prisma`:

- **User** — `role` (`PROFESSOR`/`UTA`), `taType` (`FIVE_HOUR`/`TEN_HOUR`,
  quota 4h/8h), `isReturning` (returning TAs only — the sole gate on who can
  be a shift lead; renamed from `isSenior` since that's all it ever meant),
  `weeklyQuota` (usually derived from `taType`, but overridable per-TA).
- **Availability** — one row per contiguous block a TA is free
  (`dayOfWeek` + `startTime`/`endTime`). `saveAvailability` collapses
  whatever cells a TA clicked into the minimum number of contiguous rows —
  the scheduling algorithm assumes availability windows are already
  contiguous per day, it doesn't merge them itself.
- **Week** — one row per generated week, keyed by `weekStartDate` (a
  `@unique` UTC midnight-of-Sunday timestamp — see "Weeks are UTC" below).
  There's exactly one "current" week at a time; nothing here supports
  browsing past/future weeks.
- **Shift** / **ShiftAssignment** — a Shift is one hour-block on one day of
  one Week (`minTas`/`maxTas` default 3/6, overridable when a professor
  manually creates one). ShiftAssignment has `isLead` — enforced server-side
  to be true for at most one assignment per shift, and only ever settable on
  a `User.isReturning` row (see `docs/scheduling.md`).
- **SwapRequest** — `PENDING → ACCEPTED/DENIED`, always a balanced 1-for-1
  exchange (see `docs/scheduling.md` for why that matters).
- **LectureHelpSlot** / **LectureHelpSignup** — a *standing* roster, not tied
  to a Week. One assigned section-day always costs exactly 1 hour off a TA's
  office-hours quota (`LectureHelpSignup.hours` is always created as `1`),
  regardless of how long that lecture section actually runs.
- **Notification** — `type` is a free-form string (`SWAP_REQUEST`,
  `SWAP_ACCEPTED`, `SWAP_DENIED`, `ALL_HANDS_REMINDER`, `SCHEDULE_PUBLISHED`,
  `ANNOUNCEMENT`), not a Prisma enum — see `src/lib/notifications.ts`'s
  `NotificationType` union for the actual typed contract.

## Auth: two layers, deliberately unequal

Every real check lives in **`src/lib/auth/dal.ts`**
(`requireUser`/`requireRole`), which calls `supabase.auth.getUser()` — a real
network round-trip to Supabase Auth that revalidates the session, then looks
up the authoritative `User` row (real role, real `isReturning`, etc.) by
email. Every page and Server Action calls this before touching data. It's
wrapped in React's `cache()` so multiple calls in one render pass cost one
lookup, not several.

**`src/proxy.ts`** (Next's middleware-equivalent — file renamed in this Next
version, see `AGENTS.md`) is *not* a second copy of that check. It runs on
literally every request, including prefetches Next fires just from a `<Link>`
being on-screen, so per Next's own docs it's supposed to stay to a cheap,
optimistic cookie read — no network call, no DB. It uses
`supabase.auth.getSession()` (decodes the JWT already in the cookie; only
hits the network if the token's actually expired) purely to redirect UTAs
away from `/professor` and bounce already-logged-in users off `/login`. If
proxy.ts's optimistic check and the DAL's authoritative check ever disagree,
the DAL wins — it's the one that actually gated the query.

This split used to be backwards (`getUser()` in both places, paying for the
network round-trip twice per navigation) until it was measured live and
fixed — see the commit history for `src/proxy.ts` if you're tempted to
"simplify" it back.

Role also lives in **two places** on purpose: Supabase's `app_metadata.role`
(so proxy.ts's redirect decision needs zero DB access) and the `User.role`
column (the actual authorization source of truth). They're set together at
user-creation time (seed scripts, the Add-TA flow) and never expected to
drift, but if they ever do, the DAL's DB lookup is what actually governs
access — proxy.ts would just redirect to the wrong tab, not grant access to
anything it shouldn't.

## Prisma 7 specifics

- The schema's `datasource` block has no `url` — connection info comes from
  `prisma.config.ts` (CLI/migrations) and an explicit `PrismaPg` driver
  adapter (`src/lib/prisma.ts`, the app's own runtime client) instead.
- The generated client (`src/generated/prisma/`, gitignored) is **ESM-only**
  and has no `index.ts` — always import from the `/client` subpath
  (`@/generated/prisma/client`), never the bare package root. `postinstall:
  "prisma generate"` regenerates it on every install since it's gitignored.
- `src/lib/prisma.ts` caps the adapter's pool at `max: 4`. `pg.Pool` defaults
  to 10, which on Vercel means up to 10 real connections to Supabase's
  pooler *per serverless container*, uncapped across however many containers
  happen to be running — a real, measured source of multi-second latency
  spikes on cold containers. 4 (not 1) because page loads intentionally run
  several queries concurrently via `Promise.all`; 1 would serialize those
  within a single request.
- **Two different connection strings matter for hosted Supabase**:
  `DATABASE_URL` (transaction-mode pooler, port 6543, `?pgbouncer=true`) for
  the app's own runtime queries, and `DIRECT_URL` (session-mode pooler, port
  5432) for anything the Prisma CLI does (`migrate deploy`, `db seed`, the
  unseed/load-test scripts). Transaction-mode pooling doesn't support the
  session-level advisory locks migrations need — it doesn't error, it just
  hangs. `prisma.config.ts` and the seed/unseed scripts all prefer
  `DIRECT_URL` and fall back to `DATABASE_URL` so local dev (one plain
  Postgres, no split needed) is unaffected. Full setup in
  `docs/deployment.md`.

## Realtime: Broadcast, not CDC

`src/lib/realtime.ts` uses Supabase Realtime **Broadcast**, deliberately not
`postgres_changes` (CDC). This app has **zero RLS policies** — every
authorization check lives in Server Actions, not the database — so CDC
broadcast would let anyone holding the public anon/publishable key subscribe
straight to raw table changes and bypass every check this app actually
relies on. Broadcast messages carry no row data, just an event name; the
client reacts by calling `router.refresh()` (or, for the toast, an
authenticated Server Action re-fetch), which re-runs the real, authenticated
query. Never "optimize" this by putting real data in a broadcast payload —
see `NotificationToast`'s data-fetching (it re-fetches through an
authenticated Server Action on every ping rather than trusting the ping's
own payload) for the same reasoning applied to a specific case.

Every mutation that should be live (schedule changes, notifications) both
persists via Prisma **and** calls `broadcast()` — the two aren't
transactional with each other, and a failed broadcast is deliberately
swallowed (logged, not thrown): the acting user's own view already updated
via `revalidatePath`, only *other* viewers miss the live nudge and see it on
their next natural navigation instead.

## Weeks are UTC, and so are shift hours (for now)

`getOrCreateUpcomingWeek()` (`src/lib/weeks.ts`) computes `weekStartDate` in
UTC deliberately — it's a `@unique` column, so it has to resolve to the same
instant regardless of the server's local timezone, or you get duplicate Week
rows for what's calendar-wise the same Sunday. `src/lib/shift-time.ts`
(`shiftStartsAt`/`hasShiftStarted`, used to lock past shifts — see
`docs/scheduling.md`) follows the same UTC convention for consistency, which
means **shift hours currently mean UTC, not real local wall-clock time**
wherever the campus actually is. Nothing in this codebase has ever assigned
operating hours a real timezone. Fine for now; worth fixing properly (not by
guessing at a fixed UTC offset — DST makes that wrong twice a year) if exact
real-world timing ever matters.

## Notifications + live toast

`src/lib/notifications.ts`'s `notify()` is the one place that creates a
Notification row — it also fires a best-effort email (only if
`RESEND_API_KEY`/`RESEND_FROM_EMAIL` are set) on the plain `prisma` client,
never inside the same transaction as the row it's layered on top of (a stuck
network call shouldn't be able to roll back a DB write that already
succeeded). `NotificationToast` is mounted once in `(app)/layout.tsx` so it's
live on every page, not just `/notifications` — on a broadcast ping it
re-fetches the latest notification through an authenticated Server Action
(never trusting the ping's own payload) and shows a dismissable banner.
