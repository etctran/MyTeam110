import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { PageHeader } from "@/components/app-shell/app-shell";
import { DAY_LABELS, formatHour } from "@/lib/operating-hours";
import { AlertTriangle } from "lucide-react";
import { GenerateButton } from "./generate-button";
import { AnnouncementForm } from "./announcement-form";

export default async function ProfessorPage() {
  const user = await requireRole("PROFESSOR");
  const week = await getOrCreateUpcomingWeek();

  const shifts = await prisma.shift.findMany({
    where: { weekId: week.id },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: { assignments: true },
  });

  const needsAttention = shifts.filter((shift) => shift.assignments.length < shift.minTas);

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
                  {shift.assignments.length}/{shift.minTas} min TAs
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}
