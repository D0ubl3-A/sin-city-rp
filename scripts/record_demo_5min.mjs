import { chromium } from "@playwright/test";
import fs from "node:fs/promises";

const out = "D:/workspace/sin-city-rp-runtime/demo-5min";
const canvasCenter = { x: 800, y: 450 };

async function hold(page, key, ms) {
  await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  await page.keyboard.up(key);
}

async function holdCombo(page, keys, ms) {
  for (const key of keys) await page.keyboard.down(key);
  await page.waitForTimeout(ms);
  for (const key of [...keys].reverse()) await page.keyboard.up(key);
}

async function tap(page, key, afterMs = 500) {
  await page.keyboard.press(key);
  await page.waitForTimeout(afterMs);
}

async function fireBurst(page, shots = 4, gapMs = 500) {
  for (let i = 0; i < shots; i += 1) {
    await page.mouse.down({ button: "left" });
    await page.waitForTimeout(120);
    await page.mouse.up({ button: "left" });
    await page.waitForTimeout(gapMs);
  }
}

async function look(page, directionKey, ms = 1800) {
  await hold(page, directionKey, ms);
}

async function playSegment(page, index) {
  await holdCombo(page, ["KeyW", "ShiftLeft"], 3600);
  await look(page, index % 2 ? "ArrowLeft" : "ArrowRight", 1300);
  await holdCombo(page, ["KeyW", index % 2 ? "KeyA" : "KeyD"], 2800);
  await tap(page, "Digit2", 350);
  await page.mouse.click(canvasCenter.x, canvasCenter.y, { button: "right" });
  await page.waitForTimeout(650);
  await fireBurst(page, 3, 450);
  await tap(page, "KeyR", 900);
  await hold(page, "KeyS", 1200);
  await tap(page, "KeyE", 900);
  await tap(page, "KeyF", 1300);
  await holdCombo(page, ["KeyW", index % 2 ? "KeyD" : "KeyA"], 2400);
  await tap(page, "KeyF", 700);
}

await fs.rm(`${out}/raw`, { recursive: true, force: true });
await fs.mkdir(`${out}/raw`, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_BROWSER_PATH || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" });
const context = await browser.newContext({ viewport: { width: 1600, height: 900 }, recordVideo: { dir: `${out}/raw`, size: { width: 1600, height: 900 } } });
const page = await context.newPage();
await page.goto("http://127.0.0.1:4173/?test=1&fresh=1", { waitUntil: "domcontentloaded", timeout: 60000 });
try {
  await page.waitForSelector("#game-canvas", { state: "attached", timeout: 60000 });
} catch {
  await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForSelector("#game-canvas", { state: "attached", timeout: 60000 });
}
await page.screenshot({ path: `${out}/proof-opening.png` });
await page.locator("#start-button").click({ timeout: 10000 }).catch(async () => {
  await page.keyboard.press("Enter");
});
await page.waitForTimeout(1800);
await page.mouse.click(canvasCenter.x, canvasCenter.y);
await tap(page, "Digit2", 500);
await playSegment(page, 0);
await playSegment(page, 1);
await page.screenshot({ path: `${out}/proof-middle.png` });
await playSegment(page, 2);
await playSegment(page, 3);
await playSegment(page, 4);
await playSegment(page, 5);
await playSegment(page, 6);
await playSegment(page, 7);
await playSegment(page, 8);
await playSegment(page, 9);
await playSegment(page, 10);
await page.screenshot({ path: `${out}/proof-middle.png` });
await playSegment(page, 11);
await playSegment(page, 12);
await playSegment(page, 13);
await playSegment(page, 14);
await page.screenshot({ path: `${out}/proof-final.png` });
await context.close();
await browser.close();
const files = await fs.readdir(`${out}/raw`);
console.log(JSON.stringify({ out, raw: files }));
