const JC_RAW = 'https://raw.githubusercontent.com/D0ubl3-A/jc-the-holy-og/main';

const SOURCES = Object.freeze({
  canonicalWorld: 'world/canonical-world-contract.json',
  buildingRegistryStatus: 'world/building-registry-status.json',
  realVegasDetailStatus: 'world/real-vegas-detail-status.json',
  sectionStatus: 'world/section-status.json',
  stripCoreRegistry: 'world/strip-core-registry.json',
  terrainManifest: 'world/terrain-manifest.json',
  spriteBinaryManifest: 'world/sprite-binary-manifest.json',
  productionGates: 'world/production-gates.json',
  acceptedTransform: 'world/accepted-transform.json'
});

async function fetchJson(path, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${JC_RAW}/${path}`, {
      cache: 'no-store',
      signal: controller.signal,
      headers: { Accept: 'application/json' }
    });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function sourceClass(name) {
  if (/terrain/i.test(name)) return 'geographic-truth/terrain';
  if (/building|strip/i.test(name)) return 'geographic-truth/structures';
  if (/transform/i.test(name)) return 'geographic-truth/coordinates';
  if (/gate|status|contract/i.test(name)) return 'provenance-and-validation';
  return 'geographic-truth';
}

export async function loadJcWorldTruth() {
  const entries = await Promise.all(Object.entries(SOURCES).map(async ([name, path]) => {
    try {
      const data = await fetchJson(path);
      return [name, { ok: true, path, class: sourceClass(name), data }];
    } catch (error) {
      return [name, { ok: false, path, class: sourceClass(name), error: String(error?.message || error) }];
    }
  }));

  const sources = Object.fromEntries(entries);
  const required = ['canonicalWorld', 'buildingRegistryStatus', 'acceptedTransform', 'productionGates'];
  const requiredReady = required.every((name) => sources[name]?.ok);
  const failures = Object.entries(sources).filter(([, source]) => !source.ok).map(([name, source]) => ({ name, error: source.error }));

  const snapshot = {
    version: 1,
    provider: 'D0ubl3-A/jc-the-holy-og',
    providerRef: 'main',
    role: 'Las Vegas geographic truth + provenance source',
    loadedAt: new Date().toISOString(),
    requiredReady,
    failures,
    sources
  };

  return deepFreeze(snapshot);
}

export function installJcWorldTruthBridge() {
  const state = {
    status: 'loading',
    snapshot: null,
    error: null,
    reload: null
  };

  state.reload = async () => {
    state.status = 'loading';
    state.error = null;
    try {
      state.snapshot = await loadJcWorldTruth();
      state.status = state.snapshot.requiredReady ? 'ready' : 'degraded';
      window.dispatchEvent(new CustomEvent('sin-city:world-truth-ready', { detail: state.snapshot }));
      return state.snapshot;
    } catch (error) {
      state.status = 'failed';
      state.error = String(error?.message || error);
      window.dispatchEvent(new CustomEvent('sin-city:world-truth-failed', { detail: state.error }));
      throw error;
    }
  };

  window.__SIN_CITY_WORLD_TRUTH__ = state;
  state.reload().catch((error) => console.warn('[JC world truth bridge]', error));
  return state;
}

installJcWorldTruthBridge();
