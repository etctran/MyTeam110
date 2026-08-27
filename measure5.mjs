// Compare body CONTENT of a background-prefetch response vs a real
// click-triggered response for the same route, to see whether prefetch
// actually delivers full page data or just a loading shell.
import { chromium } from "@playwright/test";

const BASE = "https://my-team110.vercel.app";
let prefetchBody = null;
let prefetchWave = 0;

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

page.on("response", async (res) => {
  const url = res.url();
  if (!url.startsWith(BASE + "/uta/schedule") || !url.includes("_rsc=")) return;
  prefetchWave++;
  try {
    const body = await res.text();
    console.log(`\n--- prefetch wave ${prefetchWave} for /uta/schedule (${body.length} chars) ---`);
    console.log(body.slice(0, 600));
    if (prefetchWave === 2) prefetchBody = body;
  } catch (e) {
    console.log("body read failed:", e.message);
  }
});

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "prof1@test.dev");
await page.fill('input[name="password"]', "password123");
await Promise.all([
  page.waitForURL(`${BASE}/professor`, { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(2500);

console.log("\n\n=== now doing a REAL click navigation to /uta/schedule ===");
const respPromise = page.waitForResponse(
  (r) => r.url().includes("/uta/schedule") && r.url().includes("_rsc="),
);
await page.click('a[href="/uta/schedule"]');
const resp = await respPromise;
const clickBody = await resp.text();
console.log(`--- click-triggered response for /uta/schedule (${clickBody.length} chars) ---`);
console.log(clickBody.slice(0, 600));

await browser.close();
