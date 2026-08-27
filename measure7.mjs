// Verifies the Suspense split actually streams: does the page title
// ("Office Hours Schedule") become visible in the DOM BEFORE the
// data-dependent content (the schedule grid) does? If Suspense is working,
// there should be a real gap between the two. If it's not actually
// streaming (e.g. still blocking on the whole tree), both appear at once.
import { chromium } from "@playwright/test";

const BASE = "https://my-team110.vercel.app";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "prof1@test.dev");
await page.fill('input[name="password"]', "password123");
await Promise.all([
  page.waitForURL(`${BASE}/professor`, { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(2000);

const t0 = Date.now();
await page.click('a[href="/uta/schedule"]');

const titleTime = await page
  .waitForSelector('h1:has-text("Office Hours Schedule")', { timeout: 15000 })
  .then(() => Date.now() - t0)
  .catch(() => null);

const gridTime = await page
  .waitForSelector('text=/Week of/i', { timeout: 15000 })
  .then(() => Date.now() - t0)
  .catch(() => null);

console.log("title (shell) visible at:", titleTime, "ms");
console.log("'Week of ...' (data-dependent) visible at:", gridTime, "ms");
console.log("gap:", gridTime !== null && titleTime !== null ? gridTime - titleTime : "n/a", "ms");

await browser.close();
