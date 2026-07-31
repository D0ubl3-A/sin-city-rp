import {
  LOCOMOTION_CODES,
  createMovementFailureTracker,
} from "./movementRescueCore.js";

const MOVEMENT_CODE_SET = new Set(LOCOMOTION_CODES);
const RESCUE_WINDOW_MS = 45_000;
const PROBE_DURATION_MS = 720;

const failureTracker = createMovementFailureTracker();
const runtime = {
  activeKeys: new Set(),
  probes: new Map(),
  rescued: false,
  rescueReason: null,
  rescueAt: null,
  armedAt: null,
};

function parseGameState() {
  try {
    const render = window.render_game_to_text;
    if (typeof render !== "function") return null;
    const value = render();
    return typeof value === "string" ? JSON.parse(value) : value;
  } catch {
    return null;
  }
}

function playerPosition(state) {
  const x = Number(state?.player?.x);
  const y = Number(state?.player?.y);
  const z = Number(state?.player?.z);
  if (![x, y, z].every(Number.isFinite)) return null;
  return { x, y, z };
}

function movementCanBeProbed(state) {
  if (state?.phase !== "playing" || state?.player?.mode !== "onFoot") return false;
  if (runtime.armedAt === null) runtime.armedAt = performance.now();
  return performance.now() - runtime.armedAt <= RESCUE_WINDOW_MS;
}

function exposeDiagnostics() {
  window.__SIN_CITY_MOVEMENT_RESCUE__ = Object.freeze({
    getStatus() {
      return {
        armed: !runtime.rescued && (runtime.armedAt === null || performance.now() - runtime.armedAt <= RESCUE_WINDOW_MS),
        rescued: runtime.rescued,
        rescueReason: runtime.rescueReason,
        rescueAt: runtime.rescueAt,
        activeKeys: [...runtime.activeKeys],
        failedDirections: [...failureTracker.snapshot(performance.now()).failedDirections],
      };
    },
    rescueNow(reason = "manual-recovery") {
      return rescuePlayer(reason);
    },
  });
}

function rescuePlayer(reason) {
  if (runtime.rescued) return false;
  const helper = window.__SIN_CITY_TEST__;
  if (!helper || typeof helper.teleport !== "function") return false;

  const state = parseGameState();
  if (!movementCanBeProbed(state)) return false;

  const teleported = Boolean(helper.teleport("spawn"));
  if (!teleported) return false;

  runtime.rescued = true;
  runtime.rescueReason = String(reason || "movement-softlock");
  runtime.rescueAt = Date.now();
  runtime.probes.clear();
  failureTracker.reset();

  document.documentElement.dataset.movementRescue = "completed";
  document.documentElement.dataset.movementRescueReason = runtime.rescueReason;

  if (typeof helper.saveNow === "function") {
    try {
      helper.saveNow();
    } catch {
      // The movement repair remains valid even if storage is unavailable.
    }
  }

  const canvas = document.getElementById("game-canvas");
  canvas?.focus?.({ preventScroll: true });
  return true;
}

function finishProbe(code, probeId) {
  const probe = runtime.probes.get(code);
  if (!probe || probe.id !== probeId) return;
  runtime.probes.delete(code);

  if (!runtime.activeKeys.has(code) || runtime.rescued) return;

  const state = parseGameState();
  if (!movementCanBeProbed(state)) return;
  const currentPosition = playerPosition(state);
  if (!currentPosition) return;

  const result = failureTracker.recordProbe({
    code,
    startPosition: probe.position,
    endPosition: currentPosition,
    at: performance.now(),
  });
  if (result.shouldRescue) {
    rescuePlayer(`movement-softlock:${result.failedDirections.join(",")}`);
  }
}

function beginProbe(code) {
  if (runtime.rescued || runtime.probes.has(code)) return;
  const state = parseGameState();
  if (!movementCanBeProbed(state)) return;
  const position = playerPosition(state);
  if (!position) return;

  const id = `${code}:${performance.now()}:${Math.random()}`;
  runtime.probes.set(code, { id, position });
  window.setTimeout(() => finishProbe(code, id), PROBE_DURATION_MS);
}

function handleKeyDown(event) {
  if (!MOVEMENT_CODE_SET.has(event.code)) return;
  runtime.activeKeys.add(event.code);
  beginProbe(event.code);
}

function handleKeyUp(event) {
  if (!MOVEMENT_CODE_SET.has(event.code)) return;
  runtime.activeKeys.delete(event.code);
  runtime.probes.delete(event.code);
}

function resetInputTracking() {
  runtime.activeKeys.clear();
  runtime.probes.clear();
}

window.addEventListener("keydown", handleKeyDown, { capture: true });
window.addEventListener("keyup", handleKeyUp, { capture: true });
window.addEventListener("blur", resetInputTracking);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) resetInputTracking();
});

const canvas = document.getElementById("game-canvas");
canvas?.addEventListener("pointerdown", () => canvas.focus?.({ preventScroll: true }), { passive: true });

window.addEventListener("sin-city:full-map-graphics-ready", () => {
  document.documentElement.dataset.movementRescue = "armed";
}, { once: true });

document.documentElement.dataset.movementRescue = "armed";
exposeDiagnostics();
