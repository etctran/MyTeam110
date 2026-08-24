import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { PageHeader } from "@/components/app-shell/app-shell";
import { ScheduleGrid } from "./schedule-grid";
import { SwapRequestsPanel, type PendingSwapRequest } from "./swap-requests-panel";

export default async function SchedulePage() {
  const user = await requireUser();
  const week = await getOrCreateUpcomingWeek();

  const [shifts, allTas, myAvailabilityRows, pendingSwapRequests] = await Promise.all([
    prisma.shift.findMany({
      where: { weekId: week.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: {
        assignments: {
          include: { user: { select: { id: true, name: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { role: "UTA" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.availability.findMany({ where: { userId: user.id } }),
    prisma.swapRequest.findMany({
      where: { targetId: user.id, status: "PENDING" },
      include: {
        requester: { select: { name: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
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
      <PageHeader title="Your Office Hours Schedule" />
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
      />
    </>
  );
}
