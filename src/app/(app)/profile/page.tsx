import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { computeEffectiveQuota } from "@/lib/scheduling/quota";
import { PageHeader } from "@/components/app-shell/app-shell";
import { DAY_LABELS, formatHour, type DayOfWeek } from "@/lib/operating-hours";
import { TeamTable, type TeamRow } from "./team-table";

export default async function ProfilePage() {
  const user = await requireUser();
  const week = await getOrCreateUpcomingWeek();

  return (
    <>
      <PageHeader title="Profile" />
      <div className="panel-card mb-8 p-4">
        <p className="font-medium">{user.name}</p>
        <p className="text-sm text-text-muted">
          {user.email} · {user.role}
          {user.taType ? ` · ${user.taType}` : ""}
          {user.isSenior ? " · senior" : ""}
        </p>
      </div>

      {user.role === "PROFESSOR" ? <TeamData weekId={week.id} /> : <MyData userId={user.id} weekId={week.id} weeklyQuota={user.weeklyQuota} />}
    </>
  );
}

async function MyData({
  userId,
  weekId,
  weeklyQuota,
}: {
  userId: string;
  weekId: string;
  weeklyQuota: number | null;
}) {
  const [hoursAssigned, lectureHelpSignups, availabilityRows, sentSwaps, receivedSwaps] = await Promise.all([
    prisma.shiftAssignment.count({ where: { userId, shift: { weekId } } }),
    // Lecture help is a standing roster (not week-scoped) — every current
    // assignment counts against quota every week alike.
    prisma.lectureHelpSignup.findMany({ where: { userId }, select: { hours: true } }),
    prisma.availability.findMany({ where: { userId }, orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
    prisma.swapRequest.findMany({
      where: { requesterId: userId },
      include: { target: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.swapRequest.findMany({
      where: { targetId: userId },
      include: { requester: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const lectureHelpHours = lectureHelpSignups.reduce((sum, s) => sum + s.hours, 0);
  const effectiveQuota = computeEffectiveQuota(weeklyQuota, lectureHelpHours);

  return (
    <>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        This week
      </h2>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Assigned" value={`${hoursAssigned}h`} />
        <Stat label="Weekly quota" value={weeklyQuota != null ? `${weeklyQuota}h` : "—"} />
        <Stat label="Lecture help" value={`${lectureHelpHours}h`} />
        <Stat label="Effective quota" value={`${effectiveQuota}h`} />
      </div>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Availability on file
      </h2>
      {availabilityRows.length === 0 ? (
        <p className="mb-8 text-sm text-text-muted">No availability set yet.</p>
      ) : (
        <ul className="mb-8 flex flex-col gap-1.5 text-sm">
          {availabilityRows.map((row) => {
            const [startHour] = row.startTime.split(":").map(Number);
            const [endHour] = row.endTime.split(":").map(Number);
            return (
              <li key={row.id} className="text-text-muted">
                <span className="text-text">{DAY_LABELS[row.dayOfWeek as DayOfWeek]}</span>{" "}
                {formatHour(startHour)}–{formatHour(endHour)}
              </li>
            );
          })}
        </ul>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Swap history
      </h2>
      {sentSwaps.length === 0 && receivedSwaps.length === 0 ? (
        <p className="text-sm text-text-muted">No swap requests yet.</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {sentSwaps.map((s) => (
            <li key={s.id} className="panel-card p-3">
              You asked <span className="font-medium">{s.target?.name ?? "the open pool"}</span> to swap —{" "}
              <StatusBadge status={s.status} />
            </li>
          ))}
          {receivedSwaps.map((s) => (
            <li key={s.id} className="panel-card p-3">
              <span className="font-medium">{s.requester.name}</span> asked you to swap —{" "}
              <StatusBadge status={s.status} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

async function TeamData({ weekId }: { weekId: string }) {
  const [tas, hoursByUser, lectureHoursByUser] = await Promise.all([
    prisma.user.findMany({
      where: { role: "UTA" },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, taType: true, isSenior: true, weeklyQuota: true },
    }),
    prisma.shiftAssignment.groupBy({
      by: ["userId"],
      where: { shift: { weekId } },
      _count: { _all: true },
    }),
    prisma.lectureHelpSignup.groupBy({
      by: ["userId"],
      _sum: { hours: true },
    }),
  ]);

  const hoursMap = new Map(hoursByUser.map((h) => [h.userId, h._count._all]));
  const lectureHoursMap = new Map(lectureHoursByUser.map((h) => [h.userId, h._sum?.hours ?? 0]));

  const rows: TeamRow[] = tas.map((ta) => {
    const lectureHelpHours = lectureHoursMap.get(ta.id) ?? 0;
    return {
      id: ta.id,
      name: ta.name,
      email: ta.email,
      taType: ta.taType,
      isSenior: ta.isSenior,
      weeklyQuota: ta.weeklyQuota,
      hoursAssigned: hoursMap.get(ta.id) ?? 0,
      lectureHelpHours,
      effectiveQuota: computeEffectiveQuota(ta.weeklyQuota, lectureHelpHours),
    };
  });

  return (
    <>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Team data — this week
      </h2>
      <TeamTable rows={rows} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="panel-card p-3">
      <p className="text-xs text-text-muted">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const color =
    status === "ACCEPTED" ? "text-accent" : status === "DENIED" ? "text-danger" : "text-text-muted";
  return <span className={color}>{status.toLowerCase()}</span>;
}
