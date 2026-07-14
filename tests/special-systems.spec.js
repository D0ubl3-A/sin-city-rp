import { expect, test } from "@playwright/test";

test.describe.configure({ timeout: 60_000 });

function parseState(value) {
  if (typeof value === "string") return JSON.parse(value);
  if (value && typeof value === "object") return value;
  throw new Error("render_game_to_text() did not return JSON state");
}

async function snapshot(page) {
  return parseState(await page.evaluate(() => window.render_game_to_text()));
}

async function advance(page, milliseconds) {
  await page.evaluate((ms) => window.advanceTime(ms), milliseconds);
}

async function useHelper(page, name, ...args) {
  return page.evaluate(({ helperName, helperArgs }) => {
    const helper = window.__SIN_CITY_TEST__?.[helperName];
    if (typeof helper !== "function") throw new Error(`Missing __SIN_CITY_TEST__.${helperName}()`);
    return helper(...helperArgs);
  }, { helperName: name, helperArgs: args });
}

function captureBrowserErrors(page) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const location = message.location();
    const source = location.url ? ` (${location.url}:${location.lineNumber ?? 0})` : "";
    errors.push(`console.error${source}: ${message.text()}`);
  });
  return errors;
}

async function bootPlayingGame(page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?test=1&fresh=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() =>
    window.__gameReady === true
    && typeof window.advanceTime === "function"
    && typeof window.render_game_to_text === "function"
    && typeof window.__SIN_CITY_TEST__?.snapshot === "function",
  );
  await expect(page.locator("#loading-screen")).toBeHidden();
  await expect(page.locator("#start-screen")).toBeVisible();

  await page.keyboard.press("Enter");
  await expect(page.locator("#start-screen")).toBeHidden();
  await expect(page.locator("#hud")).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).phase).toBe("playing");
}

async function captureSystemScreenshot(page, testInfo, name) {
  await page.screenshot({ path: testInfo.outputPath(`${name}.png`), animations: "disabled" });
}

test("opens the casino with E and applies a real slot wager", async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await bootPlayingGame(page);

  await expect(useHelper(page, "teleport", "casino")).resolves.toBe(true);
  await page.keyboard.press("KeyE");
  await expect(page.locator("#casino-panel")).toBeVisible();
  await expect.poll(async () => (await snapshot(page)).phase).toBe("casino");

  await page.locator('[data-bet="25"]').click();
  let currentCash = (await snapshot(page)).player.cash;
  let wagerChangedCash = false;

  for (let spin = 0; spin < 6 && !wagerChangedCash; spin += 1) {
    await page.locator("#spin-button").click();
    await expect(page.locator("#spin-button")).toBeEnabled();
    const afterSpin = await snapshot(page);
    wagerChangedCash = afterSpin.player.cash !== currentCash;
    currentCash = afterSpin.player.cash;
  }

  expect(wagerChangedCash, "six settled slot wagers all left cash unchanged").toBe(true);
  await expect(page.locator("#slots-result")).not.toHaveText(/need \$\d+ to spin/i);
  await captureSystemScreenshot(page, testInfo, "casino-slots");
  expect(errors).toEqual([]);
});

test("teleports to the wash, enters with E, and renders the storm drains", async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await bootPlayingGame(page);

  await expect(useHelper(page, "teleport", "tunnelEntrance")).resolves.toBe(true);
  await page.keyboard.press("KeyE");
  await advance(page, 100);

  const tunnel = await snapshot(page);
  expect(tunnel.phase).toBe("playing");
  expect(tunnel.zone).toBe("storm-drains");
  expect(tunnel.player.y).toBeLessThan(0);
  await expect(page.locator("#zone-name")).toHaveText(/FLOOD CHANNEL 17/i);
  await expect(page.locator("#game-canvas")).toBeVisible();
  const canvasSize = await page.locator("#game-canvas").evaluate((canvas) => ({
    width: canvas.width,
    height: canvas.height,
  }));
  expect(canvasSize.width).toBeGreaterThan(100);
  expect(canvasSize.height).toBeGreaterThan(100);

  await captureSystemScreenshot(page, testInfo, "storm-drains");
  expect(errors).toEqual([]);
});

test("enters a plane with F and takes off with real flight controls", async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await bootPlayingGame(page);

  await expect(useHelper(page, "teleportToVehicle", "plane")).resolves.toBe(true);
  await page.keyboard.press("KeyF");
  let flight = await snapshot(page);
  expect(flight.player.mode).toBe("plane");
  expect(flight.vehicle).not.toBeNull();

  await page.keyboard.down("KeyW");
  await page.keyboard.down("Space");
  try {
    for (let step = 0; step < 30 && !(flight.vehicle?.airborne && flight.vehicle?.speed > 31); step += 1) {
      await advance(page, 500);
      flight = await snapshot(page);
    }
  } finally {
    await page.keyboard.up("Space");
    await page.keyboard.up("KeyW");
  }

  expect(flight.vehicle?.speed, "plane never accelerated to takeoff speed").toBeGreaterThan(31);
  expect(flight.vehicle?.airborne, "plane never became airborne while pitched up").toBe(true);
  expect(flight.player.mode).toBe("plane");
  await captureSystemScreenshot(page, testInfo, "plane-airborne");
  expect(errors).toEqual([]);
});

test("adding 62 heat creates a three-star police response", async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await bootPlayingGame(page);

  await useHelper(page, "addHeat", 62, "Automated pursuit test");
  await advance(page, 16);
  const response = await snapshot(page);

  expect(response.player.heat).toBeGreaterThanOrEqual(62);
  expect(response.player.wanted).toBeGreaterThanOrEqual(3);
  expect(response.world.cops).toBeGreaterThanOrEqual(5);
  await expect(page.locator("#wanted .active")).toHaveCount(response.player.wanted);
  await expect(page.locator("#wanted-label")).toContainText(/ACTIVE BOLO/i);

  await captureSystemScreenshot(page, testInfo, "police-response");
  expect(errors).toEqual([]);
});
