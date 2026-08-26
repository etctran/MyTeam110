import "server-only";
import { prisma } from "@/lib/prisma";

/**
 * The week that's currently open for lecture-help sign-ups and schedule
 * generation — the upcoming Sunday-start week. If today *is* Sunday,
 * that's this week.
 *
 * Computed in UTC deliberately, not local server time: `weekStartDate` is
 * a `@unique` column, so it must resolve to the exact same instant every
 * time regardless of the server's local timezone/DST — using
 * getDay()/setHours() here previously let the same calendar Sunday hash
 * to two different Date instants (midnight local vs. midnight UTC),
 * silently creating a duplicate `Week` row.
 *
 * Get-or-create so callers never need to coordinate on who creates the
 * `Week` row first.
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
