/**
 * effectiveQuota logic — §6:
 *   lectureHelpHours = sum(hours from that User's LectureHelpSignups for this Week)
 *   effectiveQuota   = max(0, weeklyQuota - lectureHelpHours)
 *
 * Kept as a pure, standalone function per the Build Order (§9 Phase 4:
 * "quota reduction logic implemented and unit-tested on its own") so the
 * auto-scheduling algorithm (Phase 6) and the UI can both call the same
 * tested logic instead of re-deriving it.
 */
export function computeEffectiveQuota(
  weeklyQuota: number | null | undefined,
  lectureHelpHours: number,
): number {
  const quota = weeklyQuota ?? 0;
  return Math.max(0, quota - lectureHelpHours);
}

/**
 * Duration of a "HH:MM"–"HH:MM" slot, in whole hours. LectureHelpSignup.hours
 * is an Int (§3), so a slot that isn't an exact multiple of 60 minutes (e.g.
 * a 50-minute lecture) is rounded to the nearest hour, minimum 1 — there's
 * no finer-grained unit for quota math in this schema.
 */
export function slotDurationHours(startTime: string, endTime: string): number {
  const toMinutes = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  const minutes = toMinutes(endTime) - toMinutes(startTime);
  return Math.max(1, Math.round(minutes / 60));
}
