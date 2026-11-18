import { expect, test } from "@playwright/test";
import { unknownCard } from "../src/shared/library.ts";
import type { Deck } from "../src/shared/types.ts";
const deck = (id: string, name: string, main: number[] = []): Deck => ({ id, name, main, extra: [], side: [], created_at: "2026-11-17T00:00:00Z", updated_at: "2026-11-17T00:00:00Z" });

test("stars persist and work with search and sort", async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem("ygo.decks.v1")) localStorage.setItem("ygo.decks.v1", JSON.stringify([
      { id: "a", name: "Alpha", main: [], extra: [], side: [], created_at: "", updated_at: "" },
      { id: "z", name: "Zeta", main: [], extra: [], side: [], created_at: "", updated_at: "" },
    ]));
  });
  await page.goto("/decks");
  await page.getByRole("button", { name: "Star Alpha", exact: true }).click();
  await expect(page.getByRole("button", { name: "Unstar Alpha", exact: true })).toBeEnabled();
  await expect(page.locator(".deck-item").first()).toContainText("Alpha");
  await page.reload();
  await expect(page.getByRole("button", { name: "Unstar Alpha", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".deck-item").first()).toContainText("Alpha");
  await page.getByRole("button", { name: "★ Starred only" }).click();
  await expect(page.locator(".deck-item")).toHaveCount(1);
  await expect(page.locator(".deck-item")).toContainText("Alpha");
  await page.getByRole("searchbox", { name: "Search decks" }).fill("missing");
  await expect(page.getByText("No decks match your filters.")).toBeVisible();
});

test("deck opens with Genesys points, checks exclusions, and remembers format", async ({ page }) => {
  const d = deck("points", "Points", [14558127, 14558127, 42]);
  d.extra = [43]; d.side = [14558127];
  await page.addInitScript((d) => localStorage.setItem("ygo.decks.v1", JSON.stringify([d])), d);
  await page.route("**/api/cards/lookup", async (route) => {
    const ids: number[] = route.request().postDataJSON().ids;
    await route.fulfill({ json: { cards: ids.map((id) => ({ ...unknownCard(id), category: "Monster", name: id === 14558127 ? "Ash Blossom & Joyous Spring" : id === 43 ? "Baronne de Fleur" : "Test Link", type: id === 42 ? "Link Monster" : id === 43 ? "Synchro Monster" : "Effect Monster" })), alias: Object.fromEntries(ids.map((id) => [id, id])), missing: [] } });
  });
  await page.goto("/decks/points");
  await expect(page.getByRole("combobox", { name: "Deck format" })).toHaveValue("genesys");
  await expect(page.getByText("104 / 100 points", { exact: true })).toBeVisible();
  await expect(page.locator(".db-problems")).toContainText("Link and Pendulum monsters are not allowed");
  await expect(page.locator(".db-problems")).toContainText("standard cap 100");
  await expect(page.locator(".db-card-points").first()).toHaveText("18 pts");
  await page.getByRole("combobox", { name: "Deck format" }).selectOption("tcg");
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Deck format" })).toHaveValue("tcg");
  await expect(page.locator(".db-points")).toHaveCount(0);
});

test("library renders a batch before the next arrives and virtualizes grid and list", async ({ page }) => {
  const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
  await page.addInitScript((d) => localStorage.setItem("ygo.decks.v1", JSON.stringify([d])), deck("large", "Large", ids));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/cards/lookup", async (route) => {
    const ids: number[] = route.request().postDataJSON().ids;
    if (ids[0] === 501) await gate;
    await route.fulfill({ json: { cards: ids.map((id) => ({ ...unknownCard(id), name: `Card ${String(id).padStart(4, "0")}`, type: "Normal Monster", category: "Monster" })), alias: Object.fromEntries(ids.map((id) => [id, id])), missing: [] } });
  });
  await page.goto("/library");
  await expect(page.locator(".lib-sub")).toContainText("500 cards");
  await expect(page.getByRole("status")).toContainText("500 / 1,200");
  expect(await page.locator(".lib-grid-row .lib-tile").count()).toBeLessThan(100);
  release();
  await expect(page.locator(".lib-sub")).toContainText("1,200 cards");
  await page.getByRole("button", { name: "List", exact: true }).click();
  expect(await page.locator(".lib-list-row").count()).toBeLessThan(100);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(".lib-list-row").filter({ hasText: "Card 1200" })).toBeVisible();
  await page.getByRole("combobox", { name: "Deck format" }).selectOption("tcg");
  await expect(page.getByRole("columnheader", { name: "Points", exact: true })).toHaveCount(0);
});

test("account saves and bulk imports retain deck stars", async ({ request, baseURL }) => {
  test.skip(!baseURL || !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname), "Creates a disposable account only on local dev servers");
  const headers = { Origin: new URL(baseURL!).origin };
  const register = await request.post("/api/auth/register", { headers, data: { username: `lib_${Date.now()}`, password: "local-library-test-42" } });
  expect(register.ok()).toBe(true);
  const cookie = register.headers()["set-cookie"].split(";")[0];
  const auth = { ...headers, Cookie: cookie };
  const decks = Array.from({ length: 15 }, (_, i) => ({ ...deck(`bulk-${i}`, `Bulk ${i}`, [14558127]), starred: i % 2 === 0 }));
  const bulk = await request.post("/api/decks/bulk", { headers: auth, data: { decks } });
  expect(bulk.ok()).toBe(true);
  const listed = (await (await request.get("/api/decks", { headers: auth })).json()).decks;
  expect(listed).toHaveLength(15);
  for (const d of decks) expect(listed.find((x: Deck) => x.id === d.id)).toMatchObject({ starred: d.starred });
  const changed = { ...decks[0], starred: false };
  expect((await request.put(`/api/decks/${changed.id}`, { headers: auth, data: changed })).ok()).toBe(true);
  const saved = await (await request.get(`/api/decks/${changed.id}`, { headers: auth })).json();
  expect(saved.deck).toMatchObject({ starred: false, main: [14558127] });
  // An old deck with neither field still saves and reads as false.
  const legacy = deck("legacy", "Legacy");
  expect((await request.put("/api/decks/legacy", { headers: auth, data: legacy })).ok()).toBe(true);
  expect((await (await request.get("/api/decks/legacy", { headers: auth })).json()).deck).toMatchObject({ starred: false });
});
