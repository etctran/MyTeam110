import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./constants";
import { loginAs } from "./helpers";
import { runDb } from "./run-db";

test.describe("availability", () => {
  test.afterAll(async () => {
    runDb("clear-availability", { email: E2E_USERS.ta1.email });
  });

  test("painting cells and saving persists a contiguous window after reload", async ({ page }) => {
    await loginAs(page, E2E_USERS.ta1.email);
    await page.goto("/uta/availability", { waitUntil: "networkidle" });
    await page.waitForTimeout(300); // let client hydration settle before the drag

    // Drag Mon 11AM through Mon 1PM (3 contiguous hours).
    const start = page.locator('button[aria-label="Mon 11AM"]');
    const end = page.locator('button[aria-label="Mon 1PM"]');
    const startBox = await start.boundingBox();
    const endBox = await end.boundingBox();
    if (!startBox || !endBox) throw new Error("grid cells not found");

    await page.mouse.move(startBox.x + startBox.width / 2, startBox.y + startBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(endBox.x + endBox.width / 2, endBox.y + endBox.height / 2, { steps: 5 });
    await page.mouse.up();

    // Sanity-check the drag actually selected something before saving —
    // makes a real drag failure fail loudly here instead of showing up as
    // a confusing mismatch after reload.
    await expect(page.locator('button[aria-label="Mon 12PM"]')).toHaveAttribute("aria-pressed", "true");

    await page.click('button:has-text("Save availability")');
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 5000 });

    const persisted = runDb<{ dayOfWeek: number; startTime: string; endTime: string }[]>("get-availability", {
      email: E2E_USERS.ta1.email,
    });
    expect(persisted, "availability row should exist immediately after save, before reload").toHaveLength(1);

    await page.reload({ waitUntil: "networkidle" });
    for (const label of ["Mon 11AM", "Mon 12PM", "Mon 1PM"]) {
      await expect(page.locator(`button[aria-label="${label}"]`)).toHaveAttribute("aria-pressed", "true");
    }

    const rows = runDb<{ dayOfWeek: number; startTime: string; endTime: string }[]>("get-availability", {
      email: E2E_USERS.ta1.email,
    });
    expect(rows).toHaveLength(1); // one contiguous row, not three scattered ones
    expect(rows[0]).toMatchObject({ dayOfWeek: 1, startTime: "11:00", endTime: "14:00" });
  });
});
