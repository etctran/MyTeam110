/**
 * Pure date arithmetic — deliberately has no "server-only" import (unlike
 * weeks.ts) so both server code (actions.ts) and the client-side schedule
 * grid can compute the same "has this shift already happened" answer.
 */

/**
 * The exact instant a shift starts — derived, not stored: Week.weekStartDate
 * (a real, unique calendar date) plus Shift.dayOfWeek/startTime is already
 * everything needed, so there's no separate "date" column to add or keep in
 * sync.
 *
 * Same UTC convention as weekStartDate itself, for the same reason: a fixed,
 * unambiguous instant regardless of server/viewer timezone. That does mean
 * "11:00" here means 11:00 UTC, not 11am at whatever timezone the campus is
 * actually in — fine for now, but worth revisiting if this ever needs to
 * line up with a specific real-world local time (e.g. US Eastern).
 */
export function shiftStartsAt(weekStartDate: Date, dayOfWeek: number, startTime: string): Date {
  const [hour] = startTime.split(":").map(Number);
  return new Date(
    Date.UTC(
      weekStartDate.getUTCFullYear(),
      weekStartDate.getUTCMonth(),
      weekStartDate.getUTCDate() + dayOfWeek,
      hour,
    ),
  );
}

/** Has this shift's start time already passed? TAs can't move into or out
 * of a shift once it's begun — see moveToOpenShift/requestSwap. */
export function hasShiftStarted(weekStartDate: Date, dayOfWeek: number, startTime: string): boolean {
  return shiftStartsAt(weekStartDate, dayOfWeek, startTime).getTime() <= Date.now();
}
