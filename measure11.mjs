import { chromium } from "@playwright/test";

const BASE = "https://my-team110.vercel.app";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "ta1@test.dev");
await page.fill('input[name="password"]', "password123");
await Promise.all([
  page.waitForURL(`${BASE}/uta/**`, { timeout: 30000 }),
  page.click('button[type="submit"]'),
]);
await page.waitForTimeout(1000);

for (let i = 1; i <= 4; i++) {
  await page.goto(`${BASE}/uta/lecture-help`, { waitUntil: "networkidle" }); // bounce off schedule first
  await page.waitForTimeout(1500);

  let reqStart = null;
  let respEnd = null;
  const onReq = (req) => {
    if (req.url().includes("/uta/schedule") && !req.url().includes("lecture-help")) {
      reqStart = reqStart ?? Date.now();
    }
  };
  const onResp = async (resp) => {
    if (resp.url().includes("/uta/schedule") && !resp.url().includes("lecture-help")) {
      respEnd = Date.now();
    }
  };
  page.on("request", onReq);
  page.on("response", onResp);

  const t0 = Date.now();
  await page.click('a[href="/uta/schedule"]');
  await page.waitForFunction(() => document.querySelector("[data-diag-timings]"), { timeout: 20000 });
  const total = Date.now() - t0;
  const timings = await page.$eval("[data-diag-timings]", (el) => el.getAttribute("data-diag-timings"));
  page.off("request", onReq);
  page.off("response", onResp);
  console.log(
    `run ${i}: total ${total}ms | net(req->resp) ${respEnd && reqStart ? respEnd - reqStart : "n/a"}ms | resp-at ${respEnd ? respEnd - t0 : "n/a"}ms after click | ${timings}`,
  );
}

await browser.close();
