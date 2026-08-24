import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./constants";
import { loginAs } from "./helpers";
import { runDb } from "./run-db";

// Tue 2PM/3PM — a slot no other spec touches, so this can run in any order.
const DAY = 2;
const HOUR_A = "Tue 2PM";
const HOUR_B = "Tue 3PM";

test.describe("manual schedule management and self-move swap", () => {
  test.beforeAll(async () => {
    // Covers both 2PM and 3PM so ta1 is eligible to move between them.
    runDb("set-availability", { email: E2E_USERS.ta1.email, dayOfWeek: DAY, startTime: "14:00", endTime: "16:00" });
  });

  test.afterAll(async () => {
    runDb("clear-availability", { email: E2E_USERS.ta1.email, dayOfWeek: DAY });
    runDb("cleanup-shifts", { dayOfWeek: DAY, startTimes: ["14:00", "15:00"] });
  });

  test("professor creates two shifts and assigns TAs to one", async ({ page }) => {
    await loginAs(page, E2E_USERS.professor.email);
    await page.goto("/uta/schedule", { waitUntil: "networkidle" });

    for (const label of [HOUR_A, HOUR_B]) {
      await page.click(`button[aria-label="${label}"]`);
      // Min/Max default to 3/6 in the form; drop min to 1 so a 2-person
      // shift already has "room to leave" for the move step below.
      await page.locator(".panel-card").getByLabel("Min TAs").fill("1");
      await page.click('button:has-text("Create shift")');
      await page.waitForTimeout(400);
    }

    await page.click(`button[aria-label="${HOUR_A}"]`);
    for (const key of ["ta1", "ta2"] as const) {
      await page.getByLabel("Assign a TA").selectOption({ label: E2E_USERS[key].name });
      await page.click('.panel-card button:has-text("Assign")');
      await page.waitForTimeout(400);
    }

    await expect(page.locator(`button[aria-label="${HOUR_A}"]`)).toContainText("2/6");
  });

  test("a TA self-moves from an over-minimum shift to an empty one they're available for", async ({ browser }) => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await loginAs(page, E2E_USERS.ta1.email);
    await page.goto("/uta/schedule", { waitUntil: "networkidle" });

    await page.click(`button[aria-label="${HOUR_A}"]`);
    await expect(page.getByText("Move to another shift")).toBeVisible();

    await page.getByLabel("Move to shift").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Move", exact: true }).click();
    await page.waitForTimeout(600);

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator(`button[aria-label="${HOUR_A}"]`)).toContainText("1/6");
    await expect(page.locator(`button[aria-label="${HOUR_B}"]`)).toContainText("1/6");

    await ctx.close();
  });
});
