import { createSinCitySimulation } from "./jcSinCitySimulation.js";

const STORAGE_KEY = "jc-vs-satan-sin-city-sim-v1";
const params = new URLSearchParams(window.location.search);
const testMode = params.has("test");

const runtime = createSinCitySimulation({
  seed: params.get("seed") || "jc-vs-satan-sin-city-v1",
  population: 10_000,
  activeNpcCap: testMode ? 80 : 150,
  deepAiCap: testMode ? 12 : 25,
  district: {
    id: "strip-vertical-slice",
    population: 10_000,
    hope: 56,
    corruption: 22,
    grace: 52,
    recruiters: 18,
    possessionPressure: 8,
  },
});

try {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) runtime.restore(JSON.parse(stored));
} catch {
  // A corrupt optional simulation save cannot block gameplay.
}

let last = performance.now();
let saveAccumulator = 0;
let observedEventId = null;
let fpsAccumulator = 0;
let fpsFrames = 0;
let lastFps = 60;

function readGameSnapshot() {
  if (typeof window.render_game_to_text !== "function") return null;
  try {
    return JSON.parse(window.render_game_to_text());
  } catch {
    return null;
  }
}

function bridgeSupernaturalEvents(snapshot) {
  const supernatural = snapshot?.world?.supernatural || snapshot?.supernatural || null;
  if (!supernatural) return;
  const nextId = supernatural.lastEventId || null;
  if (!nextId || nextId === observedEventId) return;
  observedEventId = nextId;

  // The authoritative combat system owns exact projectile outcomes. The city
  // simulator only converts the latest tactical result into district pressure.
  const corrupted = Number(supernatural.corruptedPeople) || 0;
  if (corrupted > runtime.snapshot().tactical.corruptedPeople) {
    runtime.applyEvent({ type: "soul_taker", magnitude: 0.35, people: 1, data: { sourceEventId: nextId } });
  } else {
    runtime.applyEvent({ type: "divine_light", magnitude: 0.3, people: 1, data: { sourceEventId: nextId } });
  }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runtime.serialize()));
  } catch {
    // Persistence is best-effort and never blocks the frame loop.
  }
}

function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) {
    last = now;
    return;
  }

  const delta = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  if (!delta) return;

  fpsAccumulator += delta;
  fpsFrames += 1;
  if (fpsAccumulator >= 0.5) {
    lastFps = fpsFrames / fpsAccumulator;
    runtime.recordPerformance({ fps: lastFps, frameMs: 1000 / Math.max(1, lastFps) });
    fpsAccumulator = 0;
    fpsFrames = 0;
  }

  const snapshot = readGameSnapshot();
  if (snapshot) {
    runtime.syncObservedGameSnapshot(snapshot);
    bridgeSupernaturalEvents(snapshot);
  }

  runtime.tick(delta);
  saveAccumulator += delta;
  if (saveAccumulator >= 5) {
    saveAccumulator %= 5;
    persist();
  }

  window.__JC_SIN_CITY_SIMULATION__.snapshot = runtime.snapshot();
}

window.addEventListener("pagehide", persist);
window.addEventListener("beforeunload", persist);

window.__JC_SIN_CITY_SIMULATION__ = {
  status: "ready",
  runtime,
  snapshot: runtime.snapshot(),
  applyEvent: (event) => runtime.applyEvent(event),
  setDestructionActive(active) {
    runtime.recordPerformance({ mode: active ? "destruction" : "ordinary" });
    this.snapshot = runtime.snapshot();
    return this.snapshot;
  },
};

requestAnimationFrame(frame);
