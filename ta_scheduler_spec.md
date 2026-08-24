# TA Scheduling System — MVP Technical Spec
 
## 1. Stack
 
- **Next.js 14 (App Router) + TypeScript** — full stack in one repo
- **PostgreSQL via Supabase** — DB + Auth + RLS + pg_cron
- **Prisma** — schema + migrations + type-safe queries
- **Supabase Auth** — email/password, role stored on the `User` row
- **Tailwind CSS** — fast UI
- **Vercel** — hosting
- **Resend** (phase 2) — email notifications on top of in-app notifications
Why this combo: everything is JS/TS, minimal moving parts, both Vercel and Supabase have free tiers sufficient for a small teaching team, and it's a very common stack so Claude Code will generate high-quality, idiomatic code for it.
 
---
 
## 2. Roles
 
- **PROFESSOR** — sets rules (min/max per shift, quotas), triggers/edits generated schedules, appoints shift leads, resolves stuck slots, sees everyone's data.
- **UTA** — sets own availability, views schedule, requests swaps, accepts/denies swap requests directed at them.
---
 
## 3. Data Model (Prisma-style)
 
```prisma
enum Role {
  PROFESSOR
  UTA
}
 
enum TaType {
  FIVE_HOUR   // 4 hrs of office hours/week
  TEN_HOUR    // 8 hrs of office hours/week
}
 
enum SwapStatus {
  PENDING
  ACCEPTED
  DENIED
  CANCELLED
}
 
model User {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  role          Role
  taType        TaType?
  isSenior      Boolean  @default(false)   // eligible to be a shift lead
  hireDate      DateTime?
  weeklyQuota   Int?      // computed from taType, or overridden
  createdAt     DateTime @default(now())
 
  availability  Availability[]
  assignments      ShiftAssignment[]
  lectureHelpDone  LectureHelpSignup[]
  sentSwaps        SwapRequest[] @relation("Requester")
  receivedSwaps    SwapRequest[] @relation("Target")
  notifications    Notification[]
}
 
model Availability {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  dayOfWeek Int       // 0=Sun ... 6=Sat
  startTime String    // "11:00"
  endTime   String    // "19:00"
}
 
model Week {
  id            String   @id @default(cuid())
  weekStartDate DateTime @unique
  generatedAt   DateTime?
  status        String   // DRAFT | PUBLISHED
  shifts        Shift[]
}
 
model Shift {
  id         String   @id @default(cuid())
  weekId     String
  week       Week     @relation(fields: [weekId], references: [id])
  dayOfWeek  Int
  startTime  String    // "11:00"
  endTime    String    // "12:00" — shifts are 1-hour blocks
  minTas     Int      @default(3)
  maxTas     Int      @default(7)
 
  assignments ShiftAssignment[]
}
 
model ShiftAssignment {
  id       String   @id @default(cuid())
  shiftId  String
  shift    Shift    @relation(fields: [shiftId], references: [id])
  userId   String
  user     User     @relation(fields: [userId], references: [id])
  isLead   Boolean  @default(false)
  openForSwap Boolean @default(false)   // posted to the open-swap pool
 
  @@unique([shiftId, userId])
}
 
model SwapRequest {
  id             String     @id @default(cuid())
  requesterId    String
  requester      User       @relation("Requester", fields: [requesterId], references: [id])
  targetId       String?    // null = open swap (anyone can claim)
  target         User?      @relation("Target", fields: [targetId], references: [id])
  fromShiftId    String     // the shift the requester wants to give up
  toShiftId      String?    // the shift they want in exchange (null if just dropping)
  status         SwapStatus @default(PENDING)
  createdAt      DateTime   @default(now())
  resolvedAt     DateTime?
}
 
model LectureHelpSlot {
  id         String   @id @default(cuid())
  weekId     String
  week       Week     @relation(fields: [weekId], references: [id])
  courseInfo String    // e.g. "CS 201 — Mon 10:00 lecture"
  dayOfWeek  Int
  startTime  String
  endTime    String
  capacity   Int      @default(1)   // how many TAs can help this lecture
 
  signups    LectureHelpSignup[]
}
 
model LectureHelpSignup {
  id      String   @id @default(cuid())
  slotId  String
  slot    LectureHelpSlot @relation(fields: [slotId], references: [id])
  userId  String
  user    User     @relation(fields: [userId], references: [id])
  hours   Int       // duration of the slot, cached here for quota math
 
  @@unique([slotId, userId])
}
 
model Notification {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  type      String   // "SWAP_REQUEST" | "SWAP_ACCEPTED" | "SWAP_DENIED" | "ALL_HANDS_REMINDER" | "SCHEDULE_PUBLISHED"
  message   String
  relatedSwapId String?
  read      Boolean  @default(false)
  createdAt DateTime @default(now())
}
```
 
---
 
## 4. Operating Hours (config, not hardcoded in UI)
 
Store as a small config table or constants file so the professor can adjust without a code change:
 
- Mon–Wed: 11:00–19:00
- Thu–Fri: 11:00–17:00
- Sun: 13:00–17:00
- All-hands: Thursday 17:00–18:00 (recurring reminder, not a schedulable slot — TAs should not be scheduled for office hours during this hour on Thursday)
---
 
## 5. Frontend Navigation & Screens
 
**UTA nav — 3 tabs:**
 
1. **Your Availability** — the weekly grid editor from §4/§6. Click/drag to mark available hours within operating windows.
2. **Your Office Hours Schedule** — the main week grid, described in detail below.
3. **Lecture Help Schedule** — list of professor-posted lecture-help slots for the week; sign up / withdraw. Signing up reduces `effectiveQuota` per §6.
**Professor nav** — the same 3 tabs (read/manage everyone's data) plus a **Dashboard** tab: trigger generation, resolve "needs attention" slots, appoint leads, post lecture-help slots.
 
---
 
### "Your Office Hours Schedule" tab — detail
 
Renders as a week grid (days as columns, hours as rows). Every cell shows the **names of every TA assigned to that hour** — not just your own shifts — so the whole team's schedule is visible at a glance. Cells you're personally assigned to are visually marked (e.g., highlighted border) so you can spot your own shifts quickly.
 
**Two visual signals layered on top of the base grid:**
 
- **Open-swap opportunities**: any cell where (a) you're available per your `Availability` rows, (b) you're *not* already assigned to it, and (c) it currently has fewer than 7 TAs (room to join) — these are highlighted as "open to join." This is the "days you can swap into" view: it's just the open-swap pool filtered down to hours that actually fit your stated availability, overlaid directly on the schedule instead of a separate list.
- **Your own shifts** you could freely leave (headcount currently > 3, so dropping you still meets the minimum) get a small "eligible to post for swap" indicator.
**Clicking a cell opens a panel showing:**
 
- Full roster for that hour (names + lead badge).
- **If it's your own shift:**
  - "Request a swap with a teammate" → pick another TA + optionally one of their shifts you'd take in exchange → creates a `SwapRequest`, sends them a `Notification` with Accept/Deny.
  - "Post to open swap pool" → only enabled if current headcount > 3 (removing you still meets the minimum). Anyone eligible (available + it wouldn't push the slot over 7) can claim it.
- **If it's someone else's shift and it's open** (posted to the pool, you're available for it, and joining wouldn't exceed 7): "Claim this shift" button — assigns you directly, no approval needed since it's already been opened up.
- **If it's someone else's shift and it's not open**: just the roster, no action (you can't cold-request a swap on a shift the owner hasn't offered — that has to go through your own shift's "Request a swap" flow instead, targeting them).
---
 
### "Lecture Help Schedule" tab — detail
 
List (or mini weekly grid) of lecture-help slots for the upcoming week: course/lecture name, day/time, capacity, and who's already signed up. A "Sign up" button per open slot; a "Withdraw" button on slots you've already claimed. Shows your running lecture-help hours for the week and the resulting reduced office-hours quota, so you can see the tradeoff before committing.
 
---
 
**Profile / data (both roles, accessible from account menu rather than a main tab):** hours assigned this week vs quota, lecture-help hours logged, swap history, availability on file. For the professor, this same view doubles as the per-TA data page referenced in your original ask ("data for each TA") — filterable/searchable across the whole team.
 
---
 
## 6. Auto-Scheduling Algorithm (MVP: contiguous-block greedy)
 
Runs when the professor clicks "Generate" or via the Thursday 5pm cron job.
 
**Key rule: a TA's assigned hours on a given day must always be one unbroken block — never scattered hours with a gap in between.** A TA available 1–4pm who's scheduled should get 1–4 (or a contiguous sub-range of it), never "1–2, then 3–4."
 
Because each `Availability` row is already a single contiguous window per TA per day, the algorithm assigns *whole windows (or a contiguous sub-block of a window)* as the atomic unit — never individual disconnected hours.
 
```
for each Week to generate:
  for each User:
    lectureHelpHours = sum(hours from that User's LectureHelpSignups for this Week)
    effectiveQuota   = max(0, weeklyQuota - lectureHelpHours)
    remainingQuota    = effectiveQuota
 
  for each Day in operating days (in chronological order):
    windows = all Availability rows for that Day, across all Users
              (each row is already contiguous by construction)
 
    # Pass 1: assign contiguous sessions
    sort windows by (User.remainingQuota DESC, window length ASC)
      # prioritize TAs furthest from their quota; use shorter windows first
      # so long windows are held in reserve to plug gaps later
 
    for each window:
      user = window.user
      if user.remainingQuota <= 0: skip
      sessionLength = min(window.length, user.remainingQuota)
      assign user to hours [window.start, window.start + sessionLength)
        # always starts at window.start -> stays contiguous, no gaps
      user.remainingQuota -= sessionLength
 
    # Pass 2: check hourly headcount across the day
    for each hour in that Day's operating hours:
      count = number of Users assigned to that hour
 
      if count < 3:
        # find Users with an Availability window covering this hour who still
        # have remainingQuota > 0 and are NOT already assigned elsewhere at
        # a non-adjacent time today (to avoid creating a gap for them)
        candidates = eligible Users, sorted by remainingQuota DESC
        extend assignments hour-by-hour, but ONLY by growing an existing
        assigned block at its edge, or starting a fresh contiguous block
        — never insert an isolated hour into the middle of a user's day
 
      if count > 7:
        # trim from the EDGE of an assigned block only (first or last hour
        # of that user's session), never from the middle — this keeps every
        # remaining assignment contiguous
        remove the trim candidate with the most slack vs their quota
 
  # Pass 3: assign leads
  for each Shift (hour):
    if any assigned User.isSenior == true:
      mark one senior as isLead (round-robin among seniors if multiple)
    else:
      leave unassigned — flagged for professor to appoint manually
 
  # Flag problem slots
  any Shift with count < 3 (after Pass 2) → status "NEEDS_ATTENTION",
  surfaced on professor dashboard for manual resolution
```
 
**Dependency note:** lecture-help sign-ups must close before the generation run (whether triggered manually by the professor or by the Thursday 5pm cron), since `effectiveQuota` depends on that week's `LectureHelpSignup` rows already existing. Simplest approach: lecture-help slots for "next week" are posted early in the current week and sign-up simply closes the moment generation runs — no separate deadline field needed for v1.
 
**Why this avoids the gap problem:** assignment happens at the *window* level, not the hour level. The only place gaps could sneak back in is Pass 2's "extend to hit minimum 3" step — which is why that step is restricted to growing a block's edge or starting a fresh block, never inserting a lone hour into someone's day.
 
This greedy approach is deliberately simple for v1. If it produces too many "needs attention" gaps in practice (e.g., availability is too sparse or too many windows are short), the natural phase-2 upgrade is a proper constraint solver (e.g., Google OR-Tools via a small Python microservice) that can optimize block placement globally instead of greedily — not worth building until you've seen real scheduling data show the greedy approach struggling.
 
---
 
## 7. Swap Logic
 
**Open swap (post to pool):**
- Only allowed if removing the requester from that shift keeps the slot ≥ 3 TAs.
- Posts to a pool; first other eligible/available TA to claim it gets auto-assigned; requester removed.
**Direct swap (person-to-person):**
- Requester picks their shift + optionally a shift of the target's they'd like in exchange.
- Creates `SwapRequest` (PENDING) + `Notification` to target.
- Target accepts → both `ShiftAssignment` rows update atomically (swap the two shifts, or just transfer if one-directional) → status ACCEPTED → notification back to requester.
- Target denies → status DENIED → notification back to requester.
- Constraint check on accept: resulting headcounts must still respect min 3 / max 7 on both shifts involved.
---
 
## 8. Automation
 
- **pg_cron job (Thursday 5:00 PM)**: triggers an API route `/api/schedule/generate` for `weekStartDate = next Sunday` (or whatever your week boundary is). Runs the algorithm, creates the `Week` + `Shift` rows in DRAFT, sends a `SCHEDULE_PUBLISHED` (or "ready for review") notification to the professor.
- **All-hands reminder**: simple recurring notification job, or just a persistent banner on the dashboard every Thursday — doesn't need its own DB automation, can be a client-side computed reminder.
---
 
## 9. Build Order (phased — feed to Claude Code phase by phase)
 
1. **Scaffold**: Next.js + Prisma + Supabase project, auth, role-based routing/middleware.
2. **Data model**: implement schema above, run migrations, seed a few test users.
3. **Availability UI**: UTA can set/edit weekly availability within operating hours.
4. **Lecture-help sign-up**: professor posts slots, TAs sign up, quota reduction logic (`effectiveQuota`) implemented and unit-tested on its own.
5. **Manual schedule view**: professor can view/manually create shifts and assignments (no auto-gen yet) — this validates the data model before adding algorithm complexity.
6. **Auto-generate algorithm**: implement the contiguous-block heuristic as a standalone function, unit-test it against a few availability + lecture-help scenarios before wiring to UI.
7. **Professor dashboard**: trigger generation, view needs-attention slots, appoint leads, manage lecture-help slots.
8. **Swap flows**: open pool + direct request/accept/deny + notifications.
9. **Cron automation**: wire up Thursday 5pm auto-generate.
10. **Polish**: TA profile/data pages, all-hands reminder banner, email notifications (optional).
Each phase is a good unit to hand to Claude Code as its own session/prompt, referencing this doc for context.