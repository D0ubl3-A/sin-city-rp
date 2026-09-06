import * as THREE from "three";

const STREAMER_KEY = "__SIN_CITY_JC_DISTRICT_STREAMER__";
const WORLD_BOUNDS = Object.freeze({
  minE: 648949.782,
  minN: 3983561.814,
  maxE: 683949.782,
  maxN: 4018561.814,
});
const WORLD_SIZE = 10000;
const CELL_SIZE = 24;
const HEIGHT_SCALE = WORLD_SIZE / 35000;

function toWorld(easting, northing) {
  return {
    x: ((easting - WORLD_BOUNDS.minE) / (WORLD_BOUNDS.maxE - WORLD_BOUNDS.minE) - 0.5) * WORLD_SIZE,
    z: ((northing - WORLD_BOUNDS.minN) / (WORLD_BOUNDS.maxN - WORLD_BOUNDS.minN) - 0.5) * WORLD_SIZE,
  };
}

function ringBounds(ring, pack, heightSource, height) {
  if (!Array.isArray(ring) || ring.length < 3 || !Array.isArray(pack?.origin_utm)) return null;
  const unit = Number(pack.unit_m || 0.1);
  const origin = pack.origin_utm;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const vertex of ring) {
    if (!Array.isArray(vertex) || vertex.length < 2) continue;
    const x = Number(vertex[0]);
    const z = Number(vertex[1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    const point = toWorld(origin[0] + x * unit, origin[1] + z * unit);
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minZ = Math.min(minZ, point.z);
    maxZ = Math.max(maxZ, point.z);
  }

  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)) return null;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    minY: -0.35,
    maxY: Math.max(1.2, height) + 0.5,
    heightSource,
  };
}

function estimatedHeight(building) {
  const source = Number(building?.h);
  if (Number.isFinite(source) && source > 0) {
    return { height: source * HEIGHT_SCALE, source: "source" };
  }
  const area = Math.max(1, Number(building?.a) || 1);
  const inferred = Math.min(16, Math.max(5.5, 5 + Math.sqrt(area) * 0.18));
  return { height: inferred * HEIGHT_SCALE, source: "derived" };
}

function addToGrid(grid, bounds) {
  const minCellX = Math.floor(bounds.minX / CELL_SIZE);
  const maxCellX = Math.floor(bounds.maxX / CELL_SIZE);
  const minCellZ = Math.floor(bounds.minZ / CELL_SIZE);
  const maxCellZ = Math.floor(bounds.maxZ / CELL_SIZE);
  for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
    for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
      const key = `${cellX}:${cellZ}`;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(bounds);
    }
  }
}

function buildTileIndex(tile, district) {
  if (tile.__jcCollisionIndex) return tile.__jcCollisionIndex;
  const grid = new Map();
  let footprintCount = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const building of tile.rows || []) {
    const resolvedHeight = estimatedHeight(building);
    for (const ring of building.r || []) {
      const bounds = ringBounds(ring, district.pack, resolvedHeight.source, resolvedHeight.height);
      if (!bounds) continue;
      addToGrid(grid, bounds);
      minX = Math.min(minX, bounds.minX);
      maxX = Math.max(maxX, bounds.maxX);
      minZ = Math.min(minZ, bounds.minZ);
      maxZ = Math.max(maxZ, bounds.maxZ);
      footprintCount += 1;
    }
  }

  tile.__jcCollisionIndex = {
    grid,
    footprintCount,
    bounds: footprintCount ? { minX, maxX, minZ, maxZ } : null,
  };
  return tile.__jcCollisionIndex;
}

function pointInsideBounds(point, bounds, padding) {
  return point.x >= bounds.minX - padding
    && point.x <= bounds.maxX + padding
    && point.z >= bounds.minZ - padding
    && point.z <= bounds.maxZ + padding
    && point.y >= bounds.minY - padding
    && point.y <= bounds.maxY + padding;
}

function installCollisionQueries(state) {
  if (state.collidesPoint && state.collisionMode === "source-footprint-aabb-grid") return;

  state.collisionMode = "source-footprint-aabb-grid";
  state.collisionFootprints = 0;
  state.visibleCollisionTiles = 0;
  state.collidesPoint = (point, padding = 0) => {
    const district = state.activeDistrict ? state.districts?.get?.(state.activeDistrict) : null;
    if (!district || !point) return false;

    let visibleTiles = 0;
    let totalFootprints = 0;
    for (const tile of district.tiles?.values?.() || []) {
      if (!tile.group?.visible) continue;
      visibleTiles += 1;
      const index = buildTileIndex(tile, district);
      totalFootprints += index.footprintCount;
      if (!index.bounds) continue;
      if (point.x < index.bounds.minX - padding || point.x > index.bounds.maxX + padding
        || point.z < index.bounds.minZ - padding || point.z > index.bounds.maxZ + padding) continue;

      const minCellX = Math.floor((point.x - padding) / CELL_SIZE);
      const maxCellX = Math.floor((point.x + padding) / CELL_SIZE);
      const minCellZ = Math.floor((point.z - padding) / CELL_SIZE);
      const maxCellZ = Math.floor((point.z + padding) / CELL_SIZE);
      const seen = new Set();
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
          const bucket = index.grid.get(`${cellX}:${cellZ}`) || [];
          for (const bounds of bucket) {
            if (seen.has(bounds)) continue;
            seen.add(bounds);
            if (pointInsideBounds(point, bounds, padding)) {
              state.visibleCollisionTiles = visibleTiles;
              state.collisionFootprints = totalFootprints;
              return true;
            }
          }
        }
      }
    }

    state.visibleCollisionTiles = visibleTiles;
    state.collisionFootprints = totalFootprints;
    return false;
  };
}

function installBox3Bridge(state) {
  const prototype = THREE.Box3.prototype;
  if (prototype.__sinCityJcStreamCollisionBridge) return;

  const originalCopy = prototype.copy;
  const originalExpandByScalar = prototype.expandByScalar;
  const originalContainsPoint = prototype.containsPoint;

  prototype.copy = function copyWithJcProbe(box) {
    const result = originalCopy.call(this, box);
    this.__sinCityJcProbe = Boolean(box?.userData?.type && box.userData.type !== "road" && box.userData.type !== "ramp");
    this.__sinCityJcProbePadding = 0;
    return result;
  };

  prototype.expandByScalar = function expandWithJcProbe(value) {
    const result = originalExpandByScalar.call(this, value);
    if (this.__sinCityJcProbe) this.__sinCityJcProbePadding = Math.max(0, Number(value) || 0);
    return result;
  };

  prototype.containsPoint = function containsPointWithJcProbe(point) {
    if (originalContainsPoint.call(this, point)) return true;
    if (!this.__sinCityJcProbe) return false;
    return Boolean(state.collidesPoint?.(point, this.__sinCityJcProbePadding || 0));
  };

  Object.defineProperty(prototype, "__sinCityJcStreamCollisionBridge", {
    value: true,
    configurable: false,
    enumerable: false,
  });
  state.collisionBridgeInstalled = true;
}

const state = window[STREAMER_KEY];
if (state) {
  installCollisionQueries(state);
  installBox3Bridge(state);
}

export { CELL_SIZE, WORLD_BOUNDS, WORLD_SIZE };
