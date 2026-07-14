import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { parseNpcLanguageAction } from "../src/npcLanguageActions.js";

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), "utf8");
const main = read("../src/main.js");
const index = read("../index.html");
const styles = read("../src/styles.css");
const entities = read("../src/entities.js");
const vehicleDynamics = read("../src/vehicleDynamics.js");
const vegasExpansion = read("../src/vegasExpansion.js");

const occurrences = (source, pattern) => source.match(pattern)?.length || 0;

test.describe("swarm feature integration audit", () => {
  test("money-only make slang reaches a confirmation transfer, not item creation", () => {
    for (const phrase of ["hey u wanna make 100 bucks", "wanna make $100"]) {
      const result = parseNpcLanguageAction(phrase);
      expect(result.ok).toBe(true);
      expect(result.status).toBe("needs_confirmation");
      expect(result.action.intent).toBe("give_money");
      expect(result.action.task).toBeNull();
      expect(result.action.money.amount).toBe(100);
    }
  });

  test("unknown item wording becomes a bounded quest and persistent delivery", () => {
    const result = parseNpcLanguageAction("bring me a laser unicorn");
    expect(result.ok).toBe(true);
    expect(result.action.task).toEqual(expect.objectContaining({
      itemId: "collectible",
      requestedLabel: "Laser Unicorn",
    }));
    expect(main).toContain("restorePersistedPickup(entry)");
    expect(main).toContain("restorePersistedNpc(entry)");
    expect(main).toContain("pickup.persistentDynamic && !pickup.collected");
    expect(main).toContain("npc.specialKind || npc.persistentDynamic");
  });

  test("Pig Meter has five heads and a red-blue-white active animation", () => {
    const meterMarkup = index.match(/<div id="wanted"[\s\S]*?<\/div>/)?.[0] || "";
    expect(occurrences(meterMarkup, /🐷/gu)).toBe(5);
    expect(index).toContain("PIG METER CLEAR");
    expect(styles).toContain("@keyframes pigSiren");
    expect(styles).toContain("#ff315c");
    expect(styles).toContain("#45a9ff");
    expect(styles).toMatch(/66%\s*\{\s*color:\s*#fff/i);
    expect(main).toContain("dom.wanted.dataset.level");
  });

  test("right mouse owns target lock and lock cannot survive unarmed mode", () => {
    expect(main).toContain("event.button === 2");
    expect(main).toContain('addEventListener("contextmenu"');
    expect(main).toContain("toggleTargetLock()");
    const updateLock = main.slice(main.indexOf("function updateTargetLock"), main.indexOf("function fireWeapon"));
    expect(updateLock).toMatch(/weapon\s*===\s*["']unarmed["']/);
  });

  test("loyalty uses the relationship engine and is save/test-snapshot visible", () => {
    expect(main).toContain('from "./npcRelationship.js"');
    expect(occurrences(main, /advanceNpcRelationship\s*\(/g)).toBeGreaterThan(1);
    expect(main).toContain("relationship: sanitizeNpcRelationship(relationshipForNpc(npc))");
    expect(main).toContain("loyalty: state.dialogueNpc ? getNpcLoyaltyMeter");
    expect(index).toContain('id="loyalty-meter"');
  });

  test("vehicle runtime reaches wheels, doors, collision damage, NPC impacts, and persistence", () => {
    expect(main).toContain('from "./vehicleDynamics.js"');
    expect(main).toContain("vehicle.dynamics.step(");
    expect(main).toContain("vehicle.dynamics.applyToObject(");
    expect(main).toContain("vehicle.dynamics.commandDoor(");
    expect(occurrences(main, /evaluateVehicleNpcImpact\s*\(/g)).toBeGreaterThan(0);
    expect(main).toContain("serializeVehicleDynamicsState(vehicle.dynamics.getState())");
    expect(entities).toContain("car.parts = { chassis, cabin, wheels, doors }");
    expect(vehicleDynamics).toMatch(/door\.visible\s*=\s*clean\.doors\[id\]\.progress/);
  });

  test("divine/infernal combat and the Area 51 craft manifest reach the live game", () => {
    expect(main).toContain('from "./easterEggSystems.js"');
    expect(occurrences(main, /createEasterEggGameplaySystem\s*\(/g)).toBeGreaterThan(0);
    expect(main).toContain("applyProjectileHit(");
    expect(vegasExpansion).toContain('import { generateArea51HangarManifest } from "./easterEggSystems.js"');
    expect(vegasExpansion).toMatch(/generateArea51HangarManifest\s*\(\s*\{[\s\S]*?count:\s*28,[\s\S]*?hangarCount:\s*4/);
    expect(vegasExpansion).toContain("area51Manifest.craft.forEach");
    expect(main).toContain("world.expansion?.area51Manifest?.craftCount");
    expect(main).toMatch(/supernatural|easterEggs|divineInfernal/i);
  });
});
