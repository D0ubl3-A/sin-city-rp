import { expect, test } from "@playwright/test";
import {
  LOCOMOTION_CODES,
  createMovementFailureTracker,
  distanceBetweenPositions,
} from "../src/movementRescueCore.js";

const origin = Object.freeze({ x: 10, y: 0.42, z: 20 });

function position(x = origin.x, y = origin.y, z = origin.z) {
  return { x, y, z };
}

test.describe("movement softlock detector", () => {
  test("recognizes only true locomotion controls", () => {
    expect(LOCOMOTION_CODES).toEqual([
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "ArrowUp",
      "ArrowDown",
    ]);
    expect(LOCOMOTION_CODES).not.toContain("ArrowLeft");
    expect(LOCOMOTION_CODES).not.toContain("ArrowRight");
  });

  test("requires two distinct failed directions while the player remains pinned", () => {
    const tracker = createMovementFailureTracker();
    const first = tracker.recordProbe({
      code: "KeyW",
      startPosition: origin,
      endPosition: position(10.01),
      at: 1_000,
    });
    const second = tracker.recordProbe({
      code: "KeyD",
      startPosition: position(10.01),
      endPosition: position(10.015),
      at: 1_500,
    });

    expect(first.shouldRescue).toBe(false);
    expect(second.shouldRescue).toBe(true);
    expect(second.failedDirections).toEqual(["KeyW", "KeyD"]);
  });

  test("does not rescue after healthy movement and clears earlier failures", () => {
    const tracker = createMovementFailureTracker();
    tracker.recordProbe({ code: "KeyW", startPosition: origin, endPosition: origin, at: 1_000 });
    const healthy = tracker.recordProbe({
      code: "KeyD",
      startPosition: origin,
      endPosition: position(10.5),
      at: 1_500,
    });
    const later = tracker.recordProbe({
      code: "KeyS",
      startPosition: position(10.5),
      endPosition: position(10.5),
      at: 2_000,
    });

    expect(healthy.moved).toBe(true);
    expect(healthy.shouldRescue).toBe(false);
    expect(later.shouldRescue).toBe(false);
    expect(later.failedDirections).toEqual(["KeyS"]);
  });

  test("ignores repeated, stale, camera-only, and malformed probes", () => {
    const tracker = createMovementFailureTracker({ failureWindowMs: 500 });
    const repeatedA = tracker.recordProbe({ code: "KeyA", startPosition: origin, endPosition: origin, at: 100 });
    const repeatedB = tracker.recordProbe({ code: "KeyA", startPosition: origin, endPosition: origin, at: 200 });
    const stale = tracker.recordProbe({ code: "KeyD", startPosition: origin, endPosition: origin, at: 900 });
    const camera = tracker.recordProbe({ code: "ArrowLeft", startPosition: origin, endPosition: origin, at: 950 });
    const malformed = tracker.recordProbe({ code: "KeyW", startPosition: null, endPosition: origin, at: 1_000 });

    expect(repeatedA.shouldRescue).toBe(false);
    expect(repeatedB.shouldRescue).toBe(false);
    expect(stale.shouldRescue).toBe(false);
    expect(stale.failedDirections).toEqual(["KeyD"]);
    expect(camera.ignored).toBe(true);
    expect(malformed.ignored).toBe(true);
  });

  test("uses three-dimensional distance and rejects invalid positions", () => {
    expect(distanceBetweenPositions(origin, position(13, 4.42, 20))).toBeCloseTo(5, 8);
    expect(distanceBetweenPositions(origin, { x: "bad", y: 0, z: 0 })).toBe(Number.POSITIVE_INFINITY);
  });
});
