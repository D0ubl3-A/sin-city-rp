export const LOCOMOTION_CODES = Object.freeze([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "ArrowUp",
  "ArrowDown",
]);

export const DEFAULT_MOVEMENT_RESCUE_CONFIG = Object.freeze({
  failureWindowMs: 8_000,
  minimumMovementDistance: 0.075,
  requiredDistinctFailures: 2,
});

function finitePosition(position) {
  if (!position || typeof position !== "object") return null;
  const x = Number(position.x);
  const y = Number(position.y);
  const z = Number(position.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

export function distanceBetweenPositions(first, second) {
  const a = finitePosition(first);
  const b = finitePosition(second);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

export function createMovementFailureTracker(options = {}) {
  const allowedCodes = new Set(options.allowedCodes || LOCOMOTION_CODES);
  const failureWindowMs = Number.isFinite(options.failureWindowMs)
    ? Math.max(1, options.failureWindowMs)
    : DEFAULT_MOVEMENT_RESCUE_CONFIG.failureWindowMs;
  const minimumMovementDistance = Number.isFinite(options.minimumMovementDistance)
    ? Math.max(0.001, options.minimumMovementDistance)
    : DEFAULT_MOVEMENT_RESCUE_CONFIG.minimumMovementDistance;
  const requiredDistinctFailures = Number.isFinite(options.requiredDistinctFailures)
    ? Math.max(2, Math.floor(options.requiredDistinctFailures))
    : DEFAULT_MOVEMENT_RESCUE_CONFIG.requiredDistinctFailures;

  let failures = [];

  function prune(now) {
    failures = failures.filter((failure) => now - failure.at <= failureWindowMs);
  }

  function snapshot(now = 0) {
    prune(now);
    return Object.freeze({
      failedDirections: Object.freeze([...new Set(failures.map((failure) => failure.code))]),
      failureCount: failures.length,
    });
  }

  function reset() {
    failures = [];
  }

  function recordProbe({ code, startPosition, endPosition, at = 0 } = {}) {
    const now = Number.isFinite(at) ? at : 0;
    if (!allowedCodes.has(code)) {
      return Object.freeze({
        ignored: true,
        moved: false,
        shouldRescue: false,
        failedDirections: snapshot(now).failedDirections,
      });
    }

    const start = finitePosition(startPosition);
    const end = finitePosition(endPosition);
    if (!start || !end) {
      return Object.freeze({
        ignored: true,
        moved: false,
        shouldRescue: false,
        failedDirections: snapshot(now).failedDirections,
      });
    }

    const movementDistance = distanceBetweenPositions(start, end);
    if (movementDistance >= minimumMovementDistance) {
      reset();
      return Object.freeze({
        ignored: false,
        moved: true,
        movementDistance,
        shouldRescue: false,
        failedDirections: Object.freeze([]),
      });
    }

    prune(now);
    failures.push({ code, at: now, position: end });

    const failedDirections = [...new Set(failures.map((failure) => failure.code))];
    const firstFailure = failures[0];
    const remainedPinned = firstFailure
      ? distanceBetweenPositions(firstFailure.position, end) < minimumMovementDistance
      : false;
    const shouldRescue = failedDirections.length >= requiredDistinctFailures && remainedPinned;

    return Object.freeze({
      ignored: false,
      moved: false,
      movementDistance,
      shouldRescue,
      failedDirections: Object.freeze(failedDirections),
    });
  }

  return Object.freeze({ recordProbe, reset, snapshot });
}
