// Diagnostic: play a long demo duel against the local dev server (to watch the dev server's memory).
//   node scripts/long-demo.mjs [seconds]
import { chromium } from "@playwright/test";

const secs = Number(process.argv[2] ?? 120);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
let msgs = 0, bytes = 0;
page.on("websocket", (ws) => ws.on("framesent", (f) => { msgs++; bytes += typeof f.payload === "string" ? f.payload.length : f.payload.byteLength; }));
await page.goto("http://localhost:8788/lobby");
const name = page.getByPlaceholder(/e\.g\./i);
await name.or(page.getByText(/Dueling as/)).first().waitFor();
if (await name.isVisible()) { await name.fill("mem-test"); await page.getByRole("button", { name: /Continue as guest/ }).click(); await page.getByText(/Dueling as/).waitFor(); }
await page.getByRole("button", { name: /Watch a demo duel/ }).click();
await page.waitForURL(/\/duel\//);
await page.locator(".duel-field").waitFor({ timeout: 30_000 });
// fastest autopilot
const speed = page.getByLabel("Demo speed");
if (await speed.count()) await speed.selectOption({ index: (await speed.locator("option").count()) - 1 });
const end = Date.now() + secs * 1000;
while (Date.now() < end) {
  await page.waitForTimeout(5000);
  // a finished duel: rematch to keep it going
  const re = page.getByRole("button", { name: /^Rematch$|Accept rematch/ });
  if (await re.count()) await re.first().click().catch(() => undefined);
}
console.log(JSON.stringify({ sentMessages: msgs, sentMB: +(bytes / 1e6).toFixed(1) }));
await browser.close();
