import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The week that's currently open for lecture-help sign-ups and (later)
 * auto-generation — the upcoming Sunday-start week, per §8's cron
 * ("weekStartDate = next Sunday"). If today *is* Sunday, that's this week.
 *
 * Computed in UTC deliberately, not local server time: `weekStartDate` is
 * a `@unique` column, so it must resolve to the exact same instant every
 * time regardless of the server's local timezone/DST — using
 * getDay()/setHours() here previously let the same calendar Sunday hash
 * to two different Date instants (midnight local vs. midnight UTC),
 * silently creating a duplicate `Week` row.
 *
 * There's no scheduling-generation flow yet (Phase 6), so nothing else
 * creates `Week` rows — this is the one place that does, get-or-create,
 * so posting lecture-help slots doesn't need to wait on that phase.
 */
export async function getOrCreateUpcomingWeek() {
  const now = new Date();
  const daysUntilSunday = (7 - now.getUTCDay()) % 7;
  const weekStartDate = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysUntilSunday),
  );

  return prisma.week.upsert({
    where: { weekStartDate },
    update: {},
    create: { weekStartDate, status: "DRAFT" },
  });
}
