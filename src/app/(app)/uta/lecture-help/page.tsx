import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { computeEffectiveQuota } from "@/lib/scheduling/quota";
import { PageHeader } from "@/components/app-shell/app-shell";
import { SlotRow } from "./slot-row";

export default async function LectureHelpPage() {
  const user = await requireUser();
  const week = await getOrCreateUpcomingWeek();

  const slots = await prisma.lectureHelpSlot.findMany({
    where: { weekId: week.id },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    include: { signups: { include: { user: { select: { id: true, name: true } } } } },
  });

  const myLectureHelpHours = slots
    .flatMap((slot) => slot.signups)
    .filter((signup) => signup.user.id === user.id)
    .reduce((sum, signup) => sum + signup.hours, 0);

  const effectiveQuota = computeEffectiveQuota(user.weeklyQuota, myLectureHelpHours);

  return (
    <>
      <PageHeader title="Lecture Help Schedule" />

      {user.weeklyQuota != null && (
        <p className="mb-6 text-sm text-text-muted">
          You&apos;ve logged <span className="font-medium text-text">{myLectureHelpHours}h</span> of
          lecture help this week, which reduces your office-hours quota from{" "}
          <span className="font-medium text-text">{user.weeklyQuota}h</span> to{" "}
          <span className="font-medium text-text">{effectiveQuota}h</span>.
        </p>
      )}

      {slots.length === 0 ? (
        <p className="text-sm text-text-muted">No lecture-help slots posted for this week yet.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {slots.map((slot) => (
            <SlotRow key={slot.id} slot={slot} currentUserId={user.id} />
          ))}
        </div>
      )}
    </>
  );
}
