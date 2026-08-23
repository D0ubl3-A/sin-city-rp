import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const JC_ROOT = "https://raw.githubusercontent.com/D0ubl3-A/jc-the-holy-og/main";
const INDEX_URL = `${JC_ROOT}/jc-the-holy-og-assets/generated/districts/index.js`;
const PACK_ROOT = `${JC_ROOT}/jc-the-holy-og-assets/generated/districts`;
const WORLD_BOUNDS = Object.freeze({
  minE: 648949.782, minN: 3983561.814,
  maxE: 683949.782, maxN: 4018561.814,
});
const WORLD_SIZE = 10000;
const KEY = "__SIN_CITY_JC_DISTRICT_STREAMER__";

function loadScript(src, marker) {
  return new Promise((resolve, reject) => {
    const prior = document.querySelector(`script[data-jc-stream="${marker}"]`);
    if (prior?.dataset.loaded === "1") return resolve();
    if (prior) {
      prior.addEventListener("load", resolve, { once: true });
      prior.addEventListener("error", () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.jcStream = marker;
    script.onload = () => { script.dataset.loaded = "1"; resolve(); };
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

function toWorld(easting, northing) {
  const x = ((easting - WORLD_BOUNDS.minE) / (WORLD_BOUNDS.maxE - WORLD_BOUNDS.minE) - 0.5) * WORLD_SIZE;
  const z = ((northing - WORLD_BOUNDS.minN) / (WORLD_BOUNDS.maxN - WORLD_BOUNDS.minN) - 0.5) * WORLD_SIZE;
  return { x, z };
}

function districtUrl(id) {
  return `${PACK_ROOT}/${id}.js`;
}

function ringGeometry(ring, pack, height) {
  if (!Array.isArray(ring) || ring.length < 3) return null;
  const unit = Number(pack.unit_m || 0.1);
  const origin = pack.origin_utm;
  const points = ring.map(([x, z]) => toWorld(origin[0] + Number(x) * unit, origin[1] + Number(z) * unit));
  const centerX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
  const centerZ = points.reduce((sum, point) => sum + point.z, 0) / points.length;
  const shape = new THREE.Shape();
  points.forEach((point, index) => {
    const x = point.x - centerX;
    const y = -(point.z - centerZ);
    if (index) shape.lineTo(x, y);
    else shape.moveTo(x, y);
  });
  shape.closePath();
  try {
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1,
    });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(centerX, 0.02, centerZ);
    return geometry;
  } catch {
    return null;
  }
}

function createMaterials() {
  return [
    new THREE.MeshStandardMaterial({ color: 0x87939b, roughness: 0.54, metalness: 0.18 }),
    new THREE.MeshStandardMaterial({ color: 0xb4a88e, roughness: 0.78, metalness: 0.04 }),
    new THREE.MeshStandardMaterial({ color: 0x4d5963, roughness: 0.4, metalness: 0.26 }),
  ];
}

function tileId(record) {
  return record.t || "unassigned";
}

function tileCenter(id, fallback) {
  const match = /Tile_LV_X(\d+)_Y(\d+)/.exec(id || "");
  if (!match) return fallback;
  return toWorld(
    WORLD_BOUNDS.minE + (Number(match[1]) + 0.5) * 1000,
    WORLD_BOUNDS.minN + (Number(match[2]) + 0.5) * 1000,
  );
}

function createStreamer() {
  const state = {
    status: "loading-index",
    index: null,
    scene: null,
    districts: new Map(),
    loading: new Set(),
    errors: {},
    activeDistrict: null,
    loadedBuildings: 0,
    builtTiles: 0,
    visibleTiles: 0,
    sourceBuildingsAvailable: 43500,
    update,
    loadDistrict,
  };
  const materials = createMaterials();
  let frame = 0;

  function prepareDistrict(meta, pack) {
    const bounds = meta.bbox_utm;
    const center = toWorld((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2);
    const district = {
      meta,
      pack,
      center,
      root: new THREE.Group(),
      tiles: new Map(),
    };
    district.root.name = `JC Real District: ${meta.id}`;
    district.root.visible = false;
    district.root.userData = {
      source: "D0ubl3-A/jc-the-holy-og",
      crs: "EPSG:32611",
      sourceGrounded: true,
      buildingCount: pack.buildings?.length || 0,
    };
    for (const building of pack.buildings || []) {
      const id = tileId(building);
      if (!district.tiles.has(id)) {
        district.tiles.set(id, {
          id,
          rows: [],
          center: tileCenter(id, center),
          group: null,
          built: false,
        });
      }
      district.tiles.get(id).rows.push(building);
    }
    state.scene.add(district.root);
    state.districts.set(meta.id, district);
    state.loadedBuildings += pack.buildings?.length || 0;
    state.status = "ready";
    window.dispatchEvent(new CustomEvent("sin-city:jc-district-loaded", {
      detail: { id: meta.id, buildings: pack.buildings?.length || 0 },
    }));
  }

  async function loadDistrict(metaOrId) {
    const meta = typeof metaOrId === "string"
      ? state.index?.districts?.find((item) => item.id === metaOrId)
      : metaOrId;
    if (!meta || state.districts.has(meta.id) || state.loading.has(meta.id)) return;
    state.loading.add(meta.id);
    try {
      await loadScript(districtUrl(meta.id), `pack-${meta.id}`);
      const pack = window.JC_REAL_DISTRICT_PACKS?.[meta.id];
      if (!pack) throw new Error(`JC pack ${meta.id} loaded without data`);
      prepareDistrict(meta, pack);
    } catch (error) {
      state.errors[meta.id] = String(error?.message || error);
      state.status = state.districts.size ? "degraded" : "error";
    } finally {
      state.loading.delete(meta.id);
    }
  }

  function buildTile(district, tile) {
    if (tile.built) return;
    tile.built = true;
    const buckets = [[], [], []];
    for (const building of tile.rows) {
      const hasHeight = Number.isFinite(Number(building.h)) && Number(building.h) > 0;
      const sourceHeight = hasHeight
        ? Number(building.h)
        : Math.min(16, Math.max(5.5, 5 + Math.sqrt(Math.max(1, Number(building.a) || 1)) * 0.18));
      const height = sourceHeight * (WORLD_SIZE / 35000);
      const materialIndex = hasHeight ? 0 : (Number(building.a || 0) > 900 ? 2 : 1);
      for (const ring of building.r || []) {
        const geometry = ringGeometry(ring, district.pack, height);
        if (geometry) buckets[materialIndex].push(geometry);
      }
    }
    const group = new THREE.Group();
    group.name = `JC Tile: ${district.meta.id}/${tile.id}`;
    group.visible = false;
    group.userData = { sourceGrounded: true, buildingRecords: tile.rows.length };
    buckets.forEach((geometries, index) => {
      if (!geometries.length) return;
      let merged = null;
      try { merged = mergeGeometries(geometries, false); } catch {}
      if (merged) {
        const mesh = new THREE.Mesh(merged, materials[index]);
        mesh.receiveShadow = true;
        mesh.userData = { jcRealFootprints: true };
        group.add(mesh);
        geometries.forEach((geometry) => geometry.dispose());
      } else {
        geometries.forEach((geometry) => group.add(new THREE.Mesh(geometry, materials[index])));
      }
    });
    district.root.add(group);
    tile.group = group;
    state.builtTiles += 1;
  }

  function update(scene, camera) {
    if (!scene || !camera || !state.index?.districts?.length) return;
    if (!state.scene) state.scene = scene;
    frame += 1;
    if (frame % 8) return;

    const rankedDistricts = state.index.districts
      .map((meta) => {
        const bounds = meta.bbox_utm;
        const center = toWorld((bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2);
        return { meta, center, distance: Math.hypot(camera.position.x - center.x, camera.position.z - center.z) };
      })
      .sort((a, b) => a.distance - b.distance);

    const nearest = rankedDistricts[0];
    if (nearest?.distance < 2600) loadDistrict(nearest.meta);
    const active = nearest?.distance < 1800 ? state.districts.get(nearest.meta.id) : null;
    state.activeDistrict = active?.meta.id || null;
    state.visibleTiles = 0;

    for (const district of state.districts.values()) district.root.visible = district === active;
    if (!active) return;

    const tiles = [...active.tiles.values()]
      .map((tile) => ({ tile, distance: Math.hypot(camera.position.x - tile.center.x, camera.position.z - tile.center.z) }))
      .sort((a, b) => a.distance - b.distance);

    let builds = 0;
    tiles.forEach(({ tile, distance }, index) => {
      const visible = index < 10 && distance < 1200;
      if (visible && !tile.built && builds < 2) {
        buildTile(active, tile);
        builds += 1;
      }
      if (tile.group) tile.group.visible = visible;
      if (visible && tile.group) state.visibleTiles += 1;
    });
  }

  return state;
}

if (!window[KEY]) {
  const state = window[KEY] = createStreamer();
  loadScript(INDEX_URL, "district-index")
    .then(() => {
      if (!window.JC_REAL_DISTRICT_INDEX?.districts?.length) throw new Error("JC district index is missing");
      state.index = window.JC_REAL_DISTRICT_INDEX;
      state.status = "index-ready";
      window.dispatchEvent(new CustomEvent("sin-city:jc-district-index-ready", {
        detail: { districts: state.index.districts.length, buildings: 43500 },
      }));
    })
    .catch((error) => {
      state.status = "error";
      state.errors.index = String(error?.message || error);
    });

  const render = THREE.WebGLRenderer.prototype.render;
  if (!THREE.WebGLRenderer.prototype.__sinCityJcStreaming) {
    Object.defineProperty(THREE.WebGLRenderer.prototype, "__sinCityJcStreaming", { value: true });
    THREE.WebGLRenderer.prototype.render = function renderWithJcStreaming(scene, camera) {
      state.update(scene, camera);
      return render.call(this, scene, camera);
    };
  }
}

export { JC_ROOT, WORLD_BOUNDS, WORLD_SIZE };
