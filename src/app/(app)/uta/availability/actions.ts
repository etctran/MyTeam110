"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/dal";
import { prisma } from "@/lib/prisma";
import { formatTime, isOperatingHour, type DayOfWeek } from "@/lib/operating-hours";

export type AvailabilityCell = { day: number; hour: number };

/** Contiguous runs of consecutive hours, e.g. [11,12,13,15,16] -> [[11,14],[15,17]) (end exclusive). */
function toContiguousRuns(hours: number[]): Array<[number, number]> {
  const sorted = [...hours].sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    runs.push([sorted[i], sorted[j] + 1]);
    i = j + 1;
  }
  return runs;
}

/**
 * Replaces the current user's entire Availability set with the given
 * selection. Each selected day's hours are collapsed into contiguous
 * windows — one Availability row per run — so every row this produces is
 * already the single-contiguous-block unit the scheduling algorithm (§6)
 * assumes.
 */
export async function saveAvailability(cells: AvailabilityCell[]) {
  const user = await requireUser();

  const byDay = new Map<number, number[]>();
  for (const cell of cells) {
    if (!isOperatingHour(cell.day as DayOfWeek, cell.hour)) continue; // ignore out-of-bounds cells defensively
    const hours = byDay.get(cell.day) ?? [];
    hours.push(cell.hour);
    byDay.set(cell.day, hours);
  }

  const rows: { dayOfWeek: number; startTime: string; endTime: string }[] = [];
  for (const [day, hours] of byDay) {
    for (const [start, end] of toContiguousRuns(hours)) {
      rows.push({ dayOfWeek: day, startTime: formatTime(start), endTime: formatTime(end) });
    }
  }

  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { userId: user.id } }),
    ...(rows.length
      ? [prisma.availability.createMany({ data: rows.map((r) => ({ ...r, userId: user.id })) })]
      : []),
  ]);

  revalidatePath("/uta/availability");
  return { windowCount: rows.length };
}
