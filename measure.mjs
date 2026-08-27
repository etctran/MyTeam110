// Real-measurement script against the deployed site.
// Logs in as prof1@test.dev, then repeatedly clicks sidebar tabs,
// recording navigation timing + response headers for each RSC request.
import { chromium } from "@playwright/test";

const BASE = "https://my-team110.vercel.app";

const results = [];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

page.on("response", (res) => {
  const url = res.url();
  if (!url.startsWith(BASE)) return;
  const headers = res.headers();
  // Only log document/RSC navigation-ish requests, skip static assets.
  if (url.includes("/_next/static") || url.includes("/_next/image")) return;
  results.push({
    t: Date.now(),
    url: url.replace(BASE, ""),
    status: res.status(),
    vercelId: headers["x-vercel-id"] || "",
    vercelCache: headers["x-vercel-cache"] || "",
    rscHeader: headers["rsc"] ?? headers["next-router-state-tree"] ?? "",
  });
});

console.log("=== Logging in ===");
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "prof1@test.dev");
await page.fill('input[name="password"]', "password123");

const t0 = Date.now();
await Promise.all([
  page.waitForURL(`${BASE}/professor`, { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
console.log("login -> /professor took", Date.now() - t0, "ms");

// Let initial prefetches settle.
await page.waitForTimeout(1500);
console.log("background responses observed after initial load:", results.length);
for (const r of results) console.log(" ", r.url, r.status, r.vercelId);
results.length = 0;

async function clickAndTime(label, selector) {
  const start = Date.now();
  await page.click(selector);
  await page.waitForLoadState("networkidle");
  const elapsed = Date.now() - start;
  console.log(`[click] ${label}: ${elapsed}ms (perceived, incl. networkidle settle)`);
  return elapsed;
}

const timings = { schedule: [], professor: [], notifications: [] };

for (let i = 0; i < 5; i++) {
  console.log(`\n=== round ${i + 1} ===`);
  timings.schedule.push(await clickAndTime("-> Your Office Hours Schedule", 'a[href="/uta/schedule"]').catch(() => null));
  await page.waitForTimeout(300);
  timings.professor.push(await clickAndTime("-> Dashboard/professor", 'a[href="/professor"]').catch(() => null));
  await page.waitForTimeout(300);
}

console.log("\n=== raw click->networkidle timings (ms) ===");
console.log(JSON.stringify(timings, null, 2));

console.log("\n=== all captured responses (last round) ===");
for (const r of results.slice(-20)) console.log(" ", r.url, r.status, r.vercelId, r.vercelCache);

await browser.close();
