import { test, expect } from "@playwright/test";
import { E2E_PREFIX, E2E_USERS } from "./constants";
import { loginAs } from "./helpers";

const SECTION_NAME = `${E2E_PREFIX}Section`;

test.describe("lecture help — fixed roster", () => {
  test("professor creates a section, a TA joins and leaves it, quota reflects the change", async ({
    browser,
  }) => {
    const profCtx = await browser.newContext();
    const profPage = await profCtx.newPage();
    await loginAs(profPage, E2E_USERS.professor.email);
    await profPage.goto("/professor", { waitUntil: "networkidle" });

    await profPage.fill("#courseInfo", SECTION_NAME);
    await profPage.fill("#instructors", "E2E Instructor");
    await profPage.fill("#location", "E2E Room");
    await profPage.fill("#startTime", "10:00");
    await profPage.fill("#endTime", "10:50");
    await profPage.fill("#capacity", "2");
    // Leave only Monday checked (the form's default) — one day is enough.
    await profPage.click('button:has-text("Create section")');
    await expect(profPage.getByText(SECTION_NAME)).toBeVisible({ timeout: 5000 });
    await profCtx.close();

    // ta3 (FIVE_HOUR, quota 4) joins, then leaves.
    const ta3Ctx = await browser.newContext();
    const ta3Page = await ta3Ctx.newPage();
    await loginAs(ta3Page, E2E_USERS.ta3.email);
    await ta3Page.goto("/uta/lecture-help", { waitUntil: "networkidle" });

    const sectionRow = ta3Page.locator("tr", { hasText: SECTION_NAME });
    await sectionRow.getByText("+ Join").click();
    await ta3Page.waitForTimeout(500);
    await expect(ta3Page.getByText(/brings your office-hours quota from 4h down to 3h/)).toBeVisible();

    await sectionRow.getByRole("button", { name: `Remove ${E2E_USERS.ta3.name}` }).click();
    await ta3Page.waitForTimeout(500);
    await expect(ta3Page.getByText(/brings your office-hours quota from 4h down to 4h/)).toBeVisible();

    await ta3Ctx.close();
  });
});
