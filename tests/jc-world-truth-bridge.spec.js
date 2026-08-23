import { expect, test } from '@playwright/test';

test('boots JC world-truth bridge without blocking Sin City', async ({ page }) => {
  await page.goto('/');

  await expect.poll(async () => page.evaluate(() => window.__SIN_CITY_WORLD_TRUTH__?.status), {
    timeout: 15000
  }).toMatch(/ready|degraded|failed/);

  const snapshot = await page.evaluate(() => {
    const state = window.__SIN_CITY_WORLD_TRUTH__;
    return {
      exists: Boolean(state),
      status: state?.status,
      provider: state?.snapshot?.provider ?? null,
      requiredReady: state?.snapshot?.requiredReady ?? false,
      sourceNames: Object.keys(state?.snapshot?.sources ?? {})
    };
  });

  expect(snapshot.exists).toBe(true);
  expect(['ready', 'degraded', 'failed']).toContain(snapshot.status);

  if (snapshot.status !== 'failed') {
    expect(snapshot.provider).toBe('D0ubl3-A/jc-the-holy-og');
    expect(snapshot.sourceNames).toEqual(expect.arrayContaining([
      'canonicalWorld',
      'buildingRegistryStatus',
      'acceptedTransform',
      'productionGates'
    ]));
  }

  await expect(page.locator('#game-canvas')).toBeVisible();
  await expect(page.locator('#start-screen')).toBeAttached();
});
