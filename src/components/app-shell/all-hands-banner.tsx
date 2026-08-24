import { ALL_HANDS_DAY_OF_WEEK, ALL_HANDS_HOURS, formatHour } from "@/lib/operating-hours";

/**
 * §8: "All-hands reminder: simple recurring notification job, or just a
 * persistent banner on the dashboard every Thursday — doesn't need its
 * own DB automation, can be a client-side computed reminder." Computed
 * server-side instead (same effect, no client JS needed) — this renders
 * fresh on every request, so "today" is always accurate.
 */
export function AllHandsBanner() {
  if (new Date().getDay() !== ALL_HANDS_DAY_OF_WEEK) return null;

  return (
    <div className="border-b border-border bg-accent/10 px-10 py-2 text-sm text-accent">
      All-hands meeting today, {formatHour(ALL_HANDS_HOURS.start)}–{formatHour(ALL_HANDS_HOURS.end)} —
      no office hours are scheduled during this hour.
    </div>
  );
}
