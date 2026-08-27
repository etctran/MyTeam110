// Does the sidebar's background prefetch burst actually hit the DB (full
// dynamic render), or just fetch the cheap loading.tsx shell (since Next 16
// narrows Link prefetch to "layout -> first loading boundary" for dynamic
// routes with a loading.js)? Compare prefetch-burst response timing/size
// against a real click-triggered full render.
import { chromium } from "@playwright/test";

const BASE = "https://my-team110.vercel.app";
const prefetchLog = [];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

page.on("response", async (res) => {
  const url = res.url();
  if (!url.startsWith(BASE) || url.includes("/_next/static")) return;
  if (!url.includes("_rsc=")) return;
  let len = res.headers()["content-length"];
  if (len === undefined) {
    try {
      const body = await res.body();
      len = String(body.length);
    } catch {
      len = "n/a";
    }
  }
  const timing = res.request().timing();
  prefetchLog.push({
    url: url.replace(BASE, ""),
    status: res.status(),
    contentLength: len,
    responseEndMs: timing ? Math.round(timing.responseEnd) : null,
  });
});

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "prof1@test.dev");
await page.fill('input[name="password"]', "password123");
const loginStart = Date.now();
await Promise.all([
  page.waitForURL(`${BASE}/professor`, { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
console.log("logged in, watching background prefetch burst for 3s...");
await page.waitForTimeout(3000);

console.log(`\n=== ${prefetchLog.length} prefetch-related RSC responses captured ===`);
for (const r of prefetchLog) {
  console.log(`  ${r.url}  status=${r.status}  bytes=${r.contentLength}`);
}

await browser.close();
