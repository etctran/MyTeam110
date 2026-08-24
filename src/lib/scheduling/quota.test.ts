import { describe, expect, it } from "vitest";
import { computeEffectiveQuota } from "./quota";

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

  it("treats one lecture-help assignment as exactly one dropped office hour", () => {
    // A ten-hour TA (quota 8) with one fixed lecture-help section-day
    // does 7 office hours, regardless of how long that section runs.
    expect(computeEffectiveQuota(8, 1)).toBe(7);
  });
});
