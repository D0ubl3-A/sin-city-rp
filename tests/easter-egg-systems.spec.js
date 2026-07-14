import { expect, test } from "@playwright/test";
import {
  AREA_51_MANIFEST_LIMITS,
  DIVINE_INFERNAL_CATALOG,
  DIVINE_INFERNAL_LIMITS,
  createEasterEggGameplaySystem,
  generateArea51HangarManifest,
  validateArea51HangarManifest,
} from "../src/easterEggSystems.js";

test.describe("divine and infernal easter-egg gameplay", () => {
  test("exports render-ready hoodie presentation metadata", () => {
    const jesusHoodie = DIVINE_INFERNAL_CATALOG.presentation.jesus.hoodie;
    expect(jesusHoodie.phrase).toBe("HOLY SHI†");
    expect(jesusHoodie.typography.crossGlyph).toBe("†");
    expect(jesusHoodie.typography.crossCharacterIndex).toBe(8);
    expect(jesusHoodie.typography.haloCharacterIndex).toBe(7);
    expect(jesusHoodie.typography.haloAnchor).toBe("above");

    const devilHoodie = DIVINE_INFERNAL_CATALOG.presentation.devil.hoodie;
    expect(devilHoodie.phrase).toBe("HELL YES");
    expect(devilHoodie.placement).toBe("back");
    expect(devilHoodie.typography.effect).toBe("animated-real-fire-letters");
    expect(devilHoodie.typography.emitsLight).toBe(true);
    expect(devilHoodie.typography.damageEnabled).toBe(false);
  });

  test("the Devil's soul-taker round only corrupts living adult NPCs", () => {
    const system = createEasterEggGameplaySystem({
      entities: [
        { id: "devil", kind: "devil" },
        { id: "local-adult", kind: "npc", ageBand: "adult", health: 91, alignment: 12 },
        { id: "protected-minor", kind: "npc", ageBand: "minor", health: 91, alignment: 12 },
      ],
    });

    const first = system.applyProjectileHit({
      projectileId: "soulTaker",
      shooter: "devil",
      targetId: "local-adult",
      atMs: 1_000,
    });
    expect(first.ok).toBe(true);
    expect(first.outcome).toBe("corrupted");
    expect(first.target).toEqual(expect.objectContaining({
      health: 85,
      corruption: 34,
      alignment: -16,
      behavior: "uneasy",
    }));
    expect(first.events[0]).toEqual(expect.objectContaining({
      type: "soul_taker_impact",
      tone: "infernal",
      projectileId: "soulTaker",
      targetEntityId: "local-adult",
    }));

    system.applyProjectileHit({ projectileId: "soulTaker", shooter: "devil", targetId: "local-adult", atMs: 2_000 });
    const third = system.applyProjectileHit({ projectileId: "soulTaker", shooter: "devil", targetId: "local-adult", atMs: 3_000 });
    expect(third.target.corruption).toBe(DIVINE_INFERNAL_LIMITS.maxCorruption);
    expect(third.target.alignment).toBeGreaterThanOrEqual(DIVINE_INFERNAL_LIMITS.minAlignment);
    expect(third.target.behavior).toBe("hostile_corrupted");
    expect(third.target.possessedByDemon).toBe(true);
    expect(third.events.map((event) => event.type)).toContain("npc_corrupted");

    const beforeMinor = system.getEntity("protected-minor");
    const minorHit = system.applyProjectileHit({
      projectileId: "soulTaker",
      shooter: "devil",
      targetId: "protected-minor",
    });
    expect(minorHit.outcome).toBe("ineligible_target");
    expect(minorHit.events[0].data.reason).toBe("adult_living_npc_required");
    expect(system.getEntity("protected-minor")).toEqual(beforeMinor);
  });

  test("Jesus's divine-light round heals, saves, cleanses, and releases possession", () => {
    const system = createEasterEggGameplaySystem({
      entities: [
        { id: "jesus", kind: "jesus" },
        { id: "possessed-local", kind: "npc", health: 40, corruption: 85, alignment: -70, behavior: "hostile_corrupted", possessedByDemon: true },
        { id: "downed-local", kind: "npc", health: 0, alive: false, revivable: true, corruption: 20 },
      ],
    });

    const cleanse = system.applyProjectileHit({
      projectileId: "divineLight",
      shooter: "jesus",
      targetId: "possessed-local",
      atMs: 4_000,
    });
    expect(cleanse.ok).toBe(true);
    expect(cleanse.outcome).toBe("healed_and_cleansed");
    expect(cleanse.target).toEqual(expect.objectContaining({
      health: 82,
      corruption: 30,
      alignment: -40,
      behavior: "recovering",
      possessedByDemon: false,
    }));
    expect(cleanse.releasedDemonId).toMatch(/^released-demon-possessed-local-1$/);
    expect(system.getEntity(cleanse.releasedDemonId)).toEqual(expect.objectContaining({
      kind: "demon",
      alive: true,
    }));
    expect(cleanse.events.map((event) => event.type)).toContain("demon_released");

    const saved = system.applyProjectileHit({
      projectileId: "divineLight",
      shooter: "jesus",
      targetId: "downed-local",
      atMs: 5_000,
    });
    expect(saved.outcome).toBe("saved");
    expect(saved.target.alive).toBe(true);
    expect(saved.target.health).toBe(DIVINE_INFERNAL_CATALOG.projectiles.divineLight.reviveHealth);
    expect(saved.target.corruption).toBe(0);
    expect(saved.events.map((event) => event.type)).toContain("npc_saved");
  });

  test("only Jesus or a server-approved registered wielder can defeat infernal entities", () => {
    const denied = createEasterEggGameplaySystem({
      entities: [
        { id: "ordinary-player", kind: "npc", divineAuthorized: true },
        { id: "demon-one", kind: "demon" },
      ],
    });
    const forged = denied.applyProjectileHit({
      projectileId: "goldenPistol",
      shooter: { id: "ordinary-player", divineAuthorized: true, authorizationSource: "server" },
      targetId: "demon-one",
    });
    expect(forged.ok).toBe(false);
    expect(forged.outcome).toBe("invalid_wielder");
    expect(denied.getEntity("demon-one").health).toBe(DIVINE_INFERNAL_CATALOG.characters.demon.maxHealth);

    const system = createEasterEggGameplaySystem({
      approvedDivineWielderIds: ["server-chosen-player"],
      entities: [
        { id: "jesus", kind: "jesus" },
        { id: "server-chosen-player", kind: "npc" },
        { id: "demon-two", kind: "demon" },
        { id: "devil", kind: "devil" },
      ],
    });
    const demonResult = system.applyProjectileHit({
      projectileId: "goldenPistol",
      shooter: "server-chosen-player",
      targetId: "demon-two",
    });
    expect(demonResult.outcome).toBe("defeated");
    expect(system.getEntity("demon-two")).toEqual(expect.objectContaining({ health: 0, alive: false }));

    const outcomes = Array.from({ length: 4 }, (_, index) => system.applyProjectileHit({
      projectileId: "goldenPistol",
      shooter: "jesus",
      targetId: "devil",
      atMs: 6_000 + index,
    }).outcome);
    expect(outcomes).toEqual(["damaged", "damaged", "damaged", "defeated"]);
    expect(system.getEntity("devil")).toEqual(expect.objectContaining({ health: 0, alive: false }));
    expect(system.getUiEvents().map((event) => event.type)).toContain("infernal_defeated");
  });

  test("caps the UI event buffer and returns immutable deterministic state", () => {
    const system = createEasterEggGameplaySystem({
      eventLimit: 3,
      seed: "event-buffer-test",
      entities: [
        { id: "devil", kind: "devil" },
        { id: "adult", kind: "npc" },
      ],
    });
    for (let index = 0; index < 5; index += 1) {
      system.applyProjectileHit({ projectileId: "soulTaker", shooter: "devil", targetId: "adult", atMs: index });
    }
    const snapshot = system.snapshot();
    expect(snapshot.seed).toBe("event-buffer-test");
    expect(snapshot.events).toHaveLength(3);
    expect(snapshot.sequence).toBeGreaterThanOrEqual(5);
    expect(Object.isFrozen(snapshot)).toBe(true);
    const drained = system.drainUiEvents();
    expect(drained).toHaveLength(3);
    expect(system.getUiEvents()).toEqual([]);
  });
});

test.describe("Area 51 alien flight hangar manifest", () => {
  test("generates a stable, full, balanced set of flyable alien craft", () => {
    const options = { seed: "black-mailbox-51", count: 32, hangarCount: 4 };
    const first = generateArea51HangarManifest(options);
    const second = generateArea51HangarManifest(options);

    expect(first).toEqual(second);
    expect(first.craftCount).toBe(32);
    expect(first.hangars).toHaveLength(4);
    expect(new Set(first.craft.map((craft) => craft.id)).size).toBe(32);
    expect(first.hangars.flatMap((hangar) => hangar.craftIds)).toHaveLength(32);
    expect(first.authority).toEqual({
      inventoryOwner: "server",
      clientMayCreateCraft: false,
      dynamicCapabilitiesAllowed: false,
    });
    expect(validateArea51HangarManifest(first)).toEqual({ ok: true, errors: [] });

    for (const craft of first.craft) {
      expect(craft.capabilities).toEqual(expect.objectContaining({
        flyable: true,
        hover: true,
        verticalTakeoff: true,
        infiniteFuel: false,
        invulnerable: false,
        unrestrictedWarp: false,
        serverAuthorityRequired: true,
      }));
      expect(craft.stats.maxSpeed).toBeLessThanOrEqual(AREA_51_MANIFEST_LIMITS.maxSpeed);
      expect(craft.stats.maxHealth).toBeLessThanOrEqual(AREA_51_MANIFEST_LIMITS.maxHealth);
      expect(craft.stats.fuelCapacity).toBeLessThanOrEqual(AREA_51_MANIFEST_LIMITS.maxFuel);
      expect(craft.stats.fuelBurnPerSecond).toBeGreaterThan(0);
      expect(craft.stats.weaponHardpoints).toBeLessThanOrEqual(AREA_51_MANIFEST_LIMITS.maxWeaponHardpoints);
    }
  });

  test("changes IDs and stats with the seed but keeps the same bounds", () => {
    const first = generateArea51HangarManifest({ seed: "hangar-alpha", count: 20, hangarCount: 3 });
    const second = generateArea51HangarManifest({ seed: "hangar-beta", count: 20, hangarCount: 3 });
    expect(first.manifestId).not.toBe(second.manifestId);
    expect(first.craft).not.toEqual(second.craft);
    expect(validateArea51HangarManifest(first).ok).toBe(true);
    expect(validateArea51HangarManifest(second).ok).toBe(true);
  });

  test("rejects unbounded manifest sizes and forged capabilities", () => {
    expect(() => generateArea51HangarManifest({ count: 100 })).toThrow(/count must be an integer/i);
    expect(() => generateArea51HangarManifest({ count: 24, hangarCount: 99 })).toThrow(/hangarCount must be an integer/i);

    const forged = JSON.parse(JSON.stringify(generateArea51HangarManifest({ count: 16, hangarCount: 2 })));
    forged.craft[0].stats.maxSpeed = 999_999;
    forged.craft[0].capabilities.infiniteFuel = true;
    const validation = validateArea51HangarManifest(forged);
    expect(validation.ok).toBe(false);
    expect(validation.errors).toEqual(expect.arrayContaining([
      expect.stringContaining("maxSpeed is unbounded"),
      expect.stringContaining("unbounded capability"),
    ]));
  });
});
