import { Megaphone } from "lucide-react";
import { ALL_HANDS_DAY_OF_WEEK, ALL_HANDS_HOURS, formatHour } from "@/lib/operating-hours";

/**
 * A persistent banner reminding everyone about the Thursday all-hands —
 * no DB automation needed, just a computed reminder. Computed
 * server-side (no client JS needed) — this renders fresh on every
 * request, so "today" is always accurate.
 */
export function AllHandsBanner() {
  if (new Date().getDay() !== ALL_HANDS_DAY_OF_WEEK) return null;

  return (
    <div className="announcement-card mb-8 flex items-start gap-4 p-5">
      <Megaphone size={20} className="mt-0.5 shrink-0 text-accent" strokeWidth={2} />
      <div>
        <p className="font-semibold text-text">All-hands meeting today</p>
        <p className="mt-1 text-sm text-text-muted">
          {formatHour(ALL_HANDS_HOURS.start)}–{formatHour(ALL_HANDS_HOURS.end)}. No office hours are
          scheduled during this hour — see you there.
        </p>
      </div>
    </div>
  );
}
