import Link from "next/link";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { PageHeader } from "@/components/app-shell/app-shell";
import { DAY_LABELS, formatHour, formatTimeOfDay } from "@/lib/operating-hours";
import { LectureHelpForm } from "./lecture-help-form";
import { GenerateButton } from "./generate-button";

export default async function ProfessorPage() {
  const user = await requireRole("PROFESSOR");
  const week = await getOrCreateUpcomingWeek();

  const [slots, shifts] = await Promise.all([
    prisma.lectureHelpSlot.findMany({
      where: { weekId: week.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: { signups: { include: { user: { select: { name: true } } } } },
    }),
    prisma.shift.findMany({
      where: { weekId: week.id },
      orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
      include: { assignments: true },
    }),
  ]);

  const needsAttention = shifts.filter((shift) => shift.assignments.length < shift.minTas);

  return (
    <>
      <PageHeader title="Dashboard" />
      <p className="mb-8 text-sm text-text-muted">
        Signed in as {user.name} ({user.email}).
      </p>

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Generate — week of {week.weekStartDate.toLocaleDateString()}
      </h2>
      <div className="mb-2">
        <GenerateButton />
      </div>
      <p className="mb-8 text-xs text-text-muted">
        {week.generatedAt
          ? `Last generated ${week.generatedAt.toLocaleString()}. Re-running replaces every shift and assignment for this week.`
          : "Not generated yet. This runs the contiguous-block algorithm against everyone's current availability and lecture-help signups."}
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
                className="panel-card flex items-center justify-between p-3 text-sm hover:bg-bg-pill-hover"
              >
                <span>
                  {dayLabel} {formatHour(hour)}–{formatHour(hour + 1)}
                </span>
                <span className="text-danger">
                  {shift.assignments.length}/{shift.minTas} min TAs
                </span>
              </Link>
            );
          })}
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
        Lecture help
      </h2>

      <div className="mb-6">
        <LectureHelpForm />
      </div>

      {slots.length === 0 ? (
        <p className="text-sm text-text-muted">No lecture-help slots posted yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {slots.map((slot) => {
            const dayLabel =
              DAY_LABELS[slot.dayOfWeek as keyof typeof DAY_LABELS] ?? `Day ${slot.dayOfWeek}`;
            return (
              <div key={slot.id} className="panel-card p-4">
                <p className="font-medium">{slot.courseInfo}</p>
                <p className="text-sm text-text-muted">
                  {dayLabel} · {formatTimeOfDay(slot.startTime)}–{formatTimeOfDay(slot.endTime)} ·{" "}
                  {slot.signups.length}/{slot.capacity} signed up
                </p>
                {slot.signups.length > 0 && (
                  <p className="mt-1 text-xs text-text-muted">
                    {slot.signups.map((s) => s.user.name).join(", ")}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
