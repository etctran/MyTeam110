/**
 * Operating hours. Kept as a constants file (not hardcoded in the UI) so
 * a professor could move this to a config table later without touching
 * any component that imports it.
 *
 * dayOfWeek: 0=Sun ... 6=Sat, matching the Availability model. Saturday has
 * no operating hours at all, so it's simply absent here.
 */
export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5;

export const OPERATING_DAYS: DayOfWeek[] = [0, 1, 2, 3, 4, 5]; // Sun..Fri

export const DAY_LABELS: Record<DayOfWeek, string> = {
  0: "Sun",
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
};

// Hour is the *start* of a one-hour block, e.g. 11 means "11:00–12:00".
export const OPERATING_HOURS: Record<DayOfWeek, { start: number; end: number }> = {
  0: { start: 13, end: 17 }, // Sun 13:00–17:00
  1: { start: 11, end: 19 }, // Mon 11:00–19:00
  2: { start: 11, end: 19 }, // Tue
  3: { start: 11, end: 19 }, // Wed
  4: { start: 11, end: 17 }, // Thu 11:00–17:00
  5: { start: 11, end: 17 }, // Fri
};

// All-hands: recurring reminder, not a schedulable slot. Thursday's own
// operating window already ends at 17:00 (above), so this never overlaps
// a real office-hours cell — it's purely informational (the banner in
// app-shell.tsx).
export const ALL_HANDS_DAY_OF_WEEK: DayOfWeek = 4;
export const ALL_HANDS_HOURS = { start: 17, end: 18 };

// Full span across all days, for laying out grid rows.
export const GRID_START_HOUR = Math.min(...Object.values(OPERATING_HOURS).map((d) => d.start));
export const GRID_END_HOUR = Math.max(...Object.values(OPERATING_HOURS).map((d) => d.end));

export function isOperatingHour(day: DayOfWeek, hour: number) {
  const { start, end } = OPERATING_HOURS[day];
  return hour >= start && hour < end;
}

export function formatHour(hour: number) {
  const h = hour % 24;
  const period = h < 12 ? "AM" : "PM";
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${period}`;
}

export function formatTime(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** "14:00" -> "2:00 PM". Unlike formatHour, keeps minutes — lecture-help
 * slots aren't whole-hour aligned the way office-hours grid cells are. */
export function formatTimeOfDay(time: string) {
  const [h, m] = time.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const displayHour = h % 12 === 0 ? 12 : h % 12;
  return `${displayHour}:${String(m).padStart(2, "0")} ${period}`;
}
