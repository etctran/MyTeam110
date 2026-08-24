import { describe, expect, it } from "vitest";
import { generateSchedule, type AvailabilityWindow, type SchedulingUser } from "./generate";

function user(id: string, weeklyQuota: number, opts: Partial<SchedulingUser> = {}): SchedulingUser {
  return { id, weeklyQuota, lectureHelpHours: 0, isSenior: false, ...opts };
}

function window(userId: string, dayOfWeek: number, startHour: number, endHour: number): AvailabilityWindow {
  return { userId, dayOfWeek, startHour, endHour };
}

function shiftAt(shifts: ReturnType<typeof generateSchedule>, day: number, hour: number) {
  const shift = shifts.find((s) => s.dayOfWeek === day && s.hour === hour);
  if (!shift) throw new Error(`no shift generated for day ${day} hour ${hour}`);
  return shift;
}

describe("generateSchedule", () => {
  it("caps a session at the user's remaining quota, leaving the window's unused tail unstaffed", () => {
    const shifts = generateSchedule(
      [user("A", 2)],
      [window("A", 1, 9, 13)], // 4hr window, only 2hrs of quota
      { operatingDays: [1], operatingHours: { 1: { start: 9, end: 13 } }, minTas: 1, maxTas: 7 },
    );

    expect(shiftAt(shifts, 1, 9).assignedUserIds).toEqual(["A"]);
    expect(shiftAt(shifts, 1, 10).assignedUserIds).toEqual(["A"]);
    expect(shiftAt(shifts, 1, 11).assignedUserIds).toEqual([]);
    expect(shiftAt(shifts, 1, 11).needsAttention).toBe(true);
    expect(shiftAt(shifts, 1, 12).assignedUserIds).toEqual([]);
  });

  it("prioritizes the TA further from their quota, and both TAs can share the same hours", () => {
    // B has more remainingQuota (4 vs 2) so is placed first regardless of window length.
    const shifts = generateSchedule(
      [user("A", 2), user("B", 4)],
      [window("A", 1, 9, 13), window("B", 1, 9, 11)],
      { operatingDays: [1], operatingHours: { 1: { start: 9, end: 13 } }, minTas: 1, maxTas: 7 },
    );

    expect(shiftAt(shifts, 1, 9).assignedUserIds).toEqual(["A", "B"]);
    expect(shiftAt(shifts, 1, 10).assignedUserIds).toEqual(["A", "B"]);
    // A's quota (2) is exhausted by hour 10, even though their window covers 11/12 too.
    expect(shiftAt(shifts, 1, 11).assignedUserIds).toEqual([]);
    expect(shiftAt(shifts, 1, 11).needsAttention).toBe(true);
  });

  it("never creates a gap: a second same-day window is deferred, then reconnected only via a genuine edge-extend", () => {
    // A has two separate, adjacent windows the same day (9-10 and 10-11). Pass 1
    // must not use the second one directly (the key-rule safeguard), but Pass 2's
    // edge-extend should still pick it up at hour 10 since it's truly available
    // there and adjacent to the block Pass 1 already made — result: one
    // unbroken 9-11 block, not two, and never a scattered assignment.
    const shifts = generateSchedule(
      [user("A", 5)],
      [window("A", 1, 9, 10), window("A", 1, 10, 11)],
      { operatingDays: [1], operatingHours: { 1: { start: 9, end: 11 } }, minTas: 1, maxTas: 7 },
    );

    expect(shiftAt(shifts, 1, 9).assignedUserIds).toEqual(["A"]);
    expect(shiftAt(shifts, 1, 10).assignedUserIds).toEqual(["A"]);
    expect(shiftAt(shifts, 1, 9).needsAttention).toBe(false);
    expect(shiftAt(shifts, 1, 10).needsAttention).toBe(false);
  });

  it("trims from the edge when headcount exceeds the max, picking whoever has the most slack", () => {
    // All three land on the same single-hour shift. B has the least remaining
    // need (smallest remainingQuota) after Pass 1, so B is the one trimmed.
    const shifts = generateSchedule(
      [user("A", 5), user("B", 1), user("C", 3)],
      [window("A", 1, 9, 10), window("B", 1, 9, 10), window("C", 1, 9, 10)],
      { operatingDays: [1], operatingHours: { 1: { start: 9, end: 10 } }, minTas: 1, maxTas: 2 },
    );

    expect(shiftAt(shifts, 1, 9).assignedUserIds).toEqual(["A", "C"]);
  });

  it("round-robins the lead badge among assigned seniors across shifts", () => {
    const shifts = generateSchedule(
      [user("S1", 5, { isSenior: true }), user("S2", 5, { isSenior: true })],
      [window("S1", 1, 9, 11), window("S2", 1, 9, 11)],
      { operatingDays: [1], operatingHours: { 1: { start: 9, end: 11 } }, minTas: 1, maxTas: 7 },
    );

    expect(shiftAt(shifts, 1, 9).leadUserId).toBe("S1");
    expect(shiftAt(shifts, 1, 10).leadUserId).toBe("S2");
  });

  it("leaves leadUserId null when no assigned TA is senior", () => {
    const shifts = generateSchedule(
      [user("N", 5)],
      [window("N", 2, 9, 10)],
      { operatingDays: [2], operatingHours: { 2: { start: 9, end: 10 } }, minTas: 1, maxTas: 7 },
    );

    expect(shiftAt(shifts, 2, 9).assignedUserIds).toEqual(["N"]);
    expect(shiftAt(shifts, 2, 9).leadUserId).toBeNull();
  });

  it("reduces available office-hours quota by that week's lecture-help hours", () => {
    const shifts = generateSchedule(
      [user("A", 8, { lectureHelpHours: 5 })], // effectiveQuota = 3
      [window("A", 1, 9, 13)],
      { operatingDays: [1], operatingHours: { 1: { start: 9, end: 13 } }, minTas: 1, maxTas: 7 },
    );

    expect(shiftAt(shifts, 1, 9).assignedUserIds).toEqual(["A"]);
    expect(shiftAt(shifts, 1, 10).assignedUserIds).toEqual(["A"]);
    expect(shiftAt(shifts, 1, 11).assignedUserIds).toEqual(["A"]);
    expect(shiftAt(shifts, 1, 12).assignedUserIds).toEqual([]); // quota used up after 3 hours
  });
});
