"use client";

import { useSyncExternalStore } from "react";
import { Megaphone } from "lucide-react";
import { ALL_HANDS_DAY_OF_WEEK, ALL_HANDS_HOURS, formatHour } from "@/lib/operating-hours";

// No real external store to subscribe to — this value never changes
// again after mount, so subscribe is a no-op.
const noopSubscribe = () => () => {};

/**
 * A persistent banner reminding everyone about the Thursday all-hands —
 * no DB automation needed, just a computed reminder.
 *
 * Client-side deliberately: "is it Thursday" has to mean Thursday for
 * the person looking at the screen, not for the server. Vercel runs
 * functions in UTC, so a Server Component's `new Date().getDay()` would
 * flip to Thursday several hours before it's actually Thursday in any
 * US timezone. useSyncExternalStore's getServerSnapshot lets SSR render
 * "not today" up front (no flash of wrong content) while the real check
 * still runs against the viewer's own device clock, with no hydration
 * mismatch either way.
 */
export function AllHandsBanner() {
  const isAllHandsDay = useSyncExternalStore(
    noopSubscribe,
    () => new Date().getDay() === ALL_HANDS_DAY_OF_WEEK,
    () => false,
  );

  if (!isAllHandsDay) return null;

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
