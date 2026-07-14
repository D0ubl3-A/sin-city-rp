import { expect, test } from "@playwright/test";

test("text dialogue submits without navigating or restarting the game", async ({ page }) => {
  const errors = [];
  const navigations = [];
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console.error: ${message.text()}`);
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigations.push(frame.url());
  });

  await page.goto("/?test=1&fresh=1", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__gameReady === true && typeof window.__SIN_CITY_TEST__?.submitDialogueText === "function");
  await page.locator("#start-button").click();
  await page.evaluate(() => window.__SIN_CITY_TEST__.teleportToNpc());
  await page.keyboard.press("KeyE");
  await expect(page.locator("#dialogue-panel")).toBeVisible();

  const urlBefore = page.url();
  const navigationCountBefore = navigations.length;
  await page.locator("#dialogue-input").fill("Tell me what is happening at Area 51");
  await page.locator("#dialogue-input").press("Enter");

  await expect(page.locator("#dialogue-panel")).toBeVisible();
  await expect(page.locator("#dialogue-history")).toContainText("Tell me what is happening at Area 51");
  await expect(page.locator("#speaker-line")).toContainText(/Groom Lake|hovering craft|signal/i);
  const state = await page.evaluate(() => JSON.parse(window.render_game_to_text()));
  expect(state.phase).toBe("dialogue");
  expect(state.dialogue.lastIntent).toBe("talk");
  expect(state.dialogue.lastSource).toBe("text");
  expect(page.url()).toBe(urlBefore);
  expect(navigations.length).toBe(navigationCountBefore);
  expect(errors).toEqual([]);
});
