// Browser smoke test: the real app in a real browser. Plays a demo duel at a few window sizes and checks what
// unit tests can't see: no page errors, the field draws, the duel scales as one piece (no sideways scroll,
// the LP plates clear of the field), the log fills in, the summon lab's effects run. Saves screenshots.
//
//   local:  npm run dev (wrangler dev on :8788), then  npm run e2e
//   CI:     after each deploy, against the live site (BASE_URL)
import { expect, test, type Page } from "@playwright/test";

const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1366, height: 768 },
  { width: 800, height: 600 },
];

async function asGuest(page: Page) {
  await page.goto("/lobby");
  // the lobby asks for a name, or already shows who you are
  const name = page.getByPlaceholder(/e\.g\./i), me = page.getByText(/Dueling as/);
  await expect(name.or(me)).toBeVisible({ timeout: 15_000 });
  if (await name.isVisible()) {
    await name.fill("smoke-test");
    await page.getByRole("button", { name: /Continue as guest/ }).click();
    await expect(me).toBeVisible({ timeout: 15_000 });
  }
}

test.describe("duel", () => {
  for (const size of SIZES) {
    test(`demo duel at ${size.width}x${size.height}`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.setViewportSize(size);
      await asGuest(page);
      await page.getByRole("button", { name: /Watch a demo duel/ }).click();
      await page.waitForURL(/\/duel\//);
      // the board
      await expect(page.locator(".duel-field")).toBeVisible({ timeout: 30_000 });
      await expect(page.locator(".duel-page.is-live")).toBeVisible();
      // it plays: the log fills in
      await expect.poll(async () => page.locator(".dl-line").count(), { timeout: 30_000 }).toBeGreaterThan(4);
      // desktop sizes are the scaled full layout: no sideways scroll, the LP plates don't sit on the field
      const scaled = await page.locator(".duel-page.is-scaled").count();
      expect(scaled).toBe(1);
      const scrollX = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(scrollX).toBeLessThanOrEqual(1);
      const overlap = await page.evaluate(() => {
        // the zones and piles themselves (the field's box includes its padding): a plate over one is a layout bug
        const zones = [...document.querySelectorAll(".duel-field .duel-zone, .duel-field .duel-pile")].map((z) => z.getBoundingClientRect());
        const plates = [...document.querySelectorAll(".duel-plate")].map((p) => p.getBoundingClientRect());
        // tilted zones are parallelograms inside their boxes: only an overlap of real size (both ways > 24px) counts
        const hit = (a: DOMRect, b: DOMRect) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 24 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 24;
        return plates.some((p) => zones.some((z) => hit(p, z)));
      });
      expect(overlap).toBe(false);
      await page.waitForTimeout(4000);
      await page.screenshot({ path: info.outputPath(`duel-${size.width}x${size.height}.png`) });
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});

test("summon lab effects run", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/dev/summons");
  for (const name of ["Synchro Summon", "Xyz Summon", "Trap Card"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect.poll(async () => page.locator(".lab-layer .sfx").count(), { timeout: 5_000 }).toBeGreaterThan(0);
  }
  await page.screenshot({ path: info.outputPath("summon-lab.png") });
  expect(errors, errors.join("\n")).toEqual([]);
});
