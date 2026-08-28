# Scheduling: the algorithm, shift leads, and swaps

## The auto-scheduling algorithm

`src/lib/scheduling/generate.ts`'s `generateSchedule()` is a **pure, DB-free
function** — plain data in (`SchedulingUser[]`, `AvailabilityWindow[]`),
plain data out (`GeneratedShift[]`). `src/lib/scheduling/run-generation.ts`
is the only thing that talks to Prisma: it pulls real users/availability/
lecture-help hours, calls the pure function, and persists the result as
Week/Shift/ShiftAssignment rows. Both the professor's "Generate schedule"
button and the Thursday 5pm cron job (`/api/schedule/generate`) call
`run-generation.ts` — same code, different trigger/auth.

**Key invariant: a TA's assigned hours on a given day must always be one
unbroken block** — never scattered hours with a gap. This drives most of the
algorithm's structure:

- **Pass 1** assigns each user's first available window per day, capped at
  their remaining quota. If a user has two separate availability windows the
  same day, only the first one Pass 1 reaches gets used directly — the
  second is deliberately deferred to Pass 2's edge-extend logic, which only
  picks it up if it's genuinely adjacent to the block Pass 1 already made.
  Assigning both directly would risk a gap between them.
- **Pass 2** fills each hour up to `minTas` and trims each hour down to
  `maxTas`, always by extending or shrinking a block's edge — never by
  opening a hole in the middle of someone's block.
- **Pass 2b** (added alongside the shift-lead guarantee below) tries to get
  a returning TA onto every shift even once `minTas` is already satisfied by
  others, using any spare room under `maxTas`. It also protects a shift's
  *last* remaining returning TA from being trimmed back off in the max-
  headcount pass — with a fallback that trims them anyway rather than
  silently exceed `maxTas`, since the headcount cap is the harder constraint.
- **Pass 3** assigns each hour's lead by round-robining through assigned
  returning TAs, and computes two independent flags per shift:
  `needsAttention` (headcount below `minTas`) and `needsLead` (nobody
  assigned is a returning TA, so no lead was possible at all — see below).

## Shift leads

Only a **returning TA** (`User.isReturning`) can be a shift's lead — that's
the entire meaning of the field. The algorithm actively tries to guarantee
one on every shift (Pass 2b above), and since roughly 80% of real TAs are
returning, `needsLead` should end up empty or close to it in practice — but
it's an honest flag, not a hard guarantee, because the algorithm can't
conjure a returning TA who has zero availability at that hour. When that
happens, it's surfaced (Professor Dashboard's "Needs attention" list flags
it explicitly, separately from understaffing) rather than silently
producing a leadless shift.

Manual lead assignment (`toggleLead` in `uta/schedule/actions.ts`) mirrors
this server-side, not just in the UI: it rejects a non-returning target, and
marking someone lead unmarks anyone else on the same shift in the same
transaction — a shift can never end up with two leads via a UI race.

## Swap mechanics: two mechanisms, two very different constraints

**Self-move** (`moveToOpenShift`) — instant, no approval, headcount-gated:
move yourself from a shift you're on into a *different* shift, as long as
(a) your current shift has more than `minTas` people (leaving won't drop it
below minimum) and (b) the target shift isn't already at `maxTas`. This is
the *only* place headcount actually matters for swaps, because it's an
asymmetric move — one shift loses a person with nobody replacing them there,
the other gains one.

**Direct request** (`requestSwap` / `respondToSwapRequest`) — always names a
specific teammate, goes through `SwapRequest` (`PENDING → ACCEPTED/DENIED`)
with a Notification, takes effect only once accepted. **This is always a
balanced 1-for-1 exchange** — someone leaves a shift, someone else fills
that exact slot (or, for a two-way trade, both directions happen at once) —
so a shift's headcount never actually changes and there's no min/max check
to make here. If you're ever asked to "add the same headcount check to
`requestSwap`," that's very likely based on a misunderstanding of this
symmetry, not a real gap — verify the shift's headcount genuinely could
change before adding one.

Two entry points reach the same `requestSwap` action from opposite
directions: from your own shift ("Request a swap with a teammate"), and —
added later — from viewing a **full** shift you're not on ("Request to swap
into this shift"), which lets you pick who to ask and offer one of your own
shifts in exchange. Functionally identical (`fromShiftId`/`targetUserId`/
`toShiftId` are the same three parameters either way), just a different UI
starting point. Self-move can't get you into a full shift at all (no room)
or out of a shift already at its minimum — the direct-request path is what
covers both of those cases.

**Past shifts are locked** in all three swap-touching actions
(`moveToOpenShift`, `requestSwap`, and `respondToSwapRequest` — re-checked at
*accept* time too, since time may have passed since the request was made;
denying a stale request is still always allowed). "Already happened" is
computed by `src/lib/shift-time.ts`'s `hasShiftStarted`, derived from
`Week.weekStartDate` + `Shift.dayOfWeek`/`startTime` — there's no separate
date column to keep in sync. The schedule grid also greys out the relevant
UI for a passed shift, using the same function client-side (it's not
`server-only`, unlike most of this app's DB-touching code, specifically so
both sides can share one implementation).
