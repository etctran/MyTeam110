/**
 * effectiveQuota logic — §6:
 *   lectureHelpHours = sum(hours from that User's LectureHelpSignups)
 *   effectiveQuota   = max(0, weeklyQuota - lectureHelpHours)
 *
 * lectureHelpHours is a flat count of assigned section-days, not a
 * duration: one lecture-help assignment always drops exactly one
 * office-hour slot, regardless of how long that section's period runs
 * (see LectureHelpSignup.hours, always created as 1).
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
