import { test, expect } from "@playwright/test";
import { E2E_USERS } from "./constants";
import { loginAs } from "./helpers";

test.describe("auth and role routing", () => {
  test("an unauthenticated visitor is redirected to /login", async ({ page }) => {
    await page.goto("/uta/schedule");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a UTA logs in and lands on their own tab, but is bounced from /professor", async ({ page }) => {
    await loginAs(page, E2E_USERS.ta1.email);
    await expect(page).toHaveURL(/\/uta/);
    await expect(page.getByText(E2E_USERS.ta1.name)).toBeVisible();

    await page.goto("/professor");
    await expect(page).toHaveURL(/\/uta/); // proxy.ts bounces UTAs back out
  });

  test("a professor lands on the Dashboard and can also reach the shared UTA tabs", async ({ page }) => {
    await loginAs(page, E2E_USERS.professor.email);
    await expect(page).toHaveURL(/\/professor$/);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    await page.goto("/uta/schedule");
    await expect(page).toHaveURL(/\/uta\/schedule$/); // not bounced
  });

  test("signing out returns to /login and blocks the previous route again", async ({ page }) => {
    await loginAs(page, E2E_USERS.ta1.email);
    await page.click('button[aria-label="Sign out"]');
    await expect(page).toHaveURL(/\/login$/);

    await page.goto("/uta/schedule");
    await expect(page).toHaveURL(/\/login$/);
  });
});
