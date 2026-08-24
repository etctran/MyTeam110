import { describe, expect, it } from "vitest";
import { computeEffectiveQuota, slotDurationHours } from "./quota";

describe("computeEffectiveQuota", () => {
  it("subtracts lecture-help hours from the weekly quota", () => {
    expect(computeEffectiveQuota(8, 3)).toBe(5);
  });

  it("returns the full quota when no lecture-help hours are logged", () => {
    expect(computeEffectiveQuota(4, 0)).toBe(4);
  });

  it("clamps at 0 instead of going negative", () => {
    expect(computeEffectiveQuota(4, 6)).toBe(0);
  });

  it("clamps exactly at the boundary", () => {
    expect(computeEffectiveQuota(4, 4)).toBe(0);
  });

  it("treats a null weeklyQuota as 0 (e.g. a professor account)", () => {
    expect(computeEffectiveQuota(null, 0)).toBe(0);
    expect(computeEffectiveQuota(undefined, 2)).toBe(0);
  });

  it("handles a ten-hour TA with heavy lecture-help load", () => {
    expect(computeEffectiveQuota(8, 8)).toBe(0);
    expect(computeEffectiveQuota(8, 5)).toBe(3);
  });
});

describe("slotDurationHours", () => {
  it("computes a whole-hour slot exactly", () => {
    expect(slotDurationHours("10:00", "11:00")).toBe(1);
    expect(slotDurationHours("10:00", "12:00")).toBe(2);
  });

  it("rounds a non-whole-hour lecture to the nearest hour", () => {
    expect(slotDurationHours("10:00", "10:50")).toBe(1); // 50min -> rounds to 1
    expect(slotDurationHours("10:00", "10:20")).toBe(1); // 20min rounds to 0, floored to the 1hr minimum
  });

  it("never returns less than 1 hour, even for a very short slot", () => {
    expect(slotDurationHours("10:00", "10:05")).toBe(1);
  });

  it("rounds a slot close to 1.5 hours up to 2", () => {
    expect(slotDurationHours("10:00", "11:35")).toBe(2);
  });
});
