import { expect, test } from "@playwright/test";
import {
  applyCollisionDamage,
  applyVehicleDynamicsToObject,
  commandVehicleDoor,
  createBufferedVehicleDynamicsRuntime,
  createVehicleDynamicsState,
  deriveVehicleDamageVisuals,
  deriveVehiclePerformance,
  evaluateVehicleNpcImpact,
  normalizeVehicleDynamicsState,
  serializeVehicleDynamicsState,
  stepVehicleDynamics,
  stepWheelAnimation,
} from "../src/vehicleDynamics.js";

test.describe("vehicle dynamics contract", () => {
  test("creates a serializable pristine state", () => {
    const state = createVehicleDynamicsState({ wheelRadiusM: 0.4 });
    expect(state.version).toBe(1);
    expect(state.damage.structural).toBe(0);
    expect(state.damage.externalStage).toBe(0);
    expect(state.performance.engineCanRun).toBe(true);
    expect(state.wheels.frontLeft.radiusM).toBe(0.4);
    expect(() => JSON.stringify(state)).not.toThrow();
  });

  test("rotates all tires from linear speed and steers only the front axle", () => {
    const state = createVehicleDynamicsState({ wheelRadiusM: 0.4 });
    const next = stepWheelAnimation(state, { speedMps: 8, steeringInput: 1 }, 0.1);
    expect(next.wheels.frontLeft.spinRad).toBeCloseTo(-2, 6);
    expect(next.wheels.rearRight.spinRad).toBeCloseTo(-2, 6);
    expect(next.wheels.frontLeft.steerRad).toBeGreaterThan(0.3);
    expect(next.wheels.frontRight.steerRad).toBeCloseTo(next.wheels.frontLeft.steerRad, 8);
    expect(next.wheels.rearLeft.steerRad).toBe(0);
    expect(state.wheels.frontLeft.spinRad).toBe(0);
  });

  test("reverse motion spins the wheels in the opposite direction", () => {
    const state = createVehicleDynamicsState({ wheelRadiusM: 0.5 });
    const next = stepWheelAnimation(state, { speedMps: -5 }, 0.1);
    expect(next.wheels.frontLeft.spinRad).toBeCloseTo(1, 6);
  });

  test("reduces steering lock at highway speed", () => {
    const state = createVehicleDynamicsState();
    const slow = stepWheelAnimation(state, { speedMps: 4, steeringInput: 1 }, 0.2);
    const fast = stepWheelAnimation(state, { speedMps: 42, steeringInput: 1 }, 0.2);
    expect(Math.abs(fast.wheels.frontLeft.steerRad)).toBeLessThan(Math.abs(slow.wheels.frontLeft.steerRad) * 0.5);
  });

  test("opens and closes a driver door through deterministic hinge phases", () => {
    let state = createVehicleDynamicsState();
    const command = commandVehicleDoor(state, "driver", true, { vehicleSpeedMps: 0 });
    expect(command.accepted).toBe(true);
    state = stepVehicleDynamics(command.state, { speedMps: 0 }, 0.21);
    expect(state.doors.driver.phase).toBe("opening");
    expect(state.doors.driver.progress).toBeCloseTo(0.5, 5);
    state = stepVehicleDynamics(state, { speedMps: 0 }, 0.21);
    expect(state.doors.driver.phase).toBe("open");
    expect(state.doors.driver.angleRad).toBeCloseTo(1.18, 5);
    state = commandVehicleDoor(state, "driver", false).state;
    state = stepVehicleDynamics(state, { speedMps: 0 }, 0.17);
    expect(state.doors.driver.phase).toBe("closing");
    state = stepVehicleDynamics(state, { speedMps: 0 }, 0.17);
    expect(state.doors.driver.phase).toBe("closed");
  });

  test("blocks opening while moving and auto-closes an open door", () => {
    const state = createVehicleDynamicsState();
    expect(commandVehicleDoor(state, "driver", true, { vehicleSpeedMps: 7 }).reason).toBe("vehicle_moving");
    let open = commandVehicleDoor(state, "driver", true, { vehicleSpeedMps: 0 }).state;
    open = stepVehicleDynamics(open, { speedMps: 0 }, 0.25);
    open = stepVehicleDynamics(open, { speedMps: 0 }, 0.25);
    const moving = stepVehicleDynamics(open, { speedMps: 8 }, 0.1);
    expect(moving.doors.driver.targetOpen).toBe(false);
    expect(moving.doors.driver.phase).toBe("closing");
  });

  test("ignores sub-threshold parking nudges", () => {
    const result = applyCollisionDamage(createVehicleDynamicsState(), {
      impulseNs: 2_500,
      relativeSpeedMps: 1.2,
      zone: "front",
    });
    expect(result.event.applied).toBe(false);
    expect(result.state.damage.structural).toBe(0);
    expect(result.state.damage.externalStage).toBe(0);
  });

  test("front collisions dent bodywork and damage engine and steering", () => {
    const result = applyCollisionDamage(createVehicleDynamicsState(), {
      impulseNs: 31_000,
      relativeSpeedMps: 18,
      zone: "front",
    });
    expect(result.event.applied).toBe(true);
    expect(result.state.damage.externalStage).toBeGreaterThanOrEqual(2);
    expect(result.state.damage.zones.front).toBeGreaterThan(result.state.damage.zones.rear);
    expect(result.state.damage.internal.engine).toBeGreaterThan(result.state.damage.internal.transmission);
    expect(result.state.damage.internal.steering).toBeGreaterThan(0);
  });

  test("rear collisions preferentially damage fuel system and transmission", () => {
    const result = applyCollisionDamage(createVehicleDynamicsState(), {
      impulseNs: 42_000,
      relativeSpeedMps: 23,
      zone: "rear",
    });
    expect(result.state.damage.internal.fuelSystem).toBeGreaterThan(result.state.damage.internal.engine);
    expect(result.state.damage.internal.transmission).toBeGreaterThan(0);
    expect(result.state.fuelLeakLitersPerSecond).toBeGreaterThan(0);
    expect(deriveVehicleDamageVisuals(result.state).fuelLeak).toBe(true);
  });

  test("side impacts damage the tires on the struck side and produce steering pull", () => {
    const result = applyCollisionDamage(createVehicleDynamicsState(), {
      impulseNs: 39_000,
      relativeSpeedMps: 20,
      zone: "left",
      wheelId: "frontLeft",
    });
    const tires = result.state.damage.internal.tires;
    expect(tires.frontLeft).toBeGreaterThan(tires.frontRight);
    expect(tires.rearLeft).toBeGreaterThan(tires.rearRight);
    expect(result.state.performance.steeringPull).toBeLessThan(0);
    expect(result.state.performance.gripMultiplier).toBeLessThan(1);
  });

  test("deduplicates a collision manifold across adjacent frames", () => {
    const first = applyCollisionDamage(createVehicleDynamicsState(), { impulseNs: 25_000, zone: "front" });
    const second = applyCollisionDamage(first.state, { impulseNs: 25_000, zone: "front" });
    expect(second.event.duplicateContact).toBe(true);
    expect(second.event.severity).toBeLessThan(first.event.severity * 0.1);
    const cooled = stepVehicleDynamics(second.state, {}, 0.13);
    const third = applyCollisionDamage(cooled, { impulseNs: 25_000, zone: "front" });
    expect(third.event.duplicateContact).toBe(false);
  });

  test("catastrophic collision creates a wrecked visual stage", () => {
    const result = applyCollisionDamage(createVehicleDynamicsState(), {
      impulseNs: 75_000,
      relativeSpeedMps: 40,
      zone: "chassis",
    });
    const visuals = deriveVehicleDamageVisuals(result.state);
    expect(visuals.stage).toBe(4);
    expect(visuals.label).toBe("wrecked");
    expect(visuals.sparks).toBe(true);
  });

  test("accumulated internal damage degrades handling and can disable engine", () => {
    let state = createVehicleDynamicsState();
    for (let index = 0; index < 8; index += 1) {
      state = stepVehicleDynamics(state, {}, 0.13);
      state = applyCollisionDamage(state, { impulseNs: 55_000, zone: "front" }).state;
    }
    const performance = deriveVehiclePerformance(state);
    expect(performance.accelerationMultiplier).toBe(0);
    expect(performance.maxSpeedMultiplier).toBe(0);
    expect(performance.engineCanRun).toBe(false);
    expect(state.disabled).toBe(true);
  });

  test("evaluates escalating vehicle-to-NPC impact outcomes including lethality", () => {
    expect(evaluateVehicleNpcImpact({ speedMps: 2 }).outcome).toBe("none");
    expect(evaluateVehicleNpcImpact({ speedMps: 6 }).outcome).toBe("stagger");
    expect(evaluateVehicleNpcImpact({ speedMps: 9 }).outcome).toBe("knockdown");
    expect(evaluateVehicleNpcImpact({ speedMps: 13 }).outcome).toBe("critical");
    const fatal = evaluateVehicleNpcImpact({
      speedMps: 21,
      vehicleMassKg: 1_800,
      npcHealth: 100,
      direction: { x: 1, z: 0 },
    });
    expect(fatal.outcome).toBe("fatal");
    expect(fatal.lethal).toBe(true);
    expect(fatal.damage).toBeGreaterThanOrEqual(100);
    expect(fatal.shouldRagdoll).toBe(true);
    expect(fatal.impulse.x).toBeGreaterThan(0);
  });

  test("never marks a slow collision lethal even against low remaining health", () => {
    const result = evaluateVehicleNpcImpact({ speedMps: 5, npcHealth: 1 });
    expect(result.lethal).toBe(false);
    expect(result.outcome).not.toBe("fatal");
  });

  test("applies wheel, door, and damage state to a Three-like vehicle object", () => {
    const rotation = () => ({ x: 0, y: 0, z: 0 });
    const wheels = Array.from({ length: 4 }, () => ({ rotation: rotation(), userData: {} }));
    const driverDoor = { rotation: rotation(), userData: {} };
    const damageStages = Array.from({ length: 5 }, () => ({ visible: false }));
    const object = { parts: { wheels, doors: { driver: driverDoor }, damageStages }, userData: {} };
    let state = createVehicleDynamicsState();
    state = commandVehicleDoor(state, "driver", true).state;
    state = stepVehicleDynamics(state, { speedMps: 2, steeringInput: 1 }, 0.2);
    state = applyCollisionDamage(state, { impulseNs: 28_000, zone: "front" }).state;
    const applied = applyVehicleDynamicsToObject(object, state);
    expect(applied.applied).toBe(true);
    expect(applied.wheelsApplied).toBe(4);
    expect(applied.doorsApplied).toBe(1);
    expect(wheels[0].rotation.x).not.toBe(0);
    expect(wheels[0].rotation.y).toBeGreaterThan(0);
    expect(wheels[1].rotation.y).toBe(0);
    expect(driverDoor.rotation.y).toBeGreaterThan(0);
    expect(damageStages[applied.visuals.stage].visible).toBe(true);
    expect(object.userData.externalDamageStage).toBe(applied.visuals.stage);
  });

  test("normalizes hostile save data and strips unknown fields", () => {
    const state = normalizeVehicleDynamicsState({
      wheels: { frontLeft: { spinRad: Infinity, radiusM: 99 } },
      doors: { driver: { progress: 88, targetOpen: true } },
      damage: { structural: 44, internal: { engine: -9, tires: { rearRight: 5 } } },
      unexpected: "not retained",
    });
    expect(state.wheels.frontLeft.spinRad).toBe(0);
    expect(state.wheels.frontLeft.radiusM).toBe(1.4);
    expect(state.doors.driver.progress).toBe(1);
    expect(state.damage.structural).toBe(1);
    expect(state.damage.internal.engine).toBe(0);
    expect(state.damage.internal.tires.rearRight).toBe(1);
    expect(state.unexpected).toBeUndefined();
    expect(serializeVehicleDynamicsState(state)).toEqual(state);
  });

  test("fixed-step runtime produces the same state across different frame chunks", () => {
    const a = createBufferedVehicleDynamicsRuntime();
    const b = createBufferedVehicleDynamicsRuntime();
    for (let index = 0; index < 12; index += 1) a.step({ speedMps: 10, steeringInput: 0.4 }, 1 / 60);
    for (let index = 0; index < 24; index += 1) b.step({ speedMps: 10, steeringInput: 0.4 }, 1 / 120);
    expect(a.getState()).toEqual(b.getState());
  });

  test("buffer runtime exposes collision, door, and visual adapters", () => {
    const runtime = createBufferedVehicleDynamicsRuntime();
    expect(runtime.commandDoor("driver", true, { vehicleSpeedMps: 0 }).accepted).toBe(true);
    expect(runtime.collide({ impulseNs: 30_000, zone: "rear" }).event.applied).toBe(true);
    const object = { parts: { wheels: [] }, userData: {} };
    expect(runtime.applyToObject(object).applied).toBe(true);
  });
});
