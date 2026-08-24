import type { Page } from "@playwright/test";
import { E2E_PASSWORD } from "./constants";

export async function loginAs(page: Page, email: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.fill("#email", email);
  await page.fill("#password", E2E_PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 10_000 });
  await page.waitForLoadState("networkidle");
}
