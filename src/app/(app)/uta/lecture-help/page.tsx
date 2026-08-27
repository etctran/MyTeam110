import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { computeEffectiveQuota } from "@/lib/scheduling/quota";
import { groupLectureHelpSections } from "@/lib/lecture-help";
import { PageHeader } from "@/components/app-shell/app-shell";
import { LectureHelpForm } from "./lecture-help-form";
import { LectureHelpTable } from "./lecture-help-table";

export default async function LectureHelpPage() {
  const user = await requireUser();

  const [slots, allTas] = await Promise.all([
    prisma.lectureHelpSlot.findMany({
      orderBy: [{ courseInfo: "asc" }, { dayOfWeek: "asc" }],
      include: { signups: { include: { user: { select: { id: true, name: true } } } } },
    }),
    prisma.user.findMany({
      where: { role: "UTA" },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const sections = groupLectureHelpSections(slots);

  const myAssignmentCount = slots.reduce(
    (sum, slot) => sum + (slot.signups.some((s) => s.user.id === user.id) ? 1 : 0),
    0,
  );
  const effectiveQuota = computeEffectiveQuota(user.weeklyQuota, myAssignmentCount);

  return (
    <>
      <PageHeader title="Lecture Help Schedule" />

      {user.weeklyQuota != null && (
        <p className="mb-6 text-sm text-text-muted">
          You&apos;re on <span className="font-medium text-text">{myAssignmentCount}</span> lecture-help
          section{myAssignmentCount === 1 ? "" : "s"}, which brings your office-hours quota from{" "}
          <span className="font-medium text-text">{user.weeklyQuota}h</span> down to{" "}
          <span className="font-medium text-text">{effectiveQuota}h</span>.
        </p>
      )}

      {user.role === "PROFESSOR" && (
        <div className="mb-6">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
            Add a section
          </h2>
          <LectureHelpForm />
        </div>
      )}

      <LectureHelpTable
        sections={sections}
        currentUserId={user.id}
        isProfessor={user.role === "PROFESSOR"}
        allTas={allTas}
      />
    </>
  );
}
