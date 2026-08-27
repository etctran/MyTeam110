// Precise timing: full-reload TTFB for each page (cold-ish vs warm),
// plus first-click-immediately-after-login (before prefetch settles).
import { chromium } from "@playwright/test";

const BASE = "https://my-team110.vercel.app";

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "prof1@test.dev");
  await page.fill('input[name="password"]', "password123");
  const t0 = Date.now();
  await Promise.all([
    page.waitForURL(`${BASE}/professor`, { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  return Date.now() - t0;
}

console.log("=== TEST A: full-reload TTFB per page, 6x each, fresh cookies each time ===");
{
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);

  const pages = ["/professor", "/uta/schedule", "/uta/lecture-help", "/notifications", "/profile"];
  for (const path of pages) {
    const samples = [];
    for (let i = 0; i < 4; i++) {
      const start = Date.now();
      const resp = await page.goto(`${BASE}${path}`, { waitUntil: "commit" });
      const ttfb = Date.now() - start;
      samples.push({ ttfb, vercelId: resp.headers()["x-vercel-id"] });
      await page.waitForTimeout(150);
    }
    console.log(path, JSON.stringify(samples));
  }
  await browser.close();
}

console.log("\n=== TEST B: click a sidebar tab IMMEDIATELY after login redirect (no settle wait) ===");
{
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const loginMs = await login(page);
  console.log("login->/professor:", loginMs, "ms");

  // No waitForTimeout here -- click as fast as a real impatient user would.
  const clickStart = Date.now();
  await page.click('a[href="/uta/schedule"]');
  // Wait for content that's unique to the schedule page to actually show up.
  await page.waitForSelector('text=/Office Hours|Schedule/i', { timeout: 15000 }).catch(() => {});
  const clickElapsed = Date.now() - clickStart;
  console.log("click Office Hours Schedule (immediately post-login) -> content visible:", clickElapsed, "ms");
  await browser.close();
}

console.log("\n=== TEST C: click a sidebar tab AFTER letting prefetch fully settle (2s) ===");
{
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();
  await login(page);
  await page.waitForTimeout(2000);

  const clickStart = Date.now();
  await page.click('a[href="/uta/schedule"]');
  await page.waitForSelector('text=/Office Hours|Schedule/i', { timeout: 15000 }).catch(() => {});
  const clickElapsed = Date.now() - clickStart;
  console.log("click Office Hours Schedule (after 2s settle) -> content visible:", clickElapsed, "ms");
  await browser.close();
}
