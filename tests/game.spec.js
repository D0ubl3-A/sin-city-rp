import { expect, test } from "@playwright/test";

function parseGameState(value) {
  if (typeof value === "string") return JSON.parse(value);
  if (value && typeof value === "object") return value;
  throw new Error("render_game_to_text() must return a JSON string or object");
}

async function readGameState(page) {
  return parseGameState(await page.evaluate(() => window.render_game_to_text()));
}

function valueAt(object, path) {
  return path.split(".").reduce((value, key) => value?.[key], object);
}

function firstValueAt(object, paths) {
  for (const path of paths) {
    const value = valueAt(object, path);
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

function asPosition(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const [x, second, third] = value.map(Number);
    const z = Number.isFinite(third) ? third : second;
    if (Number.isFinite(x) && Number.isFinite(z)) return { x, z };
  }

  if (value && typeof value === "object") {
    const x = Number(value.x ?? value.longitude ?? value.lng);
    const z = Number(value.z ?? value.y ?? value.latitude ?? value.lat);
    if (Number.isFinite(x) && Number.isFinite(z)) return { x, z };
  }

  return null;
}

function playerPosition(state) {
  const direct = [
    "player.position",
    "player.worldPosition",
    "player.coordinates",
    "player.coords",
    "player.pos",
    "playerPosition",
    "controlled.position",
    "avatar.position",
  ];

  for (const path of direct) {
    const position = asPosition(valueAt(state, path));
    if (position) return position;
  }

  const queue = [{ value: state, path: "" }];
  while (queue.length) {
    const current = queue.shift();
    if (!current?.value || typeof current.value !== "object") continue;
    for (const [key, value] of Object.entries(current.value)) {
      const path = current.path ? `${current.path}.${key}` : key;
      if (/player|avatar|character|controlled/i.test(path)) {
        const position = asPosition(value);
        if (position) return position;
      }
      if (path.split(".").length < 6) queue.push({ value, path });
    }
  }

  return null;
}

function phaseOf(state) {
  const value = firstValueAt(state, ["phase", "game.phase", "gamePhase", "status", "mode"]);
  return typeof value === "string" ? value.toLowerCase() : null;
}

function vehicleState(state) {
  const value = firstValueAt(state, [
    "player.inVehicle",
    "player.currentVehicle",
    "player.vehicleId",
    "player.vehicle",
    "controlledVehicle",
    "inVehicle",
    "vehicle",
  ]);

  if (value === undefined || value === null || value === false || value === "") return null;
  if (typeof value === "string" && /^(onfoot|foot|walking|none)$/i.test(value)) return null;
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function reachableVehicleInState(state) {
  const explicit = firstValueAt(state, [
    "player.canEnterVehicle",
    "canEnterVehicle",
    "interaction.canEnterVehicle",
    "nearbyVehicle.reachable",
    "nearestVehicle.reachable",
  ]);
  if (explicit === true) return true;

  const queue = [{ value: state, path: "" }];
  while (queue.length) {
    const current = queue.shift();
    if (!current?.value || typeof current.value !== "object") continue;
    for (const [key, value] of Object.entries(current.value)) {
      const path = current.path ? `${current.path}.${key}` : key;
      const label = `${path} ${typeof value === "string" ? value : ""}`.toLowerCase();
      const isVehicle = /vehicle|car|sedan|sports|taxi|truck|suv|plane|aircraft/.test(label);
      const isNearby = /nearby|nearest|interaction|prompt|reachable|enter/.test(label);
      if (isVehicle && isNearby) {
        if (value === true) return true;
        if (typeof value === "string" && /enter|drive|pilot|vehicle/.test(value.toLowerCase())) return true;
        if (value && typeof value === "object") {
          const distance = Number(value.distance ?? value.distanceToPlayer ?? value.range);
          if (value.reachable === true || value.canEnter === true || (Number.isFinite(distance) && distance <= 7)) return true;
        }
      }
      if (path.split(".").length < 6) queue.push({ value, path });
    }
  }

  return false;
}

function clockMetric(state) {
  const preferredPaths = [
    "simulation.elapsed",
    "simulation.elapsedTime",
    "simulation.elapsedMs",
    "simulation.time",
    "game.elapsed",
    "game.elapsedTime",
    "world.elapsed",
    "elapsed",
    "elapsedTime",
    "elapsedMs",
    "time",
    "frame",
    "tick",
  ];

  for (const path of preferredPaths) {
    const value = Number(valueAt(state, path));
    if (Number.isFinite(value)) return { path, value };
  }

  const queue = [{ value: state, path: "" }];
  while (queue.length) {
    const current = queue.shift();
    if (!current?.value || typeof current.value !== "object") continue;
    for (const [key, value] of Object.entries(current.value)) {
      const path = current.path ? `${current.path}.${key}` : key;
      if (/^(elapsed|elapsedtime|elapsedms|simulationtime|frame|tick)$/i.test(key) && Number.isFinite(Number(value))) {
        return { path, value: Number(value) };
      }
      if (path.split(".").length < 6) queue.push({ value, path });
    }
  }

  return null;
}

function distanceBetween(a, b) {
  return Math.hypot(b.x - a.x, b.z - a.z);
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

async function advance(page, milliseconds) {
  await page.evaluate((ms) => window.advanceTime(ms), milliseconds);
}

async function bootToStartScreen(page) {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/?test=1&fresh=1", { waitUntil: "domcontentloaded" });
  await expect(page.locator("#loading-screen")).toBeAttached();
  await page.waitForFunction(() =>
    window.__gameReady === true
    && typeof window.advanceTime === "function"
    && typeof window.render_game_to_text === "function",
  );
  await expect(page.locator("#loading-screen")).toBeHidden();
  await expect(page.locator("#start-screen")).toBeVisible();
  await expect(page.locator("#start-button")).toBeEnabled();
}

async function startGame(page) {
  await bootToStartScreen(page);
  await page.locator("#start-button").click();
  await expect(page.locator("#start-screen")).toBeHidden();
  await expect(page.locator("#hud")).toBeVisible();
  await page.waitForFunction(() => {
    const raw = window.render_game_to_text();
    const state = typeof raw === "string" ? JSON.parse(raw) : raw;
    const phase = String(state?.phase ?? state?.game?.phase ?? state?.gamePhase ?? "").toLowerCase();
    return !phase || phase === "playing" || phase === "running" || phase === "active";
  });
}

async function takeScreenshot(page, testInfo, name) {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    animations: "allow",
    caret: "hide",
    timeout: 30_000,
  });
}

async function visibleVehiclePrompt(page) {
  const prompt = page.locator("#interaction-prompt:not(.hidden), [data-testid='interaction-prompt']:visible");
  if (!(await prompt.count()) || !(await prompt.first().isVisible())) return false;
  return /vehicle|car|drive|ride|plane|pilot|enter/i.test(await prompt.first().innerText());
}

test("loads, starts, and renders the game canvas with its HUD", async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await bootToStartScreen(page);

  await expect(page).toHaveTitle(/Sin City RP/i);
  await expect(page.getByRole("heading", { name: /Sin City/i })).toBeVisible();
  await takeScreenshot(page, testInfo, "start-screen");

  await page.locator("#start-button").click();
  await expect(page.locator("#hud")).toBeVisible();
  await expect(page.locator("#game-canvas")).toBeVisible();
  await expect(page.locator("#minimap")).toBeVisible();

  const canvas = await page.locator("#game-canvas").evaluate((node) => ({
    width: node.width,
    height: node.height,
    clientWidth: node.clientWidth,
    clientHeight: node.clientHeight,
  }));
  expect(canvas.width).toBeGreaterThan(100);
  expect(canvas.height).toBeGreaterThan(100);
  expect(canvas.clientWidth).toBeGreaterThan(100);
  expect(canvas.clientHeight).toBeGreaterThan(100);

  const state = await readGameState(page);
  expect(state).toBeTruthy();
  if (phaseOf(state)) expect(phaseOf(state)).toMatch(/playing|running|active/);
  await takeScreenshot(page, testInfo, "playing-hud");
  expect(errors).toEqual([]);
});

test("moves the player with keyboard input", async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await startGame(page);

  let before = playerPosition(await readGameState(page));
  expect(before, "render_game_to_text() should expose the player position").not.toBeNull();

  let movedDistance = 0;
  for (const key of ["KeyW", "KeyD", "KeyS", "KeyA"]) {
    await page.keyboard.down(key);
    await advance(page, 700);
    await page.keyboard.up(key);
    const after = playerPosition(await readGameState(page));
    expect(after, "player position disappeared after keyboard input").not.toBeNull();
    movedDistance = distanceBetween(before, after);
    before = after;
    if (movedDistance > 0.05) break;
  }

  expect(movedDistance, "none of the four movement directions changed the player position").toBeGreaterThan(0.05);
  await takeScreenshot(page, testInfo, "keyboard-movement");
  expect(errors).toEqual([]);
});

test("enters a vehicle with F whenever one is reachable", async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await startGame(page);

  let enteredVehicle = false;
  const positionedByOptionalHelper = await page.evaluate(() => {
    const teleport = window.__SIN_CITY_TEST__?.teleportToVehicle;
    return typeof teleport === "function" ? Boolean(teleport()) : false;
  });
  let reachableVehicleSeen = positionedByOptionalHelper;
  const searchInputs = positionedByOptionalHelper
    ? [null]
    : [null, "KeyW", "KeyD", "KeyS", "KeyA", "KeyW", "KeyD", "KeyW"];

  for (const key of searchInputs) {
    if (key) {
      await page.keyboard.down(key);
      await advance(page, 850);
      await page.keyboard.up(key);
    }

    const before = await readGameState(page);
    reachableVehicleSeen ||= reachableVehicleInState(before) || await visibleVehiclePrompt(page);
    await page.keyboard.press("KeyF");
    await advance(page, 100);
    const after = await readGameState(page);
    const vehicleHudVisible = await page.locator("#vehicle-hud").isVisible();
    enteredVehicle = Boolean(vehicleState(after)) || vehicleHudVisible;
    if (enteredVehicle) break;
    if (reachableVehicleSeen) break;
  }

  if (reachableVehicleSeen) {
    expect(enteredVehicle, "F did not enter the vehicle reported as reachable").toBe(true);
  } else {
    testInfo.annotations.push({
      type: "note",
      description: "No reachable vehicle was exposed during procedural exploration; F remained safe.",
    });
  }

  await takeScreenshot(page, testInfo, enteredVehicle ? "vehicle-entered" : "vehicle-search");
  expect(errors).toEqual([]);
});

test("pauses with Escape and resumes from the pause menu", async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await startGame(page);

  await page.keyboard.press("Escape");
  await expect(page.locator("#pause-menu")).toBeVisible();
  const pausedState = await readGameState(page);
  if (phaseOf(pausedState)) expect(phaseOf(pausedState)).toMatch(/paused|pause/);
  await takeScreenshot(page, testInfo, "paused");

  await page.locator("#resume-button").click();
  await expect(page.locator("#pause-menu")).toBeHidden();
  await expect(page.locator("#hud")).toBeVisible();
  const resumedState = await readGameState(page);
  if (phaseOf(resumedState)) expect(phaseOf(resumedState)).toMatch(/playing|running|active/);
  await takeScreenshot(page, testInfo, "resumed");
  expect(errors).toEqual([]);
});

test("advanceTime advances the simulation in deterministic equal steps", async ({ page }, testInfo) => {
  const errors = captureBrowserErrors(page);
  await startGame(page);

  const snapshots = await page.evaluate(() => {
    const read = () => {
      const raw = window.render_game_to_text();
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    };
    const before = read();
    window.advanceTime(500);
    const first = read();
    window.advanceTime(500);
    const second = read();
    return { before, first, second };
  });

  const beforeClock = clockMetric(snapshots.before);
  const firstClock = clockMetric(snapshots.first);
  const secondClock = clockMetric(snapshots.second);
  expect(beforeClock, "rendered state should expose elapsed time, frame, or tick").not.toBeNull();
  expect(firstClock?.path).toBe(beforeClock?.path);
  expect(secondClock?.path).toBe(beforeClock?.path);

  const firstDelta = firstClock.value - beforeClock.value;
  const secondDelta = secondClock.value - firstClock.value;
  expect(firstDelta).toBeGreaterThan(0);
  expect(secondDelta).toBeGreaterThan(0);
  expect(Math.abs(firstDelta - secondDelta)).toBeLessThanOrEqual(Math.max(0.000_001, Math.abs(firstDelta) * 0.02));

  await takeScreenshot(page, testInfo, "deterministic-advance");
  expect(errors).toEqual([]);
});
