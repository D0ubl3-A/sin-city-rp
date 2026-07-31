import { expect, test } from "@playwright/test";

async function bootGame(page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?test=1&fresh=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    window.__gameReady === true
    && typeof window.advanceTime === "function"
    && typeof window.render_game_to_text === "function"
    && typeof window.__SIN_CITY_MOVEMENT_RESCUE__?.getStatus === "function",
  );
  await page.locator("#start-button").click();
  await expect(page.locator("#hud")).toBeVisible();
}

async function gameState(page) {
  return page.evaluate(() => {
    const value = window.render_game_to_text();
    return typeof value === "string" ? JSON.parse(value) : value;
  });
}

function distance(a, b) {
  return Math.hypot(b.player.x - a.player.x, b.player.y - a.player.y, b.player.z - a.player.z);
}

test("movement recovery is armed, avoids false positives, and restores a pinned save", async ({ page }) => {
  await bootGame(page);

  const initialStatus = await page.evaluate(() => window.__SIN_CITY_MOVEMENT_RESCUE__.getStatus());
  expect(initialStatus.armed).toBe(true);
  expect(initialStatus.rescued).toBe(false);

  const beforeMovement = await gameState(page);
  await page.keyboard.down("KeyW");
  await page.evaluate(() => window.advanceTime(800));
  await page.waitForTimeout(800);
  await page.keyboard.up("KeyW");
  const afterMovement = await gameState(page);
  expect(distance(beforeMovement, afterMovement)).toBeGreaterThan(0.05);

  const healthyStatus = await page.evaluate(() => window.__SIN_CITY_MOVEMENT_RESCUE__.getStatus());
  expect(healthyStatus.rescued).toBe(false);
  expect(healthyStatus.failedDirections).toEqual([]);

  await page.keyboard.down("ArrowLeft");
  const cameraKeyStatus = await page.evaluate(() => window.__SIN_CITY_MOVEMENT_RESCUE__.getStatus());
  await page.keyboard.up("ArrowLeft");
  expect(cameraKeyStatus.activeKeys).not.toContain("ArrowLeft");

  const teleported = await page.evaluate(() => window.__SIN_CITY_TEST__.teleport("casino"));
  expect(teleported).toBe(true);
  const awayFromSpawn = await gameState(page);
  expect(Math.hypot(awayFromSpawn.player.x + 7, awayFromSpawn.player.z - 192)).toBeGreaterThan(100);

  const recovery = await page.evaluate(() => ({
    first: window.__SIN_CITY_MOVEMENT_RESCUE__.rescueNow("regression-test"),
    second: window.__SIN_CITY_MOVEMENT_RESCUE__.rescueNow("duplicate-test"),
    status: window.__SIN_CITY_MOVEMENT_RESCUE__.getStatus(),
    dataset: {
      state: document.documentElement.dataset.movementRescue,
      reason: document.documentElement.dataset.movementRescueReason,
    },
  }));
  const restored = await gameState(page);

  expect(recovery.first).toBe(true);
  expect(recovery.second).toBe(false);
  expect(recovery.status.rescued).toBe(true);
  expect(recovery.status.rescueReason).toBe("regression-test");
  expect(recovery.dataset).toEqual({ state: "completed", reason: "regression-test" });
  expect(Math.hypot(restored.player.x + 7, restored.player.z - 192)).toBeLessThan(3);
});
