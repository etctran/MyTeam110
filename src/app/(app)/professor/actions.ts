"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { runScheduleGeneration } from "@/lib/scheduling/run-generation";
import { notify } from "@/lib/notifications";
import { broadcast, notificationsChannel } from "@/lib/realtime";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Wires the scheduling algorithm to real data and persists the result.
 * Re-running this replaces every Shift/ShiftAssignment for the upcoming
 * week — Generate is the primary path; the manual editor is there for
 * filling gaps afterward, not for edits meant to survive a regenerate.
 * The same underlying generation also runs unattended via the Thursday
 * 5pm cron job — see /api/schedule/generate.
 */
export async function generateWeekSchedule(): Promise<ActionResult> {
  const professor = await requireRole("PROFESSOR");

  await runScheduleGeneration(professor.id);

  revalidatePath("/professor");
  revalidatePath("/uta/schedule");
  return { ok: true };
}

export type AnnouncementState = { error: string } | { ok: true } | undefined;

/**
 * Sends one Notification (+ best-effort email) to every current TA — the
 * professor's own account never receives a copy of their own
 * announcement. Fire-and-forget per recipient, same as the rest of the
 * notification system, so one bad email address can't block delivery to
 * everyone else.
 */
export async function sendAnnouncement(
  _prevState: AnnouncementState,
  formData: FormData,
): Promise<AnnouncementState> {
  await requireRole("PROFESSOR");

  const message = formData.get("message");
  if (typeof message !== "string" || !message.trim()) {
    return { error: "Write something to send." };
  }

  const tas = await prisma.user.findMany({ where: { role: "UTA" }, select: { id: true } });

  await Promise.all(
    tas.map(async (ta) => {
      await notify(prisma, { userId: ta.id, type: "ANNOUNCEMENT", message: message.trim() });
      await broadcast(notificationsChannel(ta.id));
    }),
  );

  revalidatePath("/professor");
  return { ok: true };
}
