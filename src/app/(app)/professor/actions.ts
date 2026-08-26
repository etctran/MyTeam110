"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/dal";
import { runScheduleGeneration } from "@/lib/scheduling/run-generation";

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
