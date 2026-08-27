// Real-browser reproduction: log in once, then click through the sidebar
// tabs repeatedly (not just once), timing click -> next paint/content for
// EACH click. This is what the user actually experiences, unlike a raw
// fetch() to the RSC endpoint (which showed ~300ms warm). If every click
// is slow here too, the bottleneck isn't server rendering.
import { chromium } from "@playwright/test";

const BASE = "https://my-team110.vercel.app";
const TABS = [
  "/uta/schedule",
  "/uta/lecture-help",
  "/uta/availability",
  "/profile",
];

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

page.on("console", (msg) => console.log("  [console]", msg.text()));

let lastVercelId = null;
page.on("response", (resp) => {
  const id = resp.headers()["x-vercel-id"];
  if (id) lastVercelId = id;
});

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "ta1@test.dev");
await page.fill('input[name="password"]', "password123");
await Promise.all([
  page.waitForURL(`${BASE}/uta/**`, { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(1500);

for (let round = 1; round <= 3; round++) {
  console.log(`\n--- round ${round} ---`);
  for (const href of TABS) {
    const t0 = Date.now();
    await page.click(`a[href="${href}"]`);
    // Shell paint: header text becomes visible.
    const shellTime = await page
      .waitForSelector("h1", { timeout: 20000 })
      .then(() => Date.now() - t0)
      .catch(() => null);
    // Data resolved: the shared "Loading…" fallback text is gone.
    const dataTime = await page
      .waitForFunction(() => !document.body.innerText.includes("Loading…"), {
        timeout: 20000,
      })
      .then(() => Date.now() - t0)
      .catch(() => null);
    console.log(
      `  click -> ${href}: shell ${shellTime}ms, data-settled ${dataTime}ms, vercel-id=${lastVercelId}`,
    );
    await page.waitForTimeout(4000); // mimic a human pause between clicks, not rapid-fire
  }
}

await browser.close();
