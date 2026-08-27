import { Suspense } from "react";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { PageHeader } from "@/components/app-shell/app-shell";
import { InlineLoading } from "@/components/app-shell/inline-loading";
import { LiveRefresh } from "@/components/live-refresh";
import { SCHEDULE_CHANNEL } from "@/lib/realtime";
import { ScheduleGrid } from "./schedule-grid";
import { SwapRequestsPanel, type PendingSwapRequest } from "./swap-requests-panel";

export default async function SchedulePage() {
  const user = await requireUser();

  return (
    <>
      <LiveRefresh channel={SCHEDULE_CHANNEL} />
      <PageHeader title="Office Hours Schedule" live />
      <Suspense fallback={<InlineLoading />}>
        <ScheduleContent user={user} />
      </Suspense>
    </>
  );
}

// TEMP diagnostic (systematic-debugging, see conversation): times each
// concurrent query independently so we can see which one accounts for
// the ~600-800ms delay that survived the pg-pool-size fix. Remove once
// root-caused.
const _timings: string[] = [];
function timed<T>(label: string, p: Promise<T>): Promise<T> {
  const t0 = Date.now();
  return p.then((v) => {
    _timings.push(`${label}=${Date.now() - t0}ms`);
    return v;
  });
}

async function ScheduleContent({ user }: { user: Awaited<ReturnType<typeof requireUser>> }) {
  // Only `shifts` depends on `week.id` — kick off the other three
  // independent queries immediately instead of waiting on the week
  // upsert first, and chain `shifts` off `week` without blocking on
  // them either. This hides the week round-trip behind the others
  // rather than paying for it as its own sequential leg.
  const weekPromise = timed("week", getOrCreateUpcomingWeek());
  const allTasPromise = timed(
    "allTas",
    prisma.user.findMany({
      where: { role: "UTA" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  );
  const myAvailabilityPromise = timed(
    "myAvailability",
    prisma.availability.findMany({ where: { userId: user.id } }),
  );
  const pendingSwapPromise = timed(
    "pendingSwap",
    prisma.swapRequest.findMany({
      where: { targetId: user.id, status: "PENDING" },
      include: {
        requester: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
  );

  const week = await weekPromise;
  const shiftsPromise = timed(
    "shifts",
    prisma.shift.findMany({
      where: { weekId: week.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: {
        assignments: {
          orderBy: { isLead: "desc" }, // lead first, everyone else keeps insertion order after
          include: { user: { select: { id: true, name: true, isReturning: true } } },
        },
      },
    }),
  );

  const [shifts, allTas, myAvailabilityRows, pendingSwapRequests] = await Promise.all([
    shiftsPromise,
    allTasPromise,
    myAvailabilityPromise,
    pendingSwapPromise,
  ]);

  const shiftsById = new Map(shifts.map((s) => [s.id, s]));
  const pendingRequests: PendingSwapRequest[] = pendingSwapRequests
    .map((req) => {
      const fromShift = shiftsById.get(req.fromShiftId);
      const toShift = req.toShiftId ? shiftsById.get(req.toShiftId) : null;
      if (!fromShift) return null; // stale reference (shift deleted since request was made)
      return {
        id: req.id,
        requesterName: req.requester.name,
        fromShift: { dayOfWeek: fromShift.dayOfWeek, startTime: fromShift.startTime },
        toShift: toShift ? { dayOfWeek: toShift.dayOfWeek, startTime: toShift.startTime } : null,
      };
    })
    .filter((r): r is PendingSwapRequest => r !== null);

  const myAvailability = myAvailabilityRows.map((row) => ({
    dayOfWeek: row.dayOfWeek,
    startHour: Number(row.startTime.split(":")[0]),
    endHour: Number(row.endTime.split(":")[0]),
  }));

  return (
    <>
      {/* TEMP diagnostic, see conversation — remove with the `timed()` helper above */}
      <p data-diag-timings={_timings.join(" ")} className="hidden" />
      <p className="mb-6 text-sm text-text-muted">
        Week of {week.weekStartDate.toLocaleDateString()}.
      </p>

      <SwapRequestsPanel requests={pendingRequests} />

      <ScheduleGrid
        shifts={shifts}
        allTas={allTas}
        currentUserId={user.id}
        isProfessor={user.role === "PROFESSOR"}
        myAvailability={myAvailability}
        weekStartDate={week.weekStartDate}
      />
    </>
  );
}
