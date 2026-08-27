import { Suspense } from "react";
import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { PageHeader } from "@/components/app-shell/app-shell";
import { InlineLoading } from "@/components/app-shell/inline-loading";
import { DAY_LABELS, formatHour } from "@/lib/operating-hours";
import { AlertTriangle } from "lucide-react";
import { GenerateButton } from "./generate-button";
import { AnnouncementForm } from "./announcement-form";

export default async function ProfessorPage() {
  const user = await requireRole("PROFESSOR");

  return (
    <>
      <PageHeader title="Dashboard" />
      <p className="mb-8 text-sm text-text-muted">
        Signed in as {user.name} ({user.email}).
      </p>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Send an announcement
      </h2>
      <div className="mb-8">
        <AnnouncementForm />
      </div>

      <Suspense fallback={<InlineLoading />}>
        <ScheduleStatus />
      </Suspense>
    </>
  );
}

// The only part of this page that needs the week + shift data — kept out
// of the top-level await so the header/announcement form above render
// immediately on every navigation instead of waiting on Prisma.
async function ScheduleStatus() {
  const week = await getOrCreateUpcomingWeek();

  const shifts = await prisma.shift.findMany({
    where: { weekId: week.id },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: { assignments: true },
  });

  const needsAttention = shifts.filter(
    (shift) =>
      shift.assignments.length < shift.minTas ||
      (shift.assignments.length > 0 && !shift.assignments.some((a) => a.isLead)),
  );

  return (
    <>
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Generate — week of {week.weekStartDate.toLocaleDateString()}
      </h2>
      <div className="mb-2">
        <GenerateButton />
      </div>
      <p className="mb-8 text-xs text-text-muted">
        {week.generatedAt
          ? `Last generated ${week.generatedAt.toLocaleString()}. Re-running replaces every shift and assignment for this week.`
          : "Not generated yet. This runs the contiguous-block algorithm against everyone's current availability and lecture-help assignments."}
      </p>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Needs attention
      </h2>
      {shifts.length === 0 ? (
        <p className="mb-8 text-sm text-text-muted">
          No shifts yet for this week — generate a schedule or create shifts manually.
        </p>
      ) : needsAttention.length === 0 ? (
        <p className="mb-8 text-sm text-text-muted">
          Every generated shift meets its minimum headcount.
        </p>
      ) : (
        <div className="mb-8 flex flex-col gap-2">
          {needsAttention.map((shift) => {
            const [hour] = shift.startTime.split(":").map(Number);
            const dayLabel =
              DAY_LABELS[shift.dayOfWeek as keyof typeof DAY_LABELS] ?? `Day ${shift.dayOfWeek}`;
            const understaffed = shift.assignments.length < shift.minTas;
            const missingLead = shift.assignments.length > 0 && !shift.assignments.some((a) => a.isLead);
            return (
              <Link
                key={shift.id}
                href="/uta/schedule"
                className="announcement-card flex items-center justify-between p-4 text-sm transition-opacity hover:opacity-90"
              >
                <span className="flex items-center gap-2.5">
                  <AlertTriangle size={16} className="text-accent" strokeWidth={2} />
                  {dayLabel} {formatHour(hour)}–{formatHour(hour + 1)}
                </span>
                <span className="text-text-muted">
                  {understaffed && `${shift.assignments.length}/${shift.minTas} min TAs`}
                  {understaffed && missingLead && " · "}
                  {missingLead && "no lead"}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
