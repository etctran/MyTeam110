import "server-only";
import { prisma } from "@/lib/prisma";
import { getOrCreateUpcomingWeek } from "@/lib/weeks";
import { generateSchedule, type AvailabilityWindow, type SchedulingUser } from "@/lib/scheduling/generate";
import { formatTime } from "@/lib/operating-hours";
import { notify } from "@/lib/notifications";
import { broadcast, notificationsChannel, SCHEDULE_CHANNEL } from "@/lib/realtime";

/**
 * The DB-touching half of "Generate": pulls real availability/quota data,
 * runs the standalone scheduling algorithm, and persists the result —
 * shared by the professor's "Generate schedule" button and the Thursday
 * 5pm cron job, since both need to do exactly the same thing, just
 * triggered differently and authorized differently.
 *
 * `excludeProfessorId` skips notifying whoever just clicked the button
 * themselves; the cron job (no acting user) omits it, so every professor
 * gets the "ready for review" notification.
 */
export async function runScheduleGeneration(excludeProfessorId?: string) {
  const week = await getOrCreateUpcomingWeek();

  const [tas, availabilityRows, signups, professors] = await Promise.all([
    prisma.user.findMany({
      where: { role: "UTA" },
      select: { id: true, weeklyQuota: true, isReturning: true },
    }),
    prisma.availability.findMany(),
    // Lecture help is a standing roster now, not tied to a Week — every
    // assigned section-day counts against a TA's quota every week alike.
    prisma.lectureHelpSignup.findMany({
      select: { userId: true, hours: true },
    }),
    prisma.user.findMany({ where: { role: "PROFESSOR" }, select: { id: true } }),
  ]);

  const lectureHelpHoursByUser = new Map<string, number>();
  for (const signup of signups) {
    lectureHelpHoursByUser.set(
      signup.userId,
      (lectureHelpHoursByUser.get(signup.userId) ?? 0) + signup.hours,
    );
  }

  const schedulingUsers: SchedulingUser[] = tas.map((ta) => ({
    id: ta.id,
    weeklyQuota: ta.weeklyQuota ?? 0,
    lectureHelpHours: lectureHelpHoursByUser.get(ta.id) ?? 0,
    isReturning: ta.isReturning,
  }));

  const availability: AvailabilityWindow[] = availabilityRows.map((row) => ({
    userId: row.userId,
    dayOfWeek: row.dayOfWeek,
    startHour: Number(row.startTime.split(":")[0]),
    endHour: Number(row.endTime.split(":")[0]),
  }));

  const generated = generateSchedule(schedulingUsers, availability);
  const needsAttentionCount = generated.filter((s) => s.needsAttention).length;
  const needsLeadCount = generated.filter((s) => s.needsLead).length;

  await prisma.$transaction(async (tx) => {
    const existingShifts = await tx.shift.findMany({ where: { weekId: week.id }, select: { id: true } });
    const existingShiftIds = existingShifts.map((s) => s.id);
    if (existingShiftIds.length > 0) {
      await tx.shiftAssignment.deleteMany({ where: { shiftId: { in: existingShiftIds } } });
      await tx.shift.deleteMany({ where: { id: { in: existingShiftIds } } });
    }

    for (const result of generated) {
      const shift = await tx.shift.create({
        data: {
          weekId: week.id,
          dayOfWeek: result.dayOfWeek,
          startTime: formatTime(result.hour),
          endTime: formatTime(result.hour + 1),
          minTas: 3,
          maxTas: 6,
        },
      });

      if (result.assignedUserIds.length > 0) {
        await tx.shiftAssignment.createMany({
          data: result.assignedUserIds.map((userId) => ({
            shiftId: shift.id,
            userId,
            isLead: userId === result.leadUserId,
          })),
        });
      }
    }

    await tx.week.update({ where: { id: week.id }, data: { generatedAt: new Date() } });

    const flags: string[] = [];
    if (needsAttentionCount > 0) {
      flags.push(`${needsAttentionCount} shift${needsAttentionCount === 1 ? "" : "s"} need attention`);
    }
    if (needsLeadCount > 0) {
      flags.push(`${needsLeadCount} shift${needsLeadCount === 1 ? "" : "s"} missing a lead`);
    }

    for (const professor of professors) {
      if (professor.id === excludeProfessorId) continue;
      await notify(tx, {
        userId: professor.id,
        type: "SCHEDULE_PUBLISHED",
        message:
          flags.length > 0
            ? `Schedule generated for the week of ${week.weekStartDate.toLocaleDateString()} — ${flags.join(", ")}.`
            : `Schedule generated for the week of ${week.weekStartDate.toLocaleDateString()} — every shift meets its minimum and has a lead.`,
      });
    }
  });

  await broadcast(SCHEDULE_CHANNEL);
  await Promise.all(
    professors
      .filter((p) => p.id !== excludeProfessorId)
      .map((p) => broadcast(notificationsChannel(p.id))),
  );

  return { weekStartDate: week.weekStartDate, shiftCount: generated.length, needsAttentionCount, needsLeadCount };
}
