// Correct click-latency measurement: time from click to the *matching*
// RSC network response actually completing (not a text selector that
// might match persistent chrome, not a networkidle heuristic).
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

// Let the initial background prefetch burst fully settle.
await page.waitForTimeout(2500);

async function clickAndTimeRealResponse(path, selector) {
  const start = Date.now();
  const respPromise = page.waitForResponse(
    (r) => r.url().includes(path) && r.url().includes("_rsc="),
    { timeout: 15000 },
  );
  await page.click(selector);
  const resp = await respPromise.catch((e) => null);
  const elapsed = Date.now() - start;
  if (!resp) {
    console.log(`  ${path}: NO matching RSC response observed within timeout (elapsed ${elapsed}ms) -- may have been served from client cache with zero network`);
    return null;
  }
  const timing = resp.request().timing();
  console.log(
    `  ${path}: click->response ${elapsed}ms | status=${resp.status()} vercel-id=${resp.headers()["x-vercel-id"]} cache=${resp.headers()["x-vercel-cache"]}`,
  );
  return elapsed;
}

console.log("=== round-trip per click, alternating tabs, 6 rounds ===");
for (let i = 0; i < 6; i++) {
  console.log(`round ${i + 1}`);
  await clickAndTimeRealResponse("/uta/schedule", 'a[href="/uta/schedule"]');
  await page.waitForTimeout(400);
  await clickAndTimeRealResponse("/professor", 'a[href="/professor"]');
  await page.waitForTimeout(400);
}

console.log("\n=== now simulate a user who reads a page for 35s (> dynamic staleTime) before switching ===");
await page.waitForTimeout(35000);
await clickAndTimeRealResponse("/uta/schedule", 'a[href="/uta/schedule"]');

await browser.close();
