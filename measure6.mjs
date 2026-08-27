// Cold-start test: this script is invoked after a long idle period (via a
// shell `sleep` before `node measure6.mjs`, run in the background) so the
// Vercel function container has plausibly been recycled. Measures the
// FIRST request's TTFB (login page itself, which is static/edge-cached, is
// skipped for this purpose -- go straight to an authenticated, DB-backed
// RSC navigation) then several immediate follow-ups to compare cold vs warm.
import { chromium } from "@playwright/test";

const BASE = "https://my-team110.vercel.app";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

console.log("=== cold(ish) login, timing each step ===");
const tGotoLogin = Date.now();
await page.goto(`${BASE}/login`, { waitUntil: "commit" });
console.log("goto /login (commit):", Date.now() - tGotoLogin, "ms");
await page.waitForLoadState("networkidle");

await page.fill('input[name="email"]', "prof1@test.dev");
await page.fill('input[name="password"]', "password123");

const t0 = Date.now();
const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/login") && r.request().method() === "POST").catch(() => null),
  page.click('button[type="submit"]'),
]);
await page.waitForURL(`${BASE}/professor`, { timeout: 30000 });
const loginElapsed = Date.now() - t0;
console.log("login submit -> /professor loaded:", loginElapsed, "ms  (this is the FIRST real serverless invocation post-idle: proxy + login server action + dal + queries)");

// Now the first SIDEBAR CLICK post-login, before any prefetch could have
// meaningfully warmed a *different* route's function instance.
const clickStart = Date.now();
const rscResp = await page.waitForResponse(
  (r) => r.url().includes("/uta/schedule") && r.url().includes("_rsc="),
  { timeout: 20000 },
).catch(() => null);
await page.click('a[href="/uta/schedule"]');
const firstClick = rscResp ? Date.now() - clickStart : null;
console.log("FIRST click -> /uta/schedule response:", firstClick, "ms", rscResp ? `vercel-id=${rscResp.headers()["x-vercel-id"]}` : "(no match)");

await page.waitForTimeout(500);

// Immediate follow-up clicks: same functions, now definitely warm.
async function clickAndTime(path, selector) {
  const start = Date.now();
  const respPromise = page.waitForResponse((r) => r.url().includes(path) && r.url().includes("_rsc="), { timeout: 15000 });
  await page.click(selector);
  const resp = await respPromise.catch(() => null);
  const elapsed = Date.now() - start;
  console.log(`  warm re-click ${path}: ${elapsed}ms`, resp ? `vercel-id=${resp.headers()["x-vercel-id"]}` : "(no match)");
}

for (let i = 0; i < 4; i++) {
  await clickAndTime("/professor", 'a[href="/professor"]');
  await page.waitForTimeout(300);
  await clickAndTime("/uta/schedule", 'a[href="/uta/schedule"]');
  await page.waitForTimeout(300);
}

await browser.close();
