/**
 * Deterministic road-vehicle dynamics, damage, and animation helpers.
 *
 * This module deliberately has no Three.js dependency. The simulation functions
 * return serializable state and the small runtime adapter at the bottom applies
 * that state to any object with the existing Sin City RP `parts` convention.
 */

const PI = Math.PI;
const TWO_PI = PI * 2;

export const VEHICLE_DYNAMICS_VERSION = 1;

export const WHEEL_IDS = Object.freeze(["frontLeft", "rearLeft", "frontRight", "rearRight"]);
export const FRONT_WHEEL_IDS = Object.freeze(["frontLeft", "frontRight"]);
export const DOOR_IDS = Object.freeze(["driver", "frontPassenger", "rearLeft", "rearRight"]);
export const IMPACT_ZONES = Object.freeze(["front", "rear", "left", "right", "roof", "chassis"]);

const DAMAGE_STAGE_LABELS = Object.freeze(["pristine", "scuffed", "dented", "crumpled", "wrecked"]);

const DEFAULT_CONFIG = Object.freeze({
  wheel: Object.freeze({
    radiusM: 0.34,
    maxSteerRad: 0.58,
    steerResponsePerSecond: 11.5,
    steerReturnPerSecond: 15,
    highSpeedSteerStartMps: 11,
    highSpeedSteerEndMps: 42,
    highSpeedSteerMinimum: 0.31,
    flatTireWobbleRad: 0.105,
  }),
  door: Object.freeze({
    openSeconds: 0.42,
    closeSeconds: 0.34,
    maxAngleRad: 1.18,
    maxSafeOpenSpeedMps: 1.4,
    autoCloseSpeedMps: 3.2,
  }),
  collision: Object.freeze({
    cosmeticImpulseNs: 3_200,
    catastrophicImpulseNs: 44_000,
    hardWreckImpulseNs: 68_000,
    defaultVehicleMassKg: 1_520,
    restitution: 0.08,
    repeatedContactWindowSeconds: 0.12,
  }),
  impact: Object.freeze({
    referenceVehicleMassKg: 1_500,
    noInjuryDamage: 8,
    staggerDamage: 25,
    knockdownDamage: 60,
    baseDamageScale: 1.3,
    speedExponent: 1.55,
    minimumLethalSpeedMps: 15,
  }),
  simulation: Object.freeze({
    fixedStepSeconds: 1 / 120,
    maxFrameSeconds: 0.25,
    maxSubSteps: 30,
  }),
});

export const VEHICLE_DYNAMICS_DEFAULTS = DEFAULT_CONFIG;

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const finite = (value, fallback = 0) => (Number.isFinite(value) ? value : fallback);
const round = (value, precision = 1e9) => Math.round(value * precision) / precision;
const wrapRadians = (value) => {
  const wrapped = ((finite(value) + PI) % TWO_PI + TWO_PI) % TWO_PI - PI;
  return wrapped === -PI ? PI : wrapped;
};
const approachExp = (current, target, response, dt) => {
  const factor = 1 - Math.exp(-Math.max(0, response) * Math.max(0, dt));
  return current + (target - current) * factor;
};
const addDamage = (current, delta) => clamp(current + (1 - current) * Math.max(0, delta));

function mergeConfig(overrides = {}) {
  return {
    wheel: { ...DEFAULT_CONFIG.wheel, ...(overrides.wheel || {}) },
    door: { ...DEFAULT_CONFIG.door, ...(overrides.door || {}) },
    collision: { ...DEFAULT_CONFIG.collision, ...(overrides.collision || {}) },
    impact: { ...DEFAULT_CONFIG.impact, ...(overrides.impact || {}) },
    simulation: { ...DEFAULT_CONFIG.simulation, ...(overrides.simulation || {}) },
  };
}

function createWheelState(radiusM) {
  return {
    spinRad: 0,
    steerRad: 0,
    wobbleRad: 0,
    radiusM,
  };
}

function createDoorState() {
  return {
    phase: "closed",
    progress: 0,
    targetOpen: false,
    angleRad: 0,
  };
}

function createDamageState() {
  return {
    structural: 0,
    externalStage: 0,
    zones: {
      front: 0,
      rear: 0,
      left: 0,
      right: 0,
      roof: 0,
      chassis: 0,
    },
    internal: {
      engine: 0,
      transmission: 0,
      steering: 0,
      brakes: 0,
      fuelSystem: 0,
      tires: {
        frontLeft: 0,
        rearLeft: 0,
        frontRight: 0,
        rearRight: 0,
      },
    },
  };
}

function createCollisionState() {
  return {
    count: 0,
    lastImpulseNs: 0,
    lastRelativeSpeedMps: 0,
    lastZone: null,
    contactCooldownSeconds: 0,
  };
}

/** Create a clean, JSON-serializable dynamics snapshot. */
export function createVehicleDynamicsState(options = {}) {
  const config = mergeConfig(options.config);
  const wheelRadius = Number.isFinite(options.wheelRadiusM)
    ? clamp(options.wheelRadiusM, 0.12, 1.4)
    : config.wheel.radiusM;
  const wheels = Object.fromEntries(WHEEL_IDS.map((id) => [id, createWheelState(wheelRadius)]));
  const doors = Object.fromEntries(DOOR_IDS.map((id) => [id, createDoorState()]));
  const state = {
    version: VEHICLE_DYNAMICS_VERSION,
    elapsedSeconds: 0,
    wheels,
    doors,
    damage: createDamageState(),
    collision: createCollisionState(),
    performance: null,
    fuelLeakLitersPerSecond: 0,
    disabled: false,
  };
  state.performance = deriveVehiclePerformance(state);
  return state;
}

function cloneVehicleDynamicsState(source) {
  const base = source || createVehicleDynamicsState();
  return {
    version: VEHICLE_DYNAMICS_VERSION,
    elapsedSeconds: Math.max(0, finite(base.elapsedSeconds)),
    wheels: Object.fromEntries(WHEEL_IDS.map((id) => [id, { ...base.wheels?.[id] }])),
    doors: Object.fromEntries(DOOR_IDS.map((id) => [id, { ...base.doors?.[id] }])),
    damage: {
      structural: finite(base.damage?.structural),
      externalStage: Math.trunc(finite(base.damage?.externalStage)),
      zones: { ...base.damage?.zones },
      internal: {
        ...base.damage?.internal,
        tires: { ...base.damage?.internal?.tires },
      },
    },
    collision: { ...base.collision },
    performance: { ...base.performance },
    fuelLeakLitersPerSecond: Math.max(0, finite(base.fuelLeakLitersPerSecond)),
    disabled: Boolean(base.disabled),
  };
}

/**
 * Sanitizes save data or network state without trusting unknown fields.
 */
export function normalizeVehicleDynamicsState(source, options = {}) {
  const config = mergeConfig(options.config);
  const clean = createVehicleDynamicsState({ wheelRadiusM: options.wheelRadiusM, config });
  if (!source || typeof source !== "object") return clean;
  clean.elapsedSeconds = Math.max(0, finite(source.elapsedSeconds));

  for (const id of WHEEL_IDS) {
    const incoming = source.wheels?.[id] || {};
    clean.wheels[id] = {
      spinRad: wrapRadians(incoming.spinRad),
      steerRad: clamp(finite(incoming.steerRad), -config.wheel.maxSteerRad, config.wheel.maxSteerRad),
      wobbleRad: clamp(finite(incoming.wobbleRad), -config.wheel.flatTireWobbleRad, config.wheel.flatTireWobbleRad),
      radiusM: Number.isFinite(incoming.radiusM)
        ? clamp(incoming.radiusM, 0.12, 1.4)
        : clean.wheels[id].radiusM,
    };
  }

  for (const id of DOOR_IDS) {
    const incoming = source.doors?.[id] || {};
    const progress = clamp(incoming.progress);
    const targetOpen = Boolean(incoming.targetOpen);
    clean.doors[id] = {
      phase: progress <= 0 ? "closed" : progress >= 1 ? "open" : targetOpen ? "opening" : "closing",
      progress,
      targetOpen,
      angleRad: progress * config.door.maxAngleRad,
    };
  }

  clean.damage.structural = clamp(source.damage?.structural);
  for (const zone of IMPACT_ZONES) clean.damage.zones[zone] = clamp(source.damage?.zones?.[zone]);
  for (const key of ["engine", "transmission", "steering", "brakes", "fuelSystem"]) {
    clean.damage.internal[key] = clamp(source.damage?.internal?.[key]);
  }
  for (const id of WHEEL_IDS) clean.damage.internal.tires[id] = clamp(source.damage?.internal?.tires?.[id]);
  clean.damage.externalStage = getExternalDamageStage(clean.damage);
  clean.collision = {
    count: Math.max(0, Math.trunc(finite(source.collision?.count))),
    lastImpulseNs: Math.max(0, finite(source.collision?.lastImpulseNs)),
    lastRelativeSpeedMps: Math.max(0, finite(source.collision?.lastRelativeSpeedMps)),
    lastZone: IMPACT_ZONES.includes(source.collision?.lastZone) ? source.collision.lastZone : null,
    contactCooldownSeconds: clamp(source.collision?.contactCooldownSeconds, 0, 1),
  };
  clean.fuelLeakLitersPerSecond = deriveFuelLeakRate(clean.damage.internal.fuelSystem);
  clean.performance = deriveVehiclePerformance(clean);
  clean.disabled = !clean.performance.engineCanRun;
  return clean;
}

function getExternalDamageStage(damage) {
  const peakZone = Math.max(...IMPACT_ZONES.map((zone) => finite(damage.zones?.[zone])));
  const visualDamage = Math.max(finite(damage.structural), peakZone * 0.86);
  if (visualDamage >= 0.72) return 4;
  if (visualDamage >= 0.39) return 3;
  if (visualDamage >= 0.16) return 2;
  if (visualDamage >= 0.035) return 1;
  return 0;
}

function deriveFuelLeakRate(fuelSystemDamage) {
  const damage = clamp(fuelSystemDamage);
  if (damage < 0.28) return 0;
  return round((damage - 0.28) * 0.055, 1e6);
}

/**
 * Returns gameplay multipliers derived only from accumulated internal damage.
 * Damage values are 0 (healthy) to 1 (destroyed).
 */
export function deriveVehiclePerformance(state) {
  const internal = state?.damage?.internal || createDamageState().internal;
  const tires = WHEEL_IDS.map((id) => clamp(internal.tires?.[id]));
  const leftDamage = (tires[0] + tires[1]) * 0.5;
  const rightDamage = (tires[2] + tires[3]) * 0.5;
  const averageTireDamage = tires.reduce((sum, value) => sum + value, 0) / tires.length;
  const frontTireDamage = (tires[0] + tires[2]) * 0.5;
  const engine = clamp(internal.engine);
  const transmission = clamp(internal.transmission);
  const steering = clamp(internal.steering);
  const brakes = clamp(internal.brakes);
  const fuelSystem = clamp(internal.fuelSystem);

  const engineCanRun = engine < 0.96 && fuelSystem < 0.985;
  return {
    gripMultiplier: round(clamp((1 - averageTireDamage * 0.72) * (1 - steering * 0.12), 0.14, 1)),
    steeringMultiplier: round(clamp((1 - steering * 0.78) * (1 - frontTireDamage * 0.32), 0.12, 1)),
    accelerationMultiplier: round(engineCanRun ? clamp((1 - engine * 0.8) * (1 - transmission * 0.58), 0.08, 1) : 0),
    brakingMultiplier: round(clamp((1 - brakes * 0.82) * (1 - averageTireDamage * 0.38), 0.1, 1)),
    maxSpeedMultiplier: round(engineCanRun ? clamp((1 - engine * 0.64) * (1 - transmission * 0.36), 0.18, 1) : 0),
    steeringPull: round(clamp((rightDamage - leftDamage) * 0.32, -0.32, 0.32)),
    engineCanRun,
    fuelLeakLitersPerSecond: deriveFuelLeakRate(fuelSystem),
  };
}

function steerLimitAtSpeed(speedMps, config) {
  const speed = Math.abs(finite(speedMps));
  const range = Math.max(0.001, config.highSpeedSteerEndMps - config.highSpeedSteerStartMps);
  const fade = clamp((speed - config.highSpeedSteerStartMps) / range);
  return config.maxSteerRad * (1 - fade * (1 - config.highSpeedSteerMinimum));
}

/** Advance wheel spin and front-axle steering. */
export function stepWheelAnimation(state, input = {}, dtSeconds = 0, configOverrides = {}) {
  const config = mergeConfig(configOverrides).wheel;
  const next = cloneVehicleDynamicsState(state);
  const dt = clamp(dtSeconds, 0, 0.25);
  const speed = finite(input.speedMps);
  const steeringInput = clamp(finite(input.steeringInput), -1, 1);
  const steerLimit = steerLimitAtSpeed(speed, config) * next.performance.steeringMultiplier;
  const steerTarget = steeringInput * steerLimit + next.performance.steeringPull;
  const steerResponse = Math.abs(steeringInput) > 0.001 ? config.steerResponsePerSecond : config.steerReturnPerSecond;

  for (const id of WHEEL_IDS) {
    const wheel = next.wheels[id];
    const tireDamage = clamp(next.damage.internal.tires[id]);
    const effectiveRadius = wheel.radiusM * (1 - tireDamage * 0.1);
    wheel.spinRad = wrapRadians(wheel.spinRad - (speed * dt) / Math.max(0.08, effectiveRadius));
    const target = FRONT_WHEEL_IDS.includes(id) ? steerTarget : 0;
    wheel.steerRad = approachExp(wheel.steerRad, target, steerResponse, dt);
    wheel.wobbleRad = Math.sin(wheel.spinRad * 0.5) * config.flatTireWobbleRad * tireDamage;
  }
  return next;
}

/**
 * Request a hinged door state. Doors are blocked from opening at unsafe speed,
 * while closing is always accepted.
 */
export function commandVehicleDoor(state, doorId, open, options = {}) {
  const config = mergeConfig(options.config).door;
  const next = cloneVehicleDynamicsState(state);
  if (!DOOR_IDS.includes(doorId)) return { state: next, accepted: false, reason: "unknown_door" };
  if (open && Math.abs(finite(options.vehicleSpeedMps)) > config.maxSafeOpenSpeedMps && !options.force) {
    return { state: next, accepted: false, reason: "vehicle_moving" };
  }
  next.doors[doorId].targetOpen = Boolean(open);
  next.doors[doorId].phase = open
    ? next.doors[doorId].progress >= 1 ? "open" : "opening"
    : next.doors[doorId].progress <= 0 ? "closed" : "closing";
  return { state: next, accepted: true, reason: null };
}

/** Advance all door hinges and auto-close open doors once the car moves. */
export function stepDoorAnimation(state, input = {}, dtSeconds = 0, configOverrides = {}) {
  const config = mergeConfig(configOverrides).door;
  const next = cloneVehicleDynamicsState(state);
  const dt = clamp(dtSeconds, 0, 0.25);
  const moving = Math.abs(finite(input.speedMps)) >= config.autoCloseSpeedMps;

  for (const id of DOOR_IDS) {
    const door = next.doors[id];
    if (moving) door.targetOpen = false;
    const duration = door.targetOpen ? config.openSeconds : config.closeSeconds;
    const direction = door.targetOpen ? 1 : -1;
    door.progress = clamp(door.progress + direction * dt / Math.max(0.01, duration));
    door.phase = door.progress <= 0 ? "closed" : door.progress >= 1 ? "open" : door.targetOpen ? "opening" : "closing";
    door.angleRad = door.progress * config.maxAngleRad;
  }
  return next;
}

function resolveImpactZone(collision = {}) {
  if (IMPACT_ZONES.includes(collision.zone)) return collision.zone;
  const point = collision.localPoint || collision.localNormal || {};
  const x = finite(point.x);
  const y = finite(point.y);
  const z = finite(point.z);
  if (y > Math.max(Math.abs(x), Math.abs(z)) && y > 0.45) return "roof";
  if (Math.abs(z) >= Math.abs(x)) return z <= 0 ? "front" : "rear";
  return x <= 0 ? "left" : "right";
}

function calculateCollisionImpulse(collision, config) {
  if (Number.isFinite(collision.impulseNs)) return Math.max(0, collision.impulseNs);
  const massKg = Number.isFinite(collision.massKg)
    ? clamp(collision.massKg, 80, 20_000)
    : config.defaultVehicleMassKg;
  const relativeSpeedMps = Math.abs(finite(collision.relativeSpeedMps));
  const normalAlignment = clamp(collision.normalAlignment ?? 1, 0.15, 1);
  return massKg * relativeSpeedMps * (1 + config.restitution) * normalAlignment;
}

function collisionSeverity(impulseNs, config) {
  if (impulseNs <= config.cosmeticImpulseNs) return 0;
  const normalized = clamp(
    (impulseNs - config.cosmeticImpulseNs)
      / Math.max(1, config.catastrophicImpulseNs - config.cosmeticImpulseNs),
  );
  return Math.pow(normalized, 0.72);
}

function applyZoneInternalDamage(internal, zone, severity, collision) {
  const scaled = severity * (0.18 + severity * 0.42);
  const hardImpact = severity > 0.72;
  if (zone === "front") {
    internal.engine = addDamage(internal.engine, scaled * 0.78);
    internal.steering = addDamage(internal.steering, scaled * 0.52);
    internal.brakes = addDamage(internal.brakes, scaled * 0.2);
    internal.tires.frontLeft = addDamage(internal.tires.frontLeft, scaled * 0.34);
    internal.tires.frontRight = addDamage(internal.tires.frontRight, scaled * 0.34);
  } else if (zone === "rear") {
    internal.fuelSystem = addDamage(internal.fuelSystem, scaled * 0.88);
    internal.transmission = addDamage(internal.transmission, scaled * 0.42);
    internal.tires.rearLeft = addDamage(internal.tires.rearLeft, scaled * 0.25);
    internal.tires.rearRight = addDamage(internal.tires.rearRight, scaled * 0.25);
  } else if (zone === "left" || zone === "right") {
    const frontId = zone === "left" ? "frontLeft" : "frontRight";
    const rearId = zone === "left" ? "rearLeft" : "rearRight";
    internal.tires[frontId] = addDamage(internal.tires[frontId], scaled * 0.7);
    internal.tires[rearId] = addDamage(internal.tires[rearId], scaled * 0.62);
    internal.steering = addDamage(internal.steering, scaled * 0.34);
    internal.brakes = addDamage(internal.brakes, scaled * 0.28);
  } else if (zone === "roof") {
    internal.steering = addDamage(internal.steering, scaled * 0.12);
    internal.fuelSystem = addDamage(internal.fuelSystem, scaled * 0.08);
  } else {
    internal.transmission = addDamage(internal.transmission, scaled * 0.62);
    internal.brakes = addDamage(internal.brakes, scaled * 0.5);
    internal.fuelSystem = addDamage(internal.fuelSystem, scaled * 0.25);
  }

  if (WHEEL_IDS.includes(collision.wheelId)) {
    internal.tires[collision.wheelId] = addDamage(internal.tires[collision.wheelId], scaled * (hardImpact ? 1.2 : 0.88));
  }
}

/**
 * Apply a collision to the external body and internal components.
 * Returns both the next immutable state and an event suitable for VFX/audio.
 */
export function applyCollisionDamage(state, collision = {}, configOverrides = {}) {
  const config = mergeConfig(configOverrides).collision;
  const next = normalizeVehicleDynamicsState(state, { config: configOverrides });
  const impulseNs = calculateCollisionImpulse(collision, config);
  const relativeSpeedMps = Math.abs(finite(collision.relativeSpeedMps));
  const zone = resolveImpactZone(collision);
  let severity = collisionSeverity(impulseNs, config);

  // A contact manifold can report the same hit over multiple frames. The short
  // cooldown keeps that from multiplying damage while still allowing new hits.
  const duplicateContact = next.collision.contactCooldownSeconds > 0
    && next.collision.lastZone === zone
    && impulseNs <= next.collision.lastImpulseNs * 1.15;
  if (duplicateContact) severity *= 0.08;

  const previousStage = next.damage.externalStage;
  if (severity > 0) {
    const structuralDelta = severity * (0.18 + severity * 0.42);
    next.damage.structural = addDamage(next.damage.structural, structuralDelta);
    next.damage.zones[zone] = addDamage(next.damage.zones[zone], structuralDelta * 1.18);
    next.damage.zones.chassis = addDamage(next.damage.zones.chassis, structuralDelta * 0.18);
    applyZoneInternalDamage(next.damage.internal, zone, severity, collision);
    if (impulseNs >= config.hardWreckImpulseNs) {
      next.damage.structural = Math.max(next.damage.structural, 0.82);
      next.damage.zones[zone] = Math.max(next.damage.zones[zone], 0.94);
    }
    next.collision.count += 1;
  }

  next.collision.lastImpulseNs = round(impulseNs, 1e3);
  next.collision.lastRelativeSpeedMps = round(relativeSpeedMps);
  next.collision.lastZone = zone;
  next.collision.contactCooldownSeconds = config.repeatedContactWindowSeconds;
  next.damage.externalStage = getExternalDamageStage(next.damage);
  next.performance = deriveVehiclePerformance(next);
  next.fuelLeakLitersPerSecond = next.performance.fuelLeakLitersPerSecond;
  next.disabled = !next.performance.engineCanRun;

  return {
    state: next,
    event: {
      applied: severity > 0,
      duplicateContact,
      zone,
      impulseNs: next.collision.lastImpulseNs,
      relativeSpeedMps: next.collision.lastRelativeSpeedMps,
      severity: round(severity),
      previousStage,
      externalStage: next.damage.externalStage,
      stageChanged: previousStage !== next.damage.externalStage,
      disabled: next.disabled,
    },
  };
}

/** Describe the current visual damage without requiring a rendering engine. */
export function deriveVehicleDamageVisuals(state) {
  const damage = normalizeVehicleDynamicsState(state).damage;
  const stage = damage.externalStage;
  const peakZone = IMPACT_ZONES.reduce(
    (winner, zone) => damage.zones[zone] > damage.zones[winner] ? zone : winner,
    "chassis",
  );
  return {
    stage,
    label: DAMAGE_STAGE_LABELS[stage],
    primaryZone: peakZone,
    dentStrength: round(Math.max(damage.structural, damage.zones[peakZone])),
    paintScuffs: stage >= 1,
    crackedGlass: stage >= 2 && Math.max(damage.zones.front, damage.zones.roof) >= 0.22,
    smoke: damage.internal.engine >= 0.52,
    heavySmoke: damage.internal.engine >= 0.78,
    fuelLeak: damage.internal.fuelSystem >= 0.28,
    sparks: stage >= 3,
    wheelFailures: WHEEL_IDS.filter((id) => damage.internal.tires[id] >= 0.72),
  };
}

/**
 * Deterministic vehicle-versus-NPC injury evaluation. A high-speed impact can
 * be fatal; low-speed contacts remain non-lethal and can stagger or knock down.
 */
export function evaluateVehicleNpcImpact(input = {}, configOverrides = {}) {
  const config = mergeConfig(configOverrides).impact;
  const speedMps = Math.abs(finite(input.speedMps));
  const massKg = Number.isFinite(input.vehicleMassKg)
    ? clamp(input.vehicleMassKg, 100, 20_000)
    : config.referenceVehicleMassKg;
  const massFactor = Math.sqrt(massKg / config.referenceVehicleMassKg);
  const alignment = clamp(input.alignment ?? 1, 0.2, 1);
  const vulnerability = clamp(input.vulnerability ?? 1, 0.2, 3);
  const armorMultiplier = 1 - clamp(input.armorFraction, 0, 0.65);
  const health = Math.max(1, finite(input.npcHealth, 100));
  const rawDamage = Math.pow(speedMps, config.speedExponent)
    * config.baseDamageScale
    * massFactor
    * alignment
    * vulnerability
    * armorMultiplier;
  const damage = Math.max(0, Math.round(rawDamage));
  const lethal = speedMps >= config.minimumLethalSpeedMps && damage >= health;

  let outcome = "none";
  if (lethal) outcome = "fatal";
  else if (damage >= config.knockdownDamage) outcome = "critical";
  else if (damage >= config.staggerDamage) outcome = "knockdown";
  else if (damage >= config.noInjuryDamage) outcome = "stagger";

  const direction = input.direction || {};
  const length = Math.hypot(finite(direction.x), finite(direction.z)) || 1;
  const launchSpeedMps = clamp(speedMps * (outcome === "fatal" ? 0.54 : outcome === "critical" ? 0.42 : 0.26), 0, 14);
  return {
    outcome,
    damage,
    lethal,
    shouldRagdoll: ["knockdown", "critical", "fatal"].includes(outcome),
    reportAsVehicleAssault: damage >= config.staggerDamage,
    impulse: {
      x: round(finite(direction.x) / length * launchSpeedMps),
      y: round(outcome === "none" ? 0 : Math.min(4.5, 0.7 + speedMps * 0.12)),
      z: round(finite(direction.z) / length * launchSpeedMps),
    },
  };
}

/** Advance wheel, door, leak, cooldown, and derived handling state. */
export function stepVehicleDynamics(state, input = {}, dtSeconds = 0, configOverrides = {}) {
  const dt = clamp(dtSeconds, 0, 0.25);
  let next = normalizeVehicleDynamicsState(state, { config: configOverrides });
  next.performance = deriveVehiclePerformance(next);
  next = stepWheelAnimation(next, input, dt, configOverrides);
  next = stepDoorAnimation(next, input, dt, configOverrides);
  next.elapsedSeconds = round(next.elapsedSeconds + dt);
  next.collision.contactCooldownSeconds = Math.max(0, next.collision.contactCooldownSeconds - dt);
  next.fuelLeakLitersPerSecond = next.performance.fuelLeakLitersPerSecond;
  next.disabled = !next.performance.engineCanRun;
  return next;
}

function resolveDoorPart(parts, id) {
  return parts?.doors?.[id]
    || parts?.[`${id}Door`]
    || (id === "driver" ? parts?.driverDoor : null)
    || null;
}

function setDamageStageMeshes(parts, stage) {
  const stages = parts?.damageStages;
  if (!stages) return;
  if (Array.isArray(stages)) {
    stages.forEach((entry, index) => {
      if (entry) entry.visible = index === stage;
    });
    return;
  }
  for (const [key, entry] of Object.entries(stages)) {
    const index = Number(key);
    if (entry && Number.isFinite(index)) entry.visible = index === stage;
  }
}

/**
 * Apply a snapshot to the current Three.js-like entity parts. No Three import is
 * required, which keeps this helper testable and usable by server simulations.
 */
export function applyVehicleDynamicsToObject(vehicleObject, state, options = {}) {
  if (!vehicleObject || typeof vehicleObject !== "object") return { applied: false, reason: "missing_object" };
  const clean = normalizeVehicleDynamicsState(state, options);
  const wheels = vehicleObject.parts?.wheels || [];
  const wheelIndexMap = options.wheelIndexMap || {
    frontLeft: 0,
    rearLeft: 1,
    frontRight: 2,
    rearRight: 3,
  };
  let wheelsApplied = 0;
  for (const id of WHEEL_IDS) {
    const wheel = wheels[wheelIndexMap[id]];
    if (!wheel?.rotation) continue;
    const pose = clean.wheels[id];
    wheel.rotation.x = pose.spinRad;
    wheel.rotation.y = pose.steerRad;
    wheel.rotation.z = pose.wobbleRad;
    wheel.userData = wheel.userData || {};
    wheel.userData.tireDamage = clean.damage.internal.tires[id];
    wheelsApplied += 1;
  }

  const doorSigns = options.doorSigns || { driver: 1, frontPassenger: -1, rearLeft: 1, rearRight: -1 };
  let doorsApplied = 0;
  for (const id of DOOR_IDS) {
    const door = resolveDoorPart(vehicleObject.parts, id);
    if (!door?.rotation) continue;
    door.rotation.y = clean.doors[id].angleRad * finite(doorSigns[id], 1);
    door.visible = clean.doors[id].progress > 0.015;
    door.userData = door.userData || {};
    door.userData.doorPhase = clean.doors[id].phase;
    doorsApplied += 1;
  }

  const visuals = deriveVehicleDamageVisuals(clean);
  setDamageStageMeshes(vehicleObject.parts, visuals.stage);
  vehicleObject.userData = vehicleObject.userData || {};
  vehicleObject.userData.vehicleDynamicsVersion = VEHICLE_DYNAMICS_VERSION;
  vehicleObject.userData.externalDamageStage = visuals.stage;
  vehicleObject.userData.engineCondition = round(1 - clean.damage.internal.engine);
  vehicleObject.userData.fuelLeakLitersPerSecond = clean.fuelLeakLitersPerSecond;
  vehicleObject.userData.dynamicsDisabled = clean.disabled;
  if (typeof options.onDamageVisual === "function") options.onDamageVisual(vehicleObject, visuals, clean);
  return { applied: true, wheelsApplied, doorsApplied, visuals };
}

/**
 * Fixed-step buffer for smooth rendering with variable browser frame times.
 * Pure snapshots remain available through getState/setState for persistence.
 */
export function createBufferedVehicleDynamicsRuntime(options = {}) {
  const config = mergeConfig(options.config);
  let state = normalizeVehicleDynamicsState(options.initialState || createVehicleDynamicsState({
    wheelRadiusM: options.wheelRadiusM,
    config,
  }), { config });
  let accumulatorSeconds = 0;

  return {
    getState: () => cloneVehicleDynamicsState(state),
    setState: (nextState) => {
      state = normalizeVehicleDynamicsState(nextState, { config });
      accumulatorSeconds = 0;
      return cloneVehicleDynamicsState(state);
    },
    step(input = {}, frameSeconds = 0) {
      const frame = clamp(frameSeconds, 0, config.simulation.maxFrameSeconds);
      accumulatorSeconds += frame;
      let steps = 0;
      while (accumulatorSeconds + 1e-12 >= config.simulation.fixedStepSeconds && steps < config.simulation.maxSubSteps) {
        state = stepVehicleDynamics(state, input, config.simulation.fixedStepSeconds, config);
        accumulatorSeconds -= config.simulation.fixedStepSeconds;
        steps += 1;
      }
      let droppedSeconds = 0;
      if (steps >= config.simulation.maxSubSteps && accumulatorSeconds >= config.simulation.fixedStepSeconds) {
        droppedSeconds = accumulatorSeconds - (accumulatorSeconds % config.simulation.fixedStepSeconds);
        accumulatorSeconds %= config.simulation.fixedStepSeconds;
      }
      return {
        state: cloneVehicleDynamicsState(state),
        steps,
        interpolationAlpha: clamp(accumulatorSeconds / config.simulation.fixedStepSeconds),
        droppedSeconds: round(droppedSeconds),
      };
    },
    commandDoor(doorId, open, commandOptions = {}) {
      const result = commandVehicleDoor(state, doorId, open, { ...commandOptions, config });
      state = result.state;
      return { ...result, state: cloneVehicleDynamicsState(state) };
    },
    collide(collision) {
      const result = applyCollisionDamage(state, collision, config);
      state = result.state;
      return { ...result, state: cloneVehicleDynamicsState(state) };
    },
    applyToObject(vehicleObject, applyOptions = {}) {
      return applyVehicleDynamicsToObject(vehicleObject, state, { ...applyOptions, config });
    },
  };
}

export function serializeVehicleDynamicsState(state) {
  return JSON.parse(JSON.stringify(normalizeVehicleDynamicsState(state)));
}
