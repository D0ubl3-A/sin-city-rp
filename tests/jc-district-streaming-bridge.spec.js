import { expect, test } from "@playwright/test";

test("initializes the JC 43,500-building district stream without blocking gameplay", async ({ page }) => {
  await page.goto("/");

  await expect.poll(
    () => page.evaluate(() => window.__SIN_CITY_JC_DISTRICT_STREAMER__?.status),
    { timeout: 15000 },
  ).toMatch(/index-ready|ready|degraded|error/);

  const bridge = await page.evaluate(() => {
    const state = window.__SIN_CITY_JC_DISTRICT_STREAMER__;
    return {
      exists: Boolean(state),
      status: state?.status,
      districtCount: state?.index?.districts?.length || 0,
      availableBuildings: state?.sourceBuildingsAvailable || 0,
      error: state?.errors?.index || null,
    };
  });

  expect(bridge.exists).toBe(true);
  expect(bridge.availableBuildings).toBe(43500);
  if (bridge.status !== "error") expect(bridge.districtCount).toBe(6);
  await expect(page.locator("#game-canvas")).toBeVisible();
});
