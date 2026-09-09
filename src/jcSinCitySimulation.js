const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
const round = (value, places = 3) => {
  const factor = 10 ** places;
  return Math.round((Number(value) || 0) * factor) / factor;
};

export const JC_SIN_CITY_SIM_VERSION = 1;

export const JC_SIN_CITY_DEFAULTS = Object.freeze({
  population: 10_000,
  activeNpcCap: 150,
  deepAiCap: 25,
  nearbyRadiusM: 100,
  districtRadiusM: 1_000,
  minOrdinaryFps: 30,
  minDestructionFps: 25,
  cityTickSeconds: 1,
});

export function getSimulationLod(distanceM) {
  const distance = Math.max(0, Number(distanceM) || 0);
  if (distance <= JC_SIN_CITY_DEFAULTS.nearbyRadiusM) return "full";
  if (distance <= JC_SIN_CITY_DEFAULTS.districtRadiusM) return "reduced";
  return "aggregate";
}

function hashSeed(seed) {
  const text = String(seed ?? "jc-vs-satan-sin-city");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0 || 0x9e3779b9;
}

function createRng(seed) {
  let state = hashSeed(seed);
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

function normalizeDistrict(input, population) {
  return {
    id: String(input?.id || "strip-vertical-slice"),
    population: Math.max(1, Math.trunc(Number(input?.population) || population)),
    hope: clamp(input?.hope ?? 56, 0, 100),
    corruption: clamp(input?.corruption ?? 22, 0, 100),
    grace: clamp(input?.grace ?? 52, 0, 100),
    recruiters: Math.max(0, Math.trunc(Number(input?.recruiters) || 18)),
    possessionPressure: clamp(input?.possessionPressure ?? 8, 0, 100),
    protectedPeople: Math.max(0, Math.trunc(Number(input?.protectedPeople) || 0)),
    rescuedPeople: Math.max(0, Math.trunc(Number(input?.rescuedPeople) || 0)),
    casualtyPressure: Math.max(0, Number(input?.casualtyPressure) || 0),
    structuralDamage: clamp(input?.structuralDamage ?? 0, 0, 100),
    crises: Array.isArray(input?.crises) ? input.crises.slice(0, 12) : [],
  };
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createSinCitySimulation(options = {}) {
  const population = Math.max(100, Math.trunc(Number(options.population) || JC_SIN_CITY_DEFAULTS.population));
  const configuredActiveCap = Math.max(20, Math.min(300, Math.trunc(Number(options.activeNpcCap) || JC_SIN_CITY_DEFAULTS.activeNpcCap)));
  const configuredDeepAiCap = Math.max(1, Math.min(50, Math.trunc(Number(options.deepAiCap) || JC_SIN_CITY_DEFAULTS.deepAiCap)));
  const rng = createRng(options.seed || "jc-vs-satan-sin-city-v1");
  const district = normalizeDistrict(options.district, population);
  const listeners = new Set();
  const history = [];

  const state = {
    elapsed: 0,
    cityAccumulator: 0,
    crisisAccumulator: 0,
    performanceAccumulator: 0,
    performanceHealthySamples: 0,
    observer: { x: 0, y: 0, z: 0, zone: "THE STRIP" },
    tactical: {
      nearbyNpcs: 0,
      demonsAlive: 0,
      corruptedPeople: 0,
      jesusAlive: true,
      devilAlive: true,
      lastEventId: null,
    },
    performance: {
      fps: 60,
      frameMs: 16.667,
      mode: "ordinary",
      activeNpcCap: configuredActiveCap,
      deepAiCap: configuredDeepAiCap,
      cityTickSeconds: JC_SIN_CITY_DEFAULTS.cityTickSeconds,
      degraded: false,
    },
    district,
  };

  const notify = (type, data = {}) => {
    const event = Object.freeze({
      id: `sim-${String(history.length + 1).padStart(6, "0")}`,
      type,
      at: round(state.elapsed, 2),
      data: copy(data),
    });
    history.push(event);
    if (history.length > 128) history.splice(0, history.length - 128);
    listeners.forEach((listener) => {
      try {
        listener(event);
      } catch {
        // Simulation listeners are observational and must never block the game loop.
      }
    });
    return event;
  };

  const setObserverPosition = (position = {}) => {
    state.observer.x = Number(position.x) || 0;
    state.observer.y = Number(position.y) || 0;
    state.observer.z = Number(position.z) || 0;
    if (position.zone) state.observer.zone = String(position.zone);
  };

  const recordPerformance = ({ fps, frameMs, mode } = {}) => {
    if (Number.isFinite(fps) && fps > 0) state.performance.fps = state.performance.fps * 0.75 + fps * 0.25;
    if (Number.isFinite(frameMs) && frameMs > 0) state.performance.frameMs = state.performance.frameMs * 0.75 + frameMs * 0.25;
    if (mode === "destruction" || mode === "ordinary") state.performance.mode = mode;
  };

  const evaluatePerformanceBudget = () => {
    const targetFps = state.performance.mode === "destruction"
      ? JC_SIN_CITY_DEFAULTS.minDestructionFps
      : JC_SIN_CITY_DEFAULTS.minOrdinaryFps;
    const fps = state.performance.fps;

    if (fps < targetFps) {
      state.performance.performanceHealthySamples = 0;
      state.performanceHealthySamples = 0;
      state.performance.degraded = true;
      state.performance.activeNpcCap = Math.max(60, Math.floor(state.performance.activeNpcCap * 0.82));
      state.performance.deepAiCap = Math.max(8, Math.floor(state.performance.deepAiCap * 0.8));
      state.performance.cityTickSeconds = Math.min(2.5, round(state.performance.cityTickSeconds + 0.25, 2));
      notify("performance_degraded", {
        fps: round(fps, 1),
        activeNpcCap: state.performance.activeNpcCap,
        deepAiCap: state.performance.deepAiCap,
      });
      return;
    }

    if (fps >= targetFps + 4) state.performanceHealthySamples += 1;
    else state.performanceHealthySamples = 0;

    if (state.performanceHealthySamples >= 4) {
      const previousActive = state.performance.activeNpcCap;
      const previousDeep = state.performance.deepAiCap;
      state.performance.activeNpcCap = Math.min(configuredActiveCap, state.performance.activeNpcCap + 10);
      state.performance.deepAiCap = Math.min(configuredDeepAiCap, state.performance.deepAiCap + 2);
      state.performance.cityTickSeconds = Math.max(JC_SIN_CITY_DEFAULTS.cityTickSeconds, round(state.performance.cityTickSeconds - 0.25, 2));
      state.performance.degraded = state.performance.activeNpcCap < configuredActiveCap || state.performance.deepAiCap < configuredDeepAiCap;
      state.performanceHealthySamples = 0;
      if (previousActive !== state.performance.activeNpcCap || previousDeep !== state.performance.deepAiCap) {
        notify("performance_recovered", {
          fps: round(fps, 1),
          activeNpcCap: state.performance.activeNpcCap,
          deepAiCap: state.performance.deepAiCap,
        });
      }
    }
  };

  const applyEvent = ({ type, magnitude = 1, people = 1, data = {} } = {}) => {
    const eventType = String(type || "");
    const force = clamp(magnitude, 0, 100);
    const affected = Math.max(0, Math.trunc(Number(people) || 0));
    const d = state.district;

    switch (eventType) {
      case "divine_light":
        d.corruption = clamp(d.corruption - 2.8 * force, 0, 100);
        d.hope = clamp(d.hope + 1.8 * force, 0, 100);
        d.grace = clamp(d.grace + 2.2 * force, 0, 100);
        d.protectedPeople += affected;
        break;
      case "soul_taker":
        d.corruption = clamp(d.corruption + 3.4 * force, 0, 100);
        d.hope = clamp(d.hope - 1.9 * force, 0, 100);
        d.possessionPressure = clamp(d.possessionPressure + 2.6 * force, 0, 100);
        break;
      case "jc_rescue":
        d.hope = clamp(d.hope + 2.4 * force, 0, 100);
        d.grace = clamp(d.grace + 1.5 * force, 0, 100);
        d.rescuedPeople += affected;
        d.casualtyPressure = Math.max(0, d.casualtyPressure - affected * Math.max(0.1, force));
        break;
      case "jc_protected_collapse":
        d.structuralDamage = clamp(d.structuralDamage + 2 * force, 0, 100);
        d.protectedPeople += affected;
        d.hope = clamp(d.hope + force, 0, 100);
        d.casualtyPressure = Math.max(0, d.casualtyPressure - affected);
        state.performance.mode = "destruction";
        break;
      case "satan_collapse":
        d.structuralDamage = clamp(d.structuralDamage + 4.5 * force, 0, 100);
        d.corruption = clamp(d.corruption + 1.7 * force, 0, 100);
        d.hope = clamp(d.hope - 2.2 * force, 0, 100);
        d.casualtyPressure += affected * Math.max(0.2, force);
        state.performance.mode = "destruction";
        break;
      case "temptation":
        d.corruption = clamp(d.corruption + 1.5 * force, 0, 100);
        d.recruiters = Math.max(0, d.recruiters + Math.round(force * 0.5));
        break;
      case "possession":
        d.possessionPressure = clamp(d.possessionPressure + 4 * force, 0, 100);
        d.corruption = clamp(d.corruption + force, 0, 100);
        break;
      case "demon_defeated":
        d.possessionPressure = clamp(d.possessionPressure - 5 * force, 0, 100);
        d.hope = clamp(d.hope + 1.5 * force, 0, 100);
        break;
      case "angel_intervention":
        d.grace = clamp(d.grace + 3.5 * force, 0, 100);
        d.hope = clamp(d.hope + 2 * force, 0, 100);
        break;
      default:
        return null;
    }

    return notify(eventType, { magnitude: force, people: affected, ...copy(data) });
  };

  const generateCrisis = () => {
    const d = state.district;
    const pressure = clamp((d.corruption + d.possessionPressure + d.structuralDamage - d.hope) / 180, 0, 1);
    if (rng() > pressure * 0.34) return null;
    const options = [
      { type: "temptation_wave", weight: d.corruption },
      { type: "possession_cluster", weight: d.possessionPressure },
      { type: "structural_emergency", weight: d.structuralDamage + d.casualtyPressure * 0.02 },
    ];
    const total = Math.max(1, options.reduce((sum, option) => sum + option.weight, 0));
    let cursor = rng() * total;
    let selected = options[0];
    for (const option of options) {
      cursor -= option.weight;
      if (cursor <= 0) {
        selected = option;
        break;
      }
    }
    const crisis = {
      id: `crisis-${Math.floor(state.elapsed * 1000)}-${Math.floor(rng() * 9999)}`,
      type: selected.type,
      severity: round(clamp(0.25 + pressure * 0.65 + rng() * 0.1, 0, 1), 3),
      createdAt: round(state.elapsed, 2),
      zone: state.observer.zone,
    };
    d.crises.push(crisis);
    if (d.crises.length > 6) d.crises.splice(0, d.crises.length - 6);
    notify("crisis_created", crisis);
    return crisis;
  };

  const cityTick = (seconds) => {
    const d = state.district;
    const minutes = seconds / 60;
    const infernalRate = d.recruiters * 0.018 * (1 + d.possessionPressure / 140);
    const divineResistance = (d.grace + d.hope) * 0.0024;
    const corruptionDelta = (infernalRate - divineResistance) * minutes;
    d.corruption = clamp(d.corruption + corruptionDelta, 0, 100);
    d.hope = clamp(d.hope + (d.grace * 0.0012 - d.corruption * 0.0008) * seconds, 0, 100);
    d.possessionPressure = clamp(d.possessionPressure + (d.corruption - d.grace) * 0.00045 * seconds, 0, 100);
    d.casualtyPressure = Math.max(0, d.casualtyPressure * Math.pow(0.995, seconds));
    if (state.performance.mode === "destruction" && d.structuralDamage < 1) state.performance.mode = "ordinary";
  };

  const tick = (deltaSeconds) => {
    const delta = clamp(deltaSeconds, 0, 1);
    if (!delta) return snapshot();
    state.elapsed += delta;
    state.cityAccumulator += delta;
    state.crisisAccumulator += delta;
    state.performanceAccumulator += delta;

    while (state.cityAccumulator >= state.performance.cityTickSeconds) {
      cityTick(state.performance.cityTickSeconds);
      state.cityAccumulator -= state.performance.cityTickSeconds;
    }

    if (state.crisisAccumulator >= 15) {
      state.crisisAccumulator %= 15;
      generateCrisis();
    }

    if (state.performanceAccumulator >= 2) {
      state.performanceAccumulator %= 2;
      evaluatePerformanceBudget();
    }

    return snapshot();
  };

  const syncObservedGameSnapshot = (gameSnapshot = {}) => {
    const player = gameSnapshot?.player || {};
    setObserverPosition({ x: player.x, y: player.y, z: player.z, zone: gameSnapshot?.zone });
    const supernatural = gameSnapshot?.world?.supernatural || gameSnapshot?.supernatural || {};
    if (typeof supernatural.jesusAlive === "boolean") state.tactical.jesusAlive = supernatural.jesusAlive;
    if (typeof supernatural.devilAlive === "boolean") state.tactical.devilAlive = supernatural.devilAlive;
    if (Number.isFinite(supernatural.demonsAlive)) state.tactical.demonsAlive = Math.max(0, Math.trunc(supernatural.demonsAlive));
    if (Number.isFinite(supernatural.corruptedPeople)) state.tactical.corruptedPeople = Math.max(0, Math.trunc(supernatural.corruptedPeople));
    if (supernatural.lastEventId) state.tactical.lastEventId = String(supernatural.lastEventId);
    if (Number.isFinite(gameSnapshot?.world?.npcs)) state.tactical.nearbyNpcs = Math.max(0, Math.trunc(gameSnapshot.world.npcs));
    return snapshot();
  };

  const snapshot = () => {
    const perf = state.performance;
    const targetFps = perf.mode === "destruction" ? JC_SIN_CITY_DEFAULTS.minDestructionFps : JC_SIN_CITY_DEFAULTS.minOrdinaryFps;
    return copy({
      version: JC_SIN_CITY_SIM_VERSION,
      elapsed: round(state.elapsed, 2),
      observer: state.observer,
      lod: {
        fullRadiusM: JC_SIN_CITY_DEFAULTS.nearbyRadiusM,
        reducedRadiusM: JC_SIN_CITY_DEFAULTS.districtRadiusM,
        cityMode: "aggregate",
      },
      population: {
        total: state.district.population,
        activePhysicalBudget: Math.min(state.district.population, perf.activeNpcCap),
        deepAiBudget: Math.min(perf.deepAiCap, perf.activeNpcCap),
        aggregateCitizens: Math.max(0, state.district.population - perf.activeNpcCap),
      },
      performance: {
        fps: round(perf.fps, 1),
        frameMs: round(perf.frameMs, 2),
        mode: perf.mode,
        degraded: perf.degraded,
        activeNpcCap: perf.activeNpcCap,
        deepAiCap: perf.deepAiCap,
        cityTickSeconds: perf.cityTickSeconds,
        gate: {
          targetFps,
          passing: perf.fps >= targetFps,
        },
      },
      district: state.district,
      tactical: state.tactical,
      recentEvents: history.slice(-12),
    });
  };

  const serialize = () => ({
    version: JC_SIN_CITY_SIM_VERSION,
    elapsed: state.elapsed,
    district: copy(state.district),
    performance: {
      activeNpcCap: state.performance.activeNpcCap,
      deepAiCap: state.performance.deepAiCap,
      cityTickSeconds: state.performance.cityTickSeconds,
    },
  });

  const restore = (payload) => {
    if (!payload || Number(payload.version) !== JC_SIN_CITY_SIM_VERSION) return false;
    if (payload.district) state.district = normalizeDistrict(payload.district, population);
    state.elapsed = Math.max(0, Number(payload.elapsed) || 0);
    if (payload.performance) {
      state.performance.activeNpcCap = Math.max(60, Math.min(configuredActiveCap, Math.trunc(Number(payload.performance.activeNpcCap) || configuredActiveCap)));
      state.performance.deepAiCap = Math.max(8, Math.min(configuredDeepAiCap, Math.trunc(Number(payload.performance.deepAiCap) || configuredDeepAiCap)));
      state.performance.cityTickSeconds = clamp(payload.performance.cityTickSeconds ?? JC_SIN_CITY_DEFAULTS.cityTickSeconds, 1, 2.5);
    }
    notify("state_restored", { elapsed: round(state.elapsed, 2) });
    return true;
  };

  return Object.freeze({
    version: JC_SIN_CITY_SIM_VERSION,
    tick,
    snapshot,
    serialize,
    restore,
    applyEvent,
    recordPerformance,
    setObserverPosition,
    syncObservedGameSnapshot,
    getLodForDistance: getSimulationLod,
    subscribe(listener) {
      if (typeof listener !== "function") return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
}
