const SCHEMA_VERSION = 1;

const ENTITY_KINDS = new Set(["npc", "jesus", "devil", "demon"]);
const AGE_BANDS = new Set(["adult", "minor", "ageless"]);
const PROJECTILE_IDS = new Set(["soulTaker", "divineLight", "goldenPistol"]);
const BEHAVIORS = new Set([
  "civilian",
  "uneasy",
  "corrupted",
  "hostile_corrupted",
  "recovering",
  "restored",
  "divine_guardian",
  "infernal_mastermind",
  "demon_hunter",
]);

const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const round = (value, places = 3) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};
const normalizeId = (value, label = "id") => {
  const id = String(value ?? "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,63}$/.test(id)) {
    throw new TypeError(`${label} must be a stable 1-64 character identifier.`);
  }
  return id;
};
const deepFreeze = (value) => {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
};
const copy = (value) => JSON.parse(JSON.stringify(value));

export const EASTER_EGG_SCHEMA_VERSION = SCHEMA_VERSION;

export const DIVINE_INFERNAL_LIMITS = deepFreeze({
  maxEntities: 256,
  maxEvents: 256,
  maxApprovedDivineWielders: 32,
  maxHealth: 500,
  maxCorruption: 100,
  minAlignment: -100,
  maxAlignment: 100,
  releasedDemonMaxHealth: 140,
});

export const DIVINE_INFERNAL_CATALOG = deepFreeze({
  characters: {
    jesus: {
      id: "jesus",
      label: "The Nazarene",
      faction: "divine",
      maxHealth: 360,
      behavior: "divine_guardian",
    },
    devil: {
      id: "devil",
      label: "The Devil",
      faction: "infernal",
      maxHealth: 480,
      behavior: "infernal_mastermind",
    },
    demon: {
      id: "demon",
      label: "Released Demon",
      faction: "infernal",
      maxHealth: 140,
      behavior: "demon_hunter",
    },
  },
  projectiles: {
    soulTaker: {
      id: "soulTaker",
      label: "Soul-Taker Round",
      requiredWielderKind: "devil",
      healthDamage: 6,
      corruptionGain: 34,
      alignmentShift: -28,
      targetKinds: ["npc"],
    },
    divineLight: {
      id: "divineLight",
      label: "Divine-Light Round",
      requiredWielderKind: "jesus",
      healing: 42,
      reviveHealth: 24,
      corruptionCleanse: 55,
      alignmentShift: 30,
      targetKinds: ["npc"],
    },
    goldenPistol: {
      id: "goldenPistol",
      label: "Golden Pistol Round",
      requiredAuthority: "divine",
      demonDamage: 140,
      devilDamage: 120,
      targetKinds: ["demon", "devil"],
    },
  },
  presentation: {
    jesus: {
      hoodie: {
        placement: "front",
        phrase: "HOLY SHI†",
        accessibleText: "HOLY SHIT",
        typography: {
          baseMaterial: "embroidered-ivory",
          crossGlyph: "†",
          crossCharacterIndex: 8,
          haloCharacterIndex: 7,
          haloAnchor: "above",
          haloEffect: "soft-gold-volumetric-ring",
        },
      },
    },
    devil: {
      hoodie: {
        placement: "back",
        phrase: "HELL YES",
        accessibleText: "HELL YES",
        typography: {
          baseMaterial: "charred-black-embroidery",
          effect: "animated-real-fire-letters",
          flamePalette: ["white-hot", "amber", "crimson"],
          emitsLight: true,
          damageEnabled: false,
        },
      },
    },
  },
});

const defaultEntityForKind = (kind) => {
  if (kind === "jesus") {
    const entry = DIVINE_INFERNAL_CATALOG.characters.jesus;
    return { maxHealth: entry.maxHealth, health: entry.maxHealth, ageBand: "ageless", alignment: 100, behavior: entry.behavior };
  }
  if (kind === "devil") {
    const entry = DIVINE_INFERNAL_CATALOG.characters.devil;
    return { maxHealth: entry.maxHealth, health: entry.maxHealth, ageBand: "ageless", alignment: -100, behavior: entry.behavior };
  }
  if (kind === "demon") {
    const entry = DIVINE_INFERNAL_CATALOG.characters.demon;
    return { maxHealth: entry.maxHealth, health: entry.maxHealth, ageBand: "ageless", alignment: -100, behavior: entry.behavior };
  }
  return { maxHealth: 100, health: 100, ageBand: "adult", alignment: 0, behavior: "civilian" };
};

function normalizeEntity(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("entity must be an object.");
  const id = normalizeId(input.id, "entity.id");
  const kind = String(input.kind ?? "npc");
  if (!ENTITY_KINDS.has(kind)) throw new TypeError(`Unsupported entity kind: ${kind}`);
  const defaults = defaultEntityForKind(kind);
  const ageBand = String(input.ageBand ?? defaults.ageBand);
  if (!AGE_BANDS.has(ageBand)) throw new TypeError(`Unsupported age band: ${ageBand}`);
  const maxHealth = clamp(input.maxHealth ?? defaults.maxHealth, 1, DIVINE_INFERNAL_LIMITS.maxHealth);
  const health = clamp(input.health ?? defaults.health, 0, maxHealth);
  const behavior = BEHAVIORS.has(input.behavior) ? input.behavior : defaults.behavior;
  const corruption = kind === "npc" ? clamp(input.corruption ?? 0, 0, DIVINE_INFERNAL_LIMITS.maxCorruption) : 0;
  const alive = health > 0 && input.alive !== false;

  return {
    id,
    kind,
    ageBand,
    maxHealth,
    health: alive ? health : 0,
    alive,
    revivable: kind === "npc" && input.revivable !== false,
    corruption,
    alignment: clamp(input.alignment ?? defaults.alignment, DIVINE_INFERNAL_LIMITS.minAlignment, DIVINE_INFERNAL_LIMITS.maxAlignment),
    behavior,
    possessedByDemon: kind === "npc" && Boolean(input.possessedByDemon),
  };
}

function corruptedBehavior(corruption) {
  if (corruption >= 70) return "hostile_corrupted";
  if (corruption >= 40) return "corrupted";
  if (corruption >= 15) return "uneasy";
  return "civilian";
}

function restoredBehavior(corruption) {
  if (corruption <= 0) return "restored";
  if (corruption < 40) return "recovering";
  return corruptedBehavior(corruption);
}

function eventMessage(type, targetId) {
  const messages = {
    soul_taker_impact: `${targetId} was struck by infernal influence.`,
    npc_corrupted: `${targetId}'s behavior has turned hostile and corrupted.`,
    divine_light_impact: `${targetId} was healed and cleansed by divine light.`,
    npc_saved: `${targetId} was pulled back from incapacitation.`,
    demon_released: `A demon was released from ${targetId}.`,
    infernal_defeated: `${targetId} was defeated by an authorized golden round.`,
    projectile_resisted: `${targetId} resisted this supernatural projectile.`,
    invalid_wielder: `The wielder lacks authority for this projectile.`,
  };
  return messages[type] ?? "A supernatural event occurred.";
}

function eventPresentation(type) {
  if (["soul_taker_impact", "npc_corrupted"].includes(type)) return { tone: "infernal", icon: "flame" };
  if (["divine_light_impact", "npc_saved", "demon_released", "infernal_defeated"].includes(type)) return { tone: "divine", icon: "halo" };
  return { tone: "neutral", icon: "shield" };
}

export function createEasterEggGameplaySystem({
  seed = "sin-city-easter-eggs-2026",
  approvedDivineWielderIds = [],
  entities = [],
  eventLimit = 128,
} = {}) {
  if (!Array.isArray(approvedDivineWielderIds) || approvedDivineWielderIds.length > DIVINE_INFERNAL_LIMITS.maxApprovedDivineWielders) {
    throw new RangeError(`approvedDivineWielderIds supports at most ${DIVINE_INFERNAL_LIMITS.maxApprovedDivineWielders} entries.`);
  }
  const approvedWielders = new Set(approvedDivineWielderIds.map((id) => normalizeId(id, "approved divine wielder id")));
  const boundedEventLimit = Math.trunc(clamp(eventLimit, 1, DIVINE_INFERNAL_LIMITS.maxEvents));
  const entityMap = new Map();
  const eventLog = [];
  let sequence = 0;
  let releasedDemonSequence = 0;

  const emit = (type, details = {}) => {
    sequence += 1;
    const presentation = eventPresentation(type);
    const event = deepFreeze({
      id: `ee-event-${String(sequence).padStart(6, "0")}`,
      version: SCHEMA_VERSION,
      type,
      atMs: Number.isFinite(details.atMs) ? Math.max(0, Math.trunc(details.atMs)) : 0,
      title: String(details.title ?? type.replaceAll("_", " ")).toUpperCase(),
      message: String(details.message ?? eventMessage(type, details.targetEntityId ?? "The target")),
      tone: presentation.tone,
      icon: presentation.icon,
      projectileId: details.projectileId ?? null,
      sourceEntityId: details.sourceEntityId ?? null,
      targetEntityId: details.targetEntityId ?? null,
      data: deepFreeze(copy(details.data ?? {})),
    });
    eventLog.push(event);
    if (eventLog.length > boundedEventLimit) eventLog.splice(0, eventLog.length - boundedEventLimit);
    return event;
  };

  const registerEntity = (input) => {
    if (!entityMap.has(String(input?.id ?? "")) && entityMap.size >= DIVINE_INFERNAL_LIMITS.maxEntities) {
      throw new RangeError(`The easter-egg system supports at most ${DIVINE_INFERNAL_LIMITS.maxEntities} entities.`);
    }
    const entity = normalizeEntity(input);
    entityMap.set(entity.id, entity);
    return deepFreeze(copy(entity));
  };

  entities.forEach(registerEntity);

  const shooterEntity = (shooter) => {
    const id = typeof shooter === "string" ? shooter : shooter?.id;
    if (!id) return null;
    return entityMap.get(String(id)) ?? null;
  };

  const isValidWielder = (projectileId, shooter) => {
    const source = shooterEntity(shooter);
    if (!source || !source.alive) return false;
    if (projectileId === "soulTaker") return source.kind === "devil";
    if (projectileId === "divineLight") return source.kind === "jesus";
    return source.kind === "jesus" || approvedWielders.has(source.id);
  };

  const result = (ok, outcome, target, eventsForHit, extra = {}) => deepFreeze({
    ok,
    outcome,
    target: target ? copy(target) : null,
    events: eventsForHit.map(copy),
    ...extra,
  });

  const applyProjectileHit = ({ projectileId, shooter, targetId, atMs = 0 } = {}) => {
    if (!PROJECTILE_IDS.has(projectileId)) {
      return result(false, "unknown_projectile", null, [], { error: `Unknown projectile: ${String(projectileId)}` });
    }
    const target = entityMap.get(String(targetId ?? ""));
    if (!target) return result(false, "target_not_found", null, [], { error: "Target is not registered." });
    const source = shooterEntity(shooter);
    if (!isValidWielder(projectileId, shooter)) {
      const denied = emit("invalid_wielder", {
        atMs,
        projectileId,
        sourceEntityId: source?.id ?? null,
        targetEntityId: target.id,
      });
      return result(false, "invalid_wielder", target, [denied]);
    }

    if (projectileId === "soulTaker") {
      if (target.kind !== "npc" || target.ageBand !== "adult" || !target.alive) {
        const resisted = emit("projectile_resisted", {
          atMs,
          projectileId,
          sourceEntityId: source.id,
          targetEntityId: target.id,
          data: { reason: "adult_living_npc_required" },
        });
        return result(true, "ineligible_target", target, [resisted]);
      }
      const projectile = DIVINE_INFERNAL_CATALOG.projectiles.soulTaker;
      const previousCorruption = target.corruption;
      target.health = clamp(target.health - projectile.healthDamage, 0, target.maxHealth);
      target.alive = target.health > 0;
      target.corruption = clamp(target.corruption + projectile.corruptionGain, 0, DIVINE_INFERNAL_LIMITS.maxCorruption);
      target.alignment = clamp(target.alignment + projectile.alignmentShift, DIVINE_INFERNAL_LIMITS.minAlignment, DIVINE_INFERNAL_LIMITS.maxAlignment);
      target.behavior = corruptedBehavior(target.corruption);
      if (target.corruption >= 70) target.possessedByDemon = true;
      const impact = emit("soul_taker_impact", {
        atMs,
        projectileId,
        sourceEntityId: source.id,
        targetEntityId: target.id,
        data: {
          healthDamage: projectile.healthDamage,
          corruptionBefore: previousCorruption,
          corruptionAfter: target.corruption,
          behavior: target.behavior,
        },
      });
      const eventsForHit = [impact];
      if (previousCorruption < 70 && target.corruption >= 70) {
        eventsForHit.push(emit("npc_corrupted", {
          atMs,
          projectileId,
          sourceEntityId: source.id,
          targetEntityId: target.id,
          data: { behavior: target.behavior, possessedByDemon: true },
        }));
      }
      return result(true, "corrupted", target, eventsForHit);
    }

    if (projectileId === "divineLight") {
      if (target.kind !== "npc" || target.ageBand !== "adult" || (!target.alive && !target.revivable)) {
        const resisted = emit("projectile_resisted", {
          atMs,
          projectileId,
          sourceEntityId: source.id,
          targetEntityId: target.id,
          data: { reason: "adult_npc_required" },
        });
        return result(true, "ineligible_target", target, [resisted]);
      }
      const projectile = DIVINE_INFERNAL_CATALOG.projectiles.divineLight;
      const wasIncapacitated = !target.alive;
      const wasPossessed = target.possessedByDemon || target.corruption >= 70;
      const corruptionBefore = target.corruption;
      target.health = wasIncapacitated
        ? clamp(projectile.reviveHealth, 1, target.maxHealth)
        : clamp(target.health + projectile.healing, 0, target.maxHealth);
      target.alive = true;
      target.corruption = clamp(target.corruption - projectile.corruptionCleanse, 0, DIVINE_INFERNAL_LIMITS.maxCorruption);
      target.alignment = clamp(target.alignment + projectile.alignmentShift, DIVINE_INFERNAL_LIMITS.minAlignment, DIVINE_INFERNAL_LIMITS.maxAlignment);
      target.behavior = restoredBehavior(target.corruption);
      target.possessedByDemon = false;
      const eventsForHit = [emit("divine_light_impact", {
        atMs,
        projectileId,
        sourceEntityId: source.id,
        targetEntityId: target.id,
        data: {
          healing: wasIncapacitated ? projectile.reviveHealth : projectile.healing,
          corruptionBefore,
          corruptionAfter: target.corruption,
          behavior: target.behavior,
        },
      })];
      if (wasIncapacitated) {
        eventsForHit.push(emit("npc_saved", {
          atMs,
          projectileId,
          sourceEntityId: source.id,
          targetEntityId: target.id,
          data: { healthAfter: target.health },
        }));
      }
      let releasedDemonId = null;
      if (wasPossessed) {
        releasedDemonSequence += 1;
        releasedDemonId = normalizeId(`released-demon-${target.id}-${releasedDemonSequence}`);
        if (entityMap.size < DIVINE_INFERNAL_LIMITS.maxEntities) {
          registerEntity({
            id: releasedDemonId,
            kind: "demon",
            health: DIVINE_INFERNAL_LIMITS.releasedDemonMaxHealth,
            maxHealth: DIVINE_INFERNAL_LIMITS.releasedDemonMaxHealth,
          });
          eventsForHit.push(emit("demon_released", {
            atMs,
            projectileId,
            sourceEntityId: source.id,
            targetEntityId: target.id,
            data: { releasedDemonId },
          }));
        } else {
          releasedDemonId = null;
        }
      }
      return result(true, wasIncapacitated ? "saved" : "healed_and_cleansed", target, eventsForHit, { releasedDemonId });
    }

    if (!["demon", "devil"].includes(target.kind) || !target.alive) {
      const resisted = emit("projectile_resisted", {
        atMs,
        projectileId,
        sourceEntityId: source.id,
        targetEntityId: target.id,
        data: { reason: "infernal_living_target_required" },
      });
      return result(true, "ineligible_target", target, [resisted]);
    }
    const projectile = DIVINE_INFERNAL_CATALOG.projectiles.goldenPistol;
    const damage = target.kind === "devil" ? projectile.devilDamage : projectile.demonDamage;
    target.health = clamp(target.health - damage, 0, target.maxHealth);
    target.alive = target.health > 0;
    const eventsForHit = [];
    if (!target.alive) {
      eventsForHit.push(emit("infernal_defeated", {
        atMs,
        projectileId,
        sourceEntityId: source.id,
        targetEntityId: target.id,
        data: { targetKind: target.kind, damage },
      }));
    }
    return result(true, target.alive ? "damaged" : "defeated", target, eventsForHit, { damage });
  };

  const getEntity = (id) => {
    const entity = entityMap.get(String(id));
    return entity ? deepFreeze(copy(entity)) : null;
  };
  const getUiEvents = ({ afterEventId = null } = {}) => {
    const index = afterEventId ? eventLog.findIndex((event) => event.id === afterEventId) : -1;
    return deepFreeze(copy(eventLog.slice(index + 1)));
  };
  const drainUiEvents = () => {
    const drained = copy(eventLog);
    eventLog.length = 0;
    return deepFreeze(drained);
  };
  const snapshot = () => deepFreeze({
    version: SCHEMA_VERSION,
    seed: String(seed),
    sequence,
    entities: Array.from(entityMap.values(), (entity) => copy(entity)),
    events: copy(eventLog),
  });

  return Object.freeze({
    registerEntity,
    applyProjectileHit,
    getEntity,
    getUiEvents,
    drainUiEvents,
    snapshot,
    catalog: DIVINE_INFERNAL_CATALOG,
    limits: DIVINE_INFERNAL_LIMITS,
  });
}

const CRAFT_CLASS_CATALOG = deepFreeze([
  { id: "scoutDisc", code: "SD", label: "Scout Disc", weight: 18, speed: [102, 128], acceleration: [18, 24], handling: [0.82, 0.96], health: [170, 230], fuel: [82, 112], burn: [0.2, 0.3], seats: [1, 2], cargo: [1, 4], cloak: [4, 8], tractor: [0.05, 0.18], hardpoints: [0, 1] },
  { id: "crescentInterceptor", code: "CI", label: "Crescent Interceptor", weight: 13, speed: [112, 132], acceleration: [20, 25], handling: [0.78, 0.93], health: [210, 280], fuel: [76, 105], burn: [0.23, 0.34], seats: [1, 2], cargo: [0, 2], cloak: [2, 6], tractor: [0, 0.08], hardpoints: [1, 2] },
  { id: "surveyOrb", code: "SO", label: "Survey Orb", weight: 15, speed: [72, 94], acceleration: [11, 17], handling: [0.88, 0.98], health: [150, 210], fuel: [100, 140], burn: [0.1, 0.18], seats: [1, 3], cargo: [3, 8], cloak: [5, 8], tractor: [0.18, 0.38], hardpoints: [0, 0] },
  { id: "cargoDisc", code: "CD", label: "Cargo Disc", weight: 14, speed: [68, 88], acceleration: [9, 14], handling: [0.48, 0.66], health: [300, 420], fuel: [125, 160], burn: [0.25, 0.36], seats: [3, 8], cargo: [18, 28], cloak: [0, 2], tractor: [0.42, 0.7], hardpoints: [0, 1] },
  { id: "researchSkiff", code: "RS", label: "Research Skiff", weight: 16, speed: [82, 106], acceleration: [13, 19], handling: [0.7, 0.88], health: [220, 300], fuel: [110, 150], burn: [0.14, 0.24], seats: [2, 6], cargo: [8, 16], cloak: [3, 7], tractor: [0.25, 0.52], hardpoints: [0, 0] },
  { id: "silentManta", code: "SM", label: "Silent Manta", weight: 10, speed: [94, 118], acceleration: [16, 22], handling: [0.76, 0.92], health: [190, 270], fuel: [92, 126], burn: [0.16, 0.27], seats: [1, 4], cargo: [4, 10], cloak: [6, 8], tractor: [0.08, 0.26], hardpoints: [0, 1] },
  { id: "ionCourier", code: "IC", label: "Ion Courier", weight: 9, speed: [98, 124], acceleration: [19, 24], handling: [0.8, 0.94], health: [180, 245], fuel: [90, 125], burn: [0.18, 0.28], seats: [1, 3], cargo: [6, 14], cloak: [1, 5], tractor: [0.02, 0.14], hardpoints: [0, 0] },
  { id: "rescuePod", code: "RP", label: "Rescue Pod", weight: 5, speed: [76, 98], acceleration: [14, 20], handling: [0.74, 0.9], health: [260, 340], fuel: [118, 155], burn: [0.12, 0.2], seats: [2, 5], cargo: [5, 12], cloak: [0, 3], tractor: [0.12, 0.3], hardpoints: [0, 0] },
]);

export const AREA_51_CRAFT_CLASSES = CRAFT_CLASS_CATALOG;

export const AREA_51_MANIFEST_LIMITS = deepFreeze({
  minCraft: 12,
  maxCraft: 48,
  minHangars: 2,
  maxHangars: 6,
  maxSpeed: 132,
  maxAcceleration: 25,
  maxHealth: 420,
  maxFuel: 160,
  maxSeats: 8,
  maxCargo: 28,
  maxCloakSeconds: 8,
  maxTractorStrength: 0.7,
  maxWeaponHardpoints: 2,
});

function hashSeed(value) {
  const text = String(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = hashSeed(seed) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

const range = (rng, [min, max], integer = false) => {
  const value = min + (max - min) * rng();
  return integer ? Math.round(value) : round(value);
};

function weightedCraftClass(rng) {
  const total = CRAFT_CLASS_CATALOG.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = rng() * total;
  for (const entry of CRAFT_CLASS_CATALOG) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return CRAFT_CLASS_CATALOG.at(-1);
}

export function generateArea51HangarManifest({
  seed = "groom-lake-hangar-2026",
  count = 28,
  hangarCount = 4,
} = {}) {
  if (!Number.isInteger(count) || count < AREA_51_MANIFEST_LIMITS.minCraft || count > AREA_51_MANIFEST_LIMITS.maxCraft) {
    throw new RangeError(`count must be an integer from ${AREA_51_MANIFEST_LIMITS.minCraft} to ${AREA_51_MANIFEST_LIMITS.maxCraft}.`);
  }
  if (!Number.isInteger(hangarCount) || hangarCount < AREA_51_MANIFEST_LIMITS.minHangars || hangarCount > AREA_51_MANIFEST_LIMITS.maxHangars) {
    throw new RangeError(`hangarCount must be an integer from ${AREA_51_MANIFEST_LIMITS.minHangars} to ${AREA_51_MANIFEST_LIMITS.maxHangars}.`);
  }
  const normalizedSeed = String(seed).slice(0, 128);
  const rng = seededRandom(`${normalizedSeed}:${count}:${hangarCount}`);
  const manifestHash = hashSeed(`${normalizedSeed}:${count}:${hangarCount}`).toString(36).toUpperCase();
  const classCounts = Object.fromEntries(CRAFT_CLASS_CATALOG.map((entry) => [entry.id, 0]));
  const hangars = Array.from({ length: hangarCount }, (_, index) => ({
    id: `A51-H${String(index + 1).padStart(2, "0")}`,
    label: `Area 51 Flight Hangar ${index + 1}`,
    craftIds: [],
  }));
  const craft = [];

  for (let index = 0; index < count; index += 1) {
    const classSpec = weightedCraftClass(rng);
    const hangarIndex = index % hangarCount;
    const bayIndex = Math.floor(index / hangarCount) + 1;
    const serial = String(index + 1).padStart(3, "0");
    const id = `A51-${classSpec.code}-${serial}-${manifestHash.slice(0, 5)}`;
    const cloakSeconds = range(rng, classSpec.cloak);
    const entry = {
      id,
      classId: classSpec.id,
      label: `${classSpec.label} ${serial}`,
      hangarId: hangars[hangarIndex].id,
      bayIndex,
      localPosition: {
        x: round(((bayIndex - 1) % 4 - 1.5) * 9.5),
        y: 0.8,
        z: round((Math.floor((bayIndex - 1) / 4) - 1) * 11),
        yaw: hangarIndex % 2 === 0 ? 0 : Math.PI,
      },
      stats: {
        maxSpeed: range(rng, classSpec.speed),
        acceleration: range(rng, classSpec.acceleration),
        handling: range(rng, classSpec.handling),
        maxHealth: range(rng, classSpec.health, true),
        fuelCapacity: range(rng, classSpec.fuel, true),
        fuelBurnPerSecond: range(rng, classSpec.burn),
        seats: range(rng, classSpec.seats, true),
        cargoUnits: range(rng, classSpec.cargo, true),
        cloakSeconds,
        cloakCooldownSeconds: cloakSeconds > 0 ? range(rng, [22, 45]) : 0,
        tractorStrength: range(rng, classSpec.tractor),
        weaponHardpoints: range(rng, classSpec.hardpoints, true),
      },
      capabilities: {
        flyable: true,
        hover: true,
        verticalTakeoff: true,
        infiniteFuel: false,
        invulnerable: false,
        unrestrictedWarp: false,
        serverAuthorityRequired: true,
      },
    };
    classCounts[classSpec.id] += 1;
    hangars[hangarIndex].craftIds.push(id);
    craft.push(entry);
  }

  return deepFreeze({
    version: SCHEMA_VERSION,
    manifestId: `area51-${manifestHash}-${count}`,
    seed: normalizedSeed,
    facilityId: "area51-flight-research-complex",
    craftCount: craft.length,
    hangarCount: hangars.length,
    classCounts,
    hangars,
    craft,
    authority: {
      inventoryOwner: "server",
      clientMayCreateCraft: false,
      dynamicCapabilitiesAllowed: false,
    },
  });
}

export function validateArea51HangarManifest(manifest) {
  const errors = [];
  if (!manifest || typeof manifest !== "object" || !Array.isArray(manifest.craft)) {
    return { ok: false, errors: ["manifest.craft must be an array."] };
  }
  if (manifest.craft.length < AREA_51_MANIFEST_LIMITS.minCraft || manifest.craft.length > AREA_51_MANIFEST_LIMITS.maxCraft) {
    errors.push("craft count is outside the Area 51 hangar bound.");
  }
  const ids = new Set();
  manifest.craft.forEach((craft, index) => {
    const prefix = `craft[${index}]`;
    if (!craft || typeof craft !== "object") {
      errors.push(`${prefix} must be an object.`);
      return;
    }
    if (ids.has(craft.id)) errors.push(`${prefix}.id is duplicated.`);
    ids.add(craft.id);
    if (!CRAFT_CLASS_CATALOG.some((entry) => entry.id === craft.classId)) errors.push(`${prefix}.classId is unsupported.`);
    const stats = craft.stats ?? {};
    if (!(stats.maxSpeed > 0 && stats.maxSpeed <= AREA_51_MANIFEST_LIMITS.maxSpeed)) errors.push(`${prefix}.stats.maxSpeed is unbounded.`);
    if (!(stats.acceleration > 0 && stats.acceleration <= AREA_51_MANIFEST_LIMITS.maxAcceleration)) errors.push(`${prefix}.stats.acceleration is unbounded.`);
    if (!(stats.maxHealth > 0 && stats.maxHealth <= AREA_51_MANIFEST_LIMITS.maxHealth)) errors.push(`${prefix}.stats.maxHealth is unbounded.`);
    if (!(stats.fuelCapacity > 0 && stats.fuelCapacity <= AREA_51_MANIFEST_LIMITS.maxFuel)) errors.push(`${prefix}.stats.fuelCapacity is unbounded.`);
    if (!(stats.fuelBurnPerSecond > 0)) errors.push(`${prefix}.stats.fuelBurnPerSecond must be positive.`);
    if (!(stats.seats >= 1 && stats.seats <= AREA_51_MANIFEST_LIMITS.maxSeats)) errors.push(`${prefix}.stats.seats is unbounded.`);
    if (!(stats.cargoUnits >= 0 && stats.cargoUnits <= AREA_51_MANIFEST_LIMITS.maxCargo)) errors.push(`${prefix}.stats.cargoUnits is unbounded.`);
    if (!(stats.cloakSeconds >= 0 && stats.cloakSeconds <= AREA_51_MANIFEST_LIMITS.maxCloakSeconds)) errors.push(`${prefix}.stats.cloakSeconds is unbounded.`);
    if (!(stats.tractorStrength >= 0 && stats.tractorStrength <= AREA_51_MANIFEST_LIMITS.maxTractorStrength)) errors.push(`${prefix}.stats.tractorStrength is unbounded.`);
    if (!(stats.weaponHardpoints >= 0 && stats.weaponHardpoints <= AREA_51_MANIFEST_LIMITS.maxWeaponHardpoints)) errors.push(`${prefix}.stats.weaponHardpoints is unbounded.`);
    if (craft.capabilities?.infiniteFuel !== false || craft.capabilities?.invulnerable !== false || craft.capabilities?.unrestrictedWarp !== false) {
      errors.push(`${prefix}.capabilities contains an unbounded capability.`);
    }
  });
  return deepFreeze({ ok: errors.length === 0, errors });
}

export default createEasterEggGameplaySystem;
