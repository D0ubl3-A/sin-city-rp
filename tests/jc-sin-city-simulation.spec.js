import { expect, test } from "@playwright/test";
import { createSinCitySimulation, getSimulationLod } from "../src/jcSinCitySimulation.js";

test("uses three simulation LOD bands", () => {
  expect(getSimulationLod(25)).toBe("full");
  expect(getSimulationLod(100)).toBe("full");
  expect(getSimulationLod(101)).toBe("reduced");
  expect(getSimulationLod(1000)).toBe("reduced");
  expect(getSimulationLod(1001)).toBe("aggregate");
});

test("keeps the vertical slice bounded and adapts under low FPS", () => {
  const sim = createSinCitySimulation({ population: 10_000, activeNpcCap: 150, deepAiCap: 25 });
  let snapshot = sim.snapshot();
  expect(snapshot.population.total).toBe(10_000);
  expect(snapshot.population.activePhysicalBudget).toBe(150);
  expect(snapshot.population.deepAiBudget).toBe(25);
  expect(snapshot.population.aggregateCitizens).toBe(9850);

  sim.recordPerformance({ fps: 18, frameMs: 55, mode: "destruction" });
  sim.tick(1);
  sim.tick(1);
  snapshot = sim.snapshot();
  expect(snapshot.performance.degraded).toBe(true);
  expect(snapshot.performance.activeNpcCap).toBeLessThan(150);
  expect(snapshot.performance.deepAiCap).toBeLessThan(25);
  expect(snapshot.performance.gate.targetFps).toBe(25);
});

test("JC and Satan events push district state in opposite directions", () => {
  const sim = createSinCitySimulation();
  const before = sim.snapshot().district;

  sim.applyEvent({ type: "soul_taker", magnitude: 1, people: 1 });
  const infernal = sim.snapshot().district;
  expect(infernal.corruption).toBeGreaterThan(before.corruption);
  expect(infernal.hope).toBeLessThan(before.hope);

  sim.applyEvent({ type: "divine_light", magnitude: 1, people: 2 });
  const divine = sim.snapshot().district;
  expect(divine.corruption).toBeLessThan(infernal.corruption);
  expect(divine.hope).toBeGreaterThan(infernal.hope);
  expect(divine.protectedPeople).toBeGreaterThanOrEqual(2);
});

test("browser bootstrap exposes the non-blocking city simulator", async ({ page }) => {
  await page.goto("/?test=1");
  await expect.poll(
    () => page.evaluate(() => window.__JC_SIN_CITY_SIMULATION__?.status),
    { timeout: 15_000 },
  ).toBe("ready");

  const snapshot = await page.evaluate(() => window.__JC_SIN_CITY_SIMULATION__.snapshot);
  expect(snapshot.population.total).toBe(10_000);
  expect(snapshot.population.activePhysicalBudget).toBeLessThanOrEqual(80);
  expect(snapshot.population.deepAiBudget).toBeLessThanOrEqual(12);
  await expect(page.locator("#game-canvas")).toBeVisible();
});
