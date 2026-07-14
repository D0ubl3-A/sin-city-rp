import { expect, test } from "@playwright/test";

const DEAL_OFFER = "$500 if you bring me a dirt bike";
const RETURNED_DEAL_STATUSES = new Set(["completed", "delivered", "returned"]);

function gameState(page) {
  return page.evaluate(() => JSON.parse(window.render_game_to_text()));
}

function vehicleTypeCount(state, type) {
  const vehicleTypes = state?.world?.vehicleTypes;
  expect(Array.isArray(vehicleTypes), "render_game_to_text().world.vehicleTypes must list every live vehicle type").toBe(true);
  return vehicleTypes.filter((candidate) => candidate === type).length;
}

async function startAtLocalNpc(page, { persistence = false } = {}) {
  const runtimeErrors = [];
  page.on("pageerror", (error) => runtimeErrors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(`console.error: ${message.text()}`);
  });

  const url = persistence ? "/?test=1&persist=1&fresh=1" : "/?test=1&fresh=1";
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (
    window.__gameReady === true
    && typeof window.render_game_to_text === "function"
    && typeof window.advanceTime === "function"
    && typeof window.__SIN_CITY_TEST__?.teleportToNpc === "function"
  ), undefined, { timeout: 60_000 });
  await page.locator("#start-button").click();
  await expect.poll(() => gameState(page)).toMatchObject({ phase: "playing" });

  const teleported = await page.evaluate(() => window.__SIN_CITY_TEST__.teleportToNpc("local"));
  expect(teleported, "the deterministic test hook must find the Vegas Local NPC").toBe(true);
  await page.keyboard.press("KeyE");
  await expect(page.locator("#dialogue-panel")).toBeVisible();
  await expect(page.locator("#dialogue-input")).toBeFocused();
  return runtimeErrors;
}

async function submitDialogue(page, text) {
  const input = page.locator("#dialogue-input");
  await input.fill(text);
  await input.press("Enter");
  await expect(page.locator("#dialogue-history")).toContainText(text);
}

test.describe("spoken-language NPC deals", () => {
  test("a confirmed $500 dirt-bike offer creates and physically completes an NPC errand", async ({ page }) => {
    const runtimeErrors = await startAtLocalNpc(page);
    const beforeOffer = await gameState(page);
    const cashBefore = beforeOffer.player.cash;
    const dirtBikesBefore = vehicleTypeCount(beforeOffer, "dirtBike");
    expect(cashBefore).toBeGreaterThanOrEqual(500);

    await submitDialogue(page, DEAL_OFFER);

    const confirm = page.locator("#dialogue-options [data-deal-confirm]");
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(/\$500/);
    expect((await gameState(page)).player.cash, "proposing a deal must not transfer money").toBe(cashBefore);

    await confirm.click();

    const confirmed = await gameState(page);
    expect(confirmed.player.cash, "confirmation transfers exactly the offered amount").toBe(cashBefore - 500);
    expect(confirmed.dialogue.activeDeal).toMatchObject({
      task: {
        type: "fetch_item",
        itemId: "dirtBike",
      },
      paymentAmount: 500,
    });
    expect(["active", "departing"], "the confirmed errand must begin before it can complete").toContain(confirmed.dialogue.activeDeal.status);

    // Dialogue pauses world simulation. Returning to play proves the NPC's body
    // leaves, spends time away, and walks back through the normal AI update loop.
    await page.keyboard.press("Escape");
    await expect.poll(() => gameState(page)).toMatchObject({ phase: "playing" });

    await expect.poll(async () => {
      const state = await page.evaluate(() => JSON.parse(window.advanceTime(1_000)));
      const deal = state.dialogue.activeDeal;
      const dirtBikeCount = Array.isArray(state.world?.vehicleTypes)
        ? state.world.vehicleTypes.filter((type) => type === "dirtBike").length
        : -1;
      return Boolean(
        deal
        && RETURNED_DEAL_STATUSES.has(deal.status)
        && Number.isFinite(deal.npcDistance)
        && deal.npcDistance <= 8
        && dirtBikeCount > dirtBikesBefore
      );
    }, {
      message: "the NPC should physically return near the player with a newly spawned dirt bike",
      timeout: 20_000,
      intervals: [0, 10, 25, 50],
    }).toBe(true);

    const completed = await gameState(page);
    expect(RETURNED_DEAL_STATUSES.has(completed.dialogue.activeDeal.status)).toBe(true);
    expect(completed.dialogue.activeDeal.npcDistance).toBeLessThanOrEqual(8);
    expect(vehicleTypeCount(completed, "dirtBike")).toBeGreaterThan(dirtBikesBefore);
    expect(runtimeErrors).toEqual([]);
  });

  test("an imaginative jetpack request becomes a bounded, named, physical quest item", async ({ page }) => {
    const runtimeErrors = await startAtLocalNpc(page, { persistence: true });
    const beforeRequest = await gameState(page);
    const cashBefore = beforeRequest.player.cash;

    await submitDialogue(page, "find me a jetpack");

    const confirm = page.locator("#dialogue-options [data-deal-confirm]");
    await expect(confirm).toBeVisible();
    await expect(page.locator("#dialogue-options")).toContainText(/jetpack/i);
    const proposed = await gameState(page);
    expect(proposed.player.cash).toBe(cashBefore);
    expect(proposed.dialogue.pendingDeal).toMatchObject({
      intent: "fetch_item",
      task: { itemId: "collectible", requestedLabel: "Jetpack" },
    });
    expect(proposed.dialogue.pendingDeal.amount).toBeGreaterThan(0);

    await confirm.click();
    const confirmed = await gameState(page);
    expect(confirmed.player.cash).toBe(cashBefore - proposed.dialogue.pendingDeal.amount);
    expect(confirmed.dialogue.activeDeal.task).toMatchObject({
      itemId: "collectible",
      requestedLabel: "Jetpack",
    });

    await page.keyboard.press("Escape");
    await expect.poll(async () => {
      const state = await page.evaluate(() => JSON.parse(window.advanceTime(1_000)));
      return Boolean(
        state.dialogue.activeDeal
        && RETURNED_DEAL_STATUSES.has(state.dialogue.activeDeal.status)
        && state.world.pickupLabels.includes("Jetpack")
      );
    }, { timeout: 20_000, intervals: [0, 10, 25, 50] }).toBe(true);

    await page.evaluate(() => window.__SIN_CITY_TEST__.saveNow());
    const persistedBeforeReload = await page.evaluate(() => {
      const envelope = JSON.parse(localStorage.getItem("sin-city-rp-memory:test") || "null");
      return {
        dynamicItems: envelope?.data?.player?.inventory?.dynamicItems || [],
        dynamicPickups: (envelope?.data?.world?.pickups || [])
          .filter((pickup) => pickup.dynamic)
          .map((pickup) => ({ label: pickup.label, requestedLabel: pickup.requestedLabel })),
      };
    });
    expect(
      persistedBeforeReload.dynamicItems.some((item) => item.label === "Jetpack")
        || persistedBeforeReload.dynamicPickups.some((item) => item.label === "Jetpack" || item.requestedLabel === "Jetpack"),
      `saved envelope lost the custom item: ${JSON.stringify(persistedBeforeReload)}`,
    ).toBe(true);
    await page.goto("/?test=1&persist=1", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => window.__gameReady === true && typeof window.__SIN_CITY_TEST__?.snapshot === "function",
      undefined,
      { timeout: 60_000 },
    );
    await page.locator("#start-button").click();
    await expect.poll(() => gameState(page)).toMatchObject({ phase: "playing" });
    const reloaded = await gameState(page);
    const carriedLabels = (reloaded.player.inventory.dynamicItems || []).map((item) => item.label);
    const persistedAfterReload = await page.evaluate(() => {
      const envelope = JSON.parse(localStorage.getItem("sin-city-rp-memory:test") || "null");
      return {
        dynamicItems: envelope?.data?.player?.inventory?.dynamicItems || [],
        dynamicPickups: (envelope?.data?.world?.pickups || [])
          .filter((pickup) => pickup.dynamic)
          .map((pickup) => ({ label: pickup.label, requestedLabel: pickup.requestedLabel })),
      };
    });
    expect(
      reloaded.world.pickupLabels.includes("Jetpack") || carriedLabels.includes("Jetpack"),
      `reload lost the custom item: ${JSON.stringify({ persistedBeforeReload, persistedAfterReload, carriedLabels })}`,
    ).toBe(true);

    expect(runtimeErrors).toEqual([]);
  });
});
