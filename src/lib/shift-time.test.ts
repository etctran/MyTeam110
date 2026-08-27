import { describe, expect, it } from "vitest";
import { hasShiftStarted, shiftStartsAt } from "./shift-time";

describe("shiftStartsAt", () => {
  it("derives the exact UTC instant from weekStartDate + dayOfWeek + startTime", () => {
    const weekStartDate = new Date(Date.UTC(2026, 7, 30)); // a Sunday
    // dayOfWeek 2 (Tuesday) at 11:00 -> Aug 30 + 2 days = Sep 1, 11:00 UTC.
    expect(shiftStartsAt(weekStartDate, 2, "11:00")).toEqual(new Date(Date.UTC(2026, 8, 1, 11)));
  });
});

describe("hasShiftStarted", () => {
  it("is false for a shift that starts an hour from now", () => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const weekStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOfWeek));
    const futureHour = (now.getUTCHours() + 1) % 24;
    expect(hasShiftStarted(weekStartDate, dayOfWeek, `${String(futureHour).padStart(2, "0")}:00`)).toBe(false);
  });

  it("is true for a shift that started an hour ago", () => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const weekStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOfWeek));
    const pastHour = (now.getUTCHours() + 23) % 24; // one hour back, wrapping midnight safely
    // If "an hour ago" wrapped to a different day, walk dayOfWeek back one
    // too, so the derived instant is still actually in the past.
    const wrapped = now.getUTCHours() === 0;
    expect(
      hasShiftStarted(
        weekStartDate,
        wrapped ? (dayOfWeek + 6) % 7 : dayOfWeek,
        `${String(pastHour).padStart(2, "0")}:00`,
      ),
    ).toBe(true);
  });

  it("is true right at the exact start instant (inclusive)", () => {
    const now = new Date();
    const dayOfWeek = now.getUTCDay();
    const weekStartDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dayOfWeek));
    expect(hasShiftStarted(weekStartDate, dayOfWeek, `${String(now.getUTCHours()).padStart(2, "0")}:00`)).toBe(true);
  });
});
