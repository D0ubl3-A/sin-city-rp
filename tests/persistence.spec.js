import { expect, test } from "@playwright/test";

const FRESH_URL = "/?test=1&persist=1&quality=low&fresh=1";
const RESUME_URL = "/?test=1&persist=1&quality=low";
const TEST_ZONE = "playwright-memory-vault";

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

function numberAt(object, paths) {
  const value = Number(firstValueAt(object, paths));
  return Number.isFinite(value) ? value : null;
}

function stringAt(object, paths) {
  const value = firstValueAt(object, paths);
  return typeof value === "string" && value.length ? value : null;
}

function asPosition(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const [x, second, third] = value.map(Number);
    const z = Number.isFinite(third) ? third : second;
    const y = Number.isFinite(third) ? second : 0;
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) return { x, y, z };
  }

  if (value && typeof value === "object") {
    const x = Number(value.x ?? value.longitude ?? value.lng);
    const y = Number(value.y ?? value.altitude ?? 0);
    const z = Number(value.z ?? value.latitude ?? value.lat);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) return { x, y, z };
  }

  return null;
}

function indexedEntry(collection, index) {
  if (Array.isArray(collection)) return collection[index] ?? null;
  if (!collection || typeof collection !== "object") return null;
  if (collection[index] !== undefined) return collection[index];
  if (collection[String(index)] !== undefined) return collection[String(index)];
  if (collection[`npc-${index}`] !== undefined) return collection[`npc-${index}`];
  if (collection[`npc:${index}`] !== undefined) return collection[`npc:${index}`];
  return Object.values(collection)[index] ?? null;
}

function asStringArray(value) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => typeof entry === "string" ? entry : entry?.id ?? entry?.zone ?? entry?.name)
      .filter((entry) => typeof entry === "string" && entry.length);
  }
  if (value && typeof value === "object") {
    return Object.entries(value)
      .filter(([, enabled]) => Boolean(enabled))
      .map(([key]) => key);
  }
  return [];
}

function conversationFor(raw, npc, npcIndex) {
  const direct = firstValueAt(npc, [
    "conversation",
    "conversationHistory",
    "history",
    "transcript",
    "messages",
  ]);
  if (Array.isArray(direct)) return direct;

  const collections = [
    raw.conversations,
    raw.conversationMemory,
    raw.memory?.conversations,
    raw.persistence?.conversations,
    raw.saved?.conversations,
  ];
  for (const collection of collections) {
    if (!collection) continue;
    const byId = npc?.id && !Array.isArray(collection) ? collection[npc.id] : undefined;
    const candidate = byId ?? indexedEntry(collection, npcIndex);
    if (Array.isArray(candidate)) return candidate;
    if (Array.isArray(candidate?.messages)) return candidate.messages;
    if (Array.isArray(candidate?.history)) return candidate.history;
  }
  return [];
}

function normalizeSnapshot(raw, npcIndex = 0) {
  const player = firstValueAt(raw, ["player", "run.player", "state.player", "saved.player"]) || raw;
  const npcCollections = [
    raw.npcMemory,
    raw.npcs,
    raw.memory?.npcs,
    raw.persistence?.npcs,
    raw.saved?.npcs,
    raw.world?.npcs,
  ];
  let npc = null;
  for (const collection of npcCollections) {
    npc = indexedEntry(collection, npcIndex);
    if (npc) break;
  }
  npc ||= {};

  const discoveredSource = firstValueAt(raw, [
    "discoveredZones",
    "memory.discoveredZones",
    "persistence.discoveredZones",
    "saved.discoveredZones",
    "world.discoveredZones",
    "discovery.zones",
  ]);
  const interactionCount = numberAt(npc, [
    "interactionCount",
    "interactions",
    "timesInteracted",
    "timesTalked",
    "talkCount",
  ]);
  const interactedValue = firstValueAt(npc, ["interacted", "hasInteracted", "met", "talked"]);

  return {
    raw,
    role: stringAt(raw, ["role", "player.role", "run.role", "run.player.role", "saved.role"]),
    cash: numberAt(player, ["cash", "money", "wallet.cash"]),
    reputation: numberAt(player, ["reputation", "rep", "streetRep"]),
    position: asPosition(firstValueAt(player, ["position", "worldPosition", "coordinates", "coords", "pos"])
      ?? firstValueAt(raw, ["position", "playerPosition"])),
    zone: stringAt(player, ["zone", "currentZone", "location"])
      ?? stringAt(raw, ["zone", "currentZone", "location"]),
    discoveredZones: asStringArray(discoveredSource),
    npc: {
      id: npc.id ?? npc.memoryId ?? npc.profileId ?? npcIndex,
      trust: numberAt(npc, ["trust", "relationship.trust", "memory.trust"]),
      interactionCount,
      interacted: interactedValue === true || (interactionCount ?? 0) > 0,
      conversation: conversationFor(raw, npc, npcIndex),
    },
  };
}

function normalizeDiagnostic(raw) {
  const diagnostics = firstValueAt(raw, ["diagnostics", "persistence.diagnostics", "storage.diagnostics", "save.diagnostics"]) || raw;
  return {
    saveKey: stringAt(raw, [
      "saveKey",
      "diagnostics.saveKey",
      "persistence.saveKey",
      "persistence.diagnostics.saveKey",
      "storage.saveKey",
      "save.key",
    ]),
    status: String(firstValueAt(diagnostics, ["status", "loadStatus", "state", "result"]) ?? ""),
    recovered: Boolean(firstValueAt(diagnostics, ["recovered", "didRecover", "usedBackup", "fallbackUsed"])),
    error: String(firstValueAt(diagnostics, [
      "error",
      "lastError",
      "loadError",
      "recoveryError",
      "corruptReason",
      "message",
    ]) ?? ""),
  };
}

async function useHook(page, name, ...args) {
  return page.evaluate(async ({ hookName, hookArgs }) => {
    const hook = window.__SIN_CITY_TEST__?.[hookName];
    if (typeof hook !== "function") throw new Error(`Missing __SIN_CITY_TEST__.${hookName}()`);
    return await hook(...hookArgs);
  }, { hookName: name, hookArgs: args });
}

async function waitForReadyMenu(page) {
  await page.waitForFunction(() =>
    window.__gameReady === true
    && typeof window.render_game_to_text === "function"
    && typeof window.__SIN_CITY_TEST__?.saveNow === "function"
    && typeof window.__SIN_CITY_TEST__?.persistenceSnapshot === "function"
    && typeof window.__SIN_CITY_TEST__?.setPersistenceProbe === "function",
  );
  await expect(page.locator("#loading-screen")).toBeHidden();
  await expect(page.locator("#start-screen")).toBeVisible();
  await expect(page.locator("#start-button")).toBeEnabled();
}

async function openMenu(page, url) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await waitForReadyMenu(page);
}

async function enterCity(page, role) {
  const uiRole = role === "highRoller" ? "highroller" : role;
  const roleCard = page.locator(`.role-card[data-role="${uiRole}"]`);
  await expect(roleCard).toHaveCount(1);
  if ((await roleCard.getAttribute("aria-pressed")) !== "true") await roleCard.click();
  await page.locator("#start-button").click();
  await expect(page.locator("#start-screen")).toBeHidden();
  await expect(page.locator("#hud")).toBeVisible();
  await expect.poll(async () => {
    const raw = await page.evaluate(() => window.render_game_to_text());
    const state = typeof raw === "string" ? JSON.parse(raw) : raw;
    return String(state?.phase ?? state?.game?.phase ?? "").toLowerCase();
  }).toMatch(/playing|running|active/);
}

async function persistenceSnapshot(page, npcIndex = 0) {
  return normalizeSnapshot(await useHook(page, "persistenceSnapshot"), npcIndex);
}

async function currentGameStorage(page, preferredKey = null) {
  return page.evaluate((hint) => {
    const keys = Object.keys(localStorage);
    const score = (key) => {
      const lower = key.toLowerCase();
      let value = 0;
      if (lower.includes("sin-city")) value += 20;
      if (lower.includes("save")) value += 8;
      if (lower.includes("current")) value += 3;
      if (lower.includes("backup")) value -= 15;
      if (lower.includes("recovery")) value -= 10;
      return value;
    };
    const key = hint && localStorage.getItem(hint) !== null
      ? hint
      : keys.filter((candidate) => /sin[- ]?city/i.test(candidate)).sort((a, b) => score(b) - score(a))[0];
    return key ? { key, value: localStorage.getItem(key) } : { key: null, value: null };
  }, preferredKey);
}

function expectProbeApplied(before, after, { cashDelta, reputationDelta, trustDelta, discoveredZone }) {
  expect(before.cash, "probe baseline must expose player cash").not.toBeNull();
  expect(before.reputation, "probe baseline must expose player reputation").not.toBeNull();
  expect(after.cash).toBe(before.cash + cashDelta);
  expect(after.reputation).toBe(before.reputation + reputationDelta);
  expect(after.npc.trust, "probe must expose NPC trust").not.toBeNull();
  if (before.npc.trust !== null) expect(after.npc.trust).toBe(before.npc.trust + trustDelta);
  expect(after.npc.interacted, "probe must record an NPC interaction").toBe(true);
  expect(after.npc.conversation.length, "probe must add a deterministic conversation exchange").toBeGreaterThan(0);
  expect(after.discoveredZones).toContain(discoveredZone);
}

function expectSamePlace(expected, actual) {
  if (expected.position && actual.position) {
    expect(actual.position.x).toBeCloseTo(expected.position.x, 1);
    expect(actual.position.y).toBeCloseTo(expected.position.y, 1);
    expect(actual.position.z).toBeCloseTo(expected.position.z, 1);
    return;
  }
  expect(expected.zone, "persistence snapshot must expose player position or zone").not.toBeNull();
  expect(actual.zone).toBe(expected.zone);
}

function expectDurableMemory(expected, actual, discoveredZone) {
  expect(actual.role).toBe(expected.role);
  expect(actual.cash).toBe(expected.cash);
  expect(actual.reputation).toBe(expected.reputation);
  expectSamePlace(expected, actual);
  expect(actual.npc.id).toBe(expected.npc.id);
  expect(actual.npc.trust).toBe(expected.npc.trust);
  expect(actual.npc.interacted).toBe(true);
  expect(actual.npc.interactionCount).toBe(expected.npc.interactionCount);
  expect(actual.npc.conversation).toEqual(expected.npc.conversation);
  expect(actual.discoveredZones).toContain(discoveredZone);
}

test.describe.serial("durable Sin City memory", () => {
  test("reload and start-menu boot preserve player, NPC, discovery, and conversation memory", async ({ page }) => {
    const errors = captureBrowserErrors(page);
    const probe = {
      cashDelta: 731,
      reputationDelta: 37,
      npcIndex: 0,
      trustDelta: 19,
      discoveredZone: TEST_ZONE,
    };

    await openMenu(page, FRESH_URL);
    await enterCity(page, "highroller");
    const baseline = await persistenceSnapshot(page, probe.npcIndex);
    await useHook(page, "setPersistenceProbe", probe);
    await useHook(page, "saveNow");
    const expected = await persistenceSnapshot(page, probe.npcIndex);
    expectProbeApplied(baseline, expected, probe);
    expect(expected.role).toBe("highRoller");

    const diagnostic = normalizeDiagnostic(expected.raw);
    const stored = await currentGameStorage(page, diagnostic.saveKey);
    expect(stored.key, "saveNow() must create a discoverable Sin City save key").not.toBeNull();
    expect(stored.value, "saveNow() must write a non-empty save payload").toBeTruthy();

    await page.addInitScript((saveKey) => {
      window.__sinCitySaveAtDocumentStart = localStorage.getItem(saveKey);
    }, stored.key);
    await openMenu(page, RESUME_URL);

    const menuStorage = await page.evaluate((saveKey) => ({
      atDocumentStart: window.__sinCitySaveAtDocumentStart,
      afterMenuReady: localStorage.getItem(saveKey),
    }), stored.key);
    expect(menuStorage.atDocumentStart).toBeTruthy();
    expect(menuStorage.afterMenuReady, "opening the start menu must not overwrite the current save").toBe(menuStorage.atDocumentStart);

    await enterCity(page, expected.role);
    const restored = await persistenceSnapshot(page, probe.npcIndex);
    expectDurableMemory(expected, restored, probe.discoveredZone);
    expect(errors).toEqual([]);
  });

  test("Restart Night clears only Sin City game memory and the reset survives reload", async ({ page }) => {
    const errors = captureBrowserErrors(page);
    const probe = {
      cashDelta: 913,
      reputationDelta: 41,
      npcIndex: 0,
      trustDelta: 23,
      discoveredZone: TEST_ZONE,
    };
    const unrelatedKey = "playwright-unrelated-storage";
    const unrelatedValue = "keep-me-across-sin-city-restart";

    await openMenu(page, FRESH_URL);
    await enterCity(page, "wheelman");
    const baseline = await persistenceSnapshot(page, probe.npcIndex);
    await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: unrelatedKey, value: unrelatedValue });
    await useHook(page, "setPersistenceProbe", probe);
    await useHook(page, "saveNow");
    const enriched = await persistenceSnapshot(page, probe.npcIndex);
    expectProbeApplied(baseline, enriched, probe);

    await page.keyboard.press("Escape");
    await expect(page.locator("#pause-menu")).toBeVisible();
    await page.locator("#restart-button").click();
    await expect(page.locator("#pause-menu")).toBeHidden();
    await expect(page.locator("#hud")).toBeVisible();

    const reset = await persistenceSnapshot(page, probe.npcIndex);
    expect(reset.role).toBe(baseline.role);
    expect(reset.cash).toBe(baseline.cash);
    expect(reset.reputation).toBe(baseline.reputation);
    expect(reset.npc.trust).toBe(baseline.npc.trust);
    expect(reset.npc.interacted).toBe(baseline.npc.interacted);
    expect(reset.npc.interactionCount).toBe(baseline.npc.interactionCount);
    expect(reset.npc.conversation).toEqual(baseline.npc.conversation);
    expect(reset.discoveredZones).not.toContain(probe.discoveredZone);
    await expect(page.evaluate((key) => localStorage.getItem(key), unrelatedKey)).resolves.toBe(unrelatedValue);

    await useHook(page, "saveNow");
    await openMenu(page, RESUME_URL);
    await expect(page.evaluate((key) => localStorage.getItem(key), unrelatedKey)).resolves.toBe(unrelatedValue);
    await enterCity(page, baseline.role);
    const resetAfterReload = await persistenceSnapshot(page, probe.npcIndex);
    expect(resetAfterReload.cash).toBe(baseline.cash);
    expect(resetAfterReload.reputation).toBe(baseline.reputation);
    expect(resetAfterReload.npc.trust).toBe(baseline.npc.trust);
    expect(resetAfterReload.npc.interacted).toBe(baseline.npc.interacted);
    expect(resetAfterReload.npc.conversation).toEqual(baseline.npc.conversation);
    expect(resetAfterReload.discoveredZones).not.toContain(probe.discoveredZone);
    expect(errors).toEqual([]);
  });

  test("a corrupt current save recovers without crashing and exposes a diagnostic", async ({ page }) => {
    const errors = captureBrowserErrors(page);

    await openMenu(page, FRESH_URL);
    await enterCity(page, "drifter");
    await useHook(page, "setPersistenceProbe", {
      cashDelta: 157,
      reputationDelta: 11,
      npcIndex: 0,
      trustDelta: 7,
      discoveredZone: TEST_ZONE,
    });
    await useHook(page, "saveNow");

    const beforeCorruption = await useHook(page, "persistenceSnapshot");
    const stored = await currentGameStorage(page, normalizeDiagnostic(beforeCorruption).saveKey);
    expect(stored.key, "the corruption test needs the current Sin City save key").not.toBeNull();
    await page.evaluate((key) => localStorage.setItem(key, '{"version":'), stored.key);

    // Close without an unload event so the normal unload save cannot repair the
    // deliberately corrupt payload before the next document gets to read it.
    const context = page.context();
    await page.close({ runBeforeUnload: false });
    const recoveryPage = await context.newPage();
    const recoveryErrors = captureBrowserErrors(recoveryPage);

    await openMenu(recoveryPage, RESUME_URL);
    const recoveredRaw = await useHook(recoveryPage, "persistenceSnapshot");
    const diagnostic = normalizeDiagnostic(recoveredRaw);
    const hasRecoveryDiagnostic = diagnostic.recovered
      || diagnostic.error.length > 0
      || /recover|corrupt|invalid|error|fallback|reset/i.test(diagnostic.status);
    expect(hasRecoveryDiagnostic, `expected recovery diagnostic, received ${JSON.stringify(diagnostic)}`).toBe(true);

    await enterCity(recoveryPage, "drifter");
    const rendered = await recoveryPage.evaluate(() => window.render_game_to_text());
    expect(() => typeof rendered === "string" ? JSON.parse(rendered) : rendered).not.toThrow();
    await expect(recoveryPage.locator("#game-canvas")).toBeVisible();
    await expect(recoveryPage.locator("#hud")).toBeVisible();
    expect([...errors, ...recoveryErrors]).toEqual([]);
  });
});
