// Raw-stream verification, no browser rendering noise: log in via Playwright
// just to get real cookies, then issue the RSC navigation request directly
// with fetch and read the response body chunk-by-chunk, timestamping when
// the "shell" text (page title) vs the "data" text (Week of / grid) actually
// arrive on the wire. This is what actually determines whether Suspense is
// streaming, independent of browser paint/hydration timing.
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
await page.waitForTimeout(1500);

const cookies = await context.cookies();
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
await browser.close();

async function streamTiming(label, url) {
  const t0 = Date.now();
  const resp = await fetch(url, {
    headers: {
      cookie: cookieHeader,
      rsc: "1",
      accept: "text/x-component",
    },
  });
  console.log(`\n=== ${label} (status ${resp.status}, vercel-id=${resp.headers.get("x-vercel-id")}) ===`);
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  let chunkN = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunkN++;
    const text = decoder.decode(value, { stream: true });
    full += text;
    console.log(`  chunk ${chunkN} @ ${Date.now() - t0}ms, ${value.length} bytes`);
  }
  console.log(`  total: ${chunkN} chunks, ${full.length} chars, ${Date.now() - t0}ms`);
  const shellIdx = full.indexOf("Office Hours Schedule");
  const dataIdx = full.search(/Week of|shiftsById|dayOfWeek/);
  console.log(`  "Office Hours Schedule" found at char offset: ${shellIdx}`);
  console.log(`  data marker found at char offset: ${dataIdx}`);
}

// Run twice: once fresh, once again for a warmer comparison.
await streamTiming("run 1", `${BASE}/uta/schedule?_rsc=verify1`);
await new Promise((r) => setTimeout(r, 500));
await streamTiming("run 2", `${BASE}/uta/schedule?_rsc=verify2`);
