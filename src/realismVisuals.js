/**
 * Asset-driven realism layer for the procedural Vegas world.
 *
 * The module is deliberately independent from world construction. It upgrades
 * matching meshes after the city has been built, reuses a very small texture
 * set, and leaves unmatched/gameplay meshes untouched.
 */

const REALISM_ROOT = "/assets/textures/realism-v1";

const TEXTURE_SPECS = Object.freeze({
  asphalt: {
    file: "asphalt-v1.png",
    repeat: [1, 1],
    worldScale: [8, 8],
    roughness: 0.9,
    metalness: 0.03,
    bumpScale: 0.045,
    tint: 0xaeb3ba,
  },
  sidewalk: {
    file: "sidewalk-concrete-v1.png",
    repeat: [1, 1],
    worldScale: [4, 4],
    roughness: 0.92,
    metalness: 0,
    bumpScale: 0.04,
    tint: 0xf0eee8,
  },
  tunnel: {
    file: "storm-drain-concrete-v1.png",
    repeat: [1, 1],
    worldScale: [5, 5],
    roughness: 0.94,
    metalness: 0.02,
    bumpScale: 0.075,
    tint: 0xaaa9a2,
  },
  desert: {
    file: "mojave-ground-v1.png",
    repeat: [1, 1],
    worldScale: [14, 14],
    roughness: 0.98,
    metalness: 0,
    bumpScale: 0.065,
    tint: 0xd0b18f,
  },
  casinoFacade: {
    file: "casino-glass-facade-v1.png",
    repeat: [1, 1],
    worldScale: [18, 20],
    roughness: 0.3,
    metalness: 0.48,
    bumpScale: 0.018,
    tint: 0xf1e7d4,
    emissive: 0x1e1308,
    emissiveIntensity: 0.2,
  },
  downtownFacade: {
    file: "downtown-hotel-facade-v1.png",
    repeat: [1, 1],
    worldScale: [14, 18],
    roughness: 0.82,
    metalness: 0.04,
    bumpScale: 0.055,
    tint: 0xe0d1bf,
  },
  hangarFacade: {
    file: "military-hangar-facade-v1.png",
    repeat: [1, 1],
    worldScale: [16, 12],
    roughness: 0.64,
    metalness: 0.42,
    bumpScale: 0.035,
    tint: 0xc1c3be,
  },
  researchFacade: {
    file: "research-facility-facade-v1.png",
    repeat: [1, 1],
    worldScale: [14, 12],
    roughness: 0.54,
    metalness: 0.3,
    bumpScale: 0.045,
    tint: 0xc2c8cb,
    emissive: 0x07131a,
    emissiveIntensity: 0.18,
  },
  facadeAtlas: {
    file: "vegas-facades-complete-4x4-v2-runtime.png",
    repeat: [1, 1],
    worldScale: [12, 16],
    roughness: 0.62,
    metalness: 0.14,
    bumpScale: 0,
    tint: 0xffffff,
    atlasColumns: 4,
    atlasRows: 4,
  },
  facilityAtlas: {
    file: "military-secret-facades-4x4-v1-runtime.png",
    repeat: [1, 1],
    worldScale: [14, 12],
    roughness: 0.68,
    metalness: 0.24,
    bumpScale: 0,
    tint: 0xffffff,
    atlasColumns: 4,
    atlasRows: 4,
  },
});

const EXCLUDED_NAMES = /(?:LaneMark|CenterLine|Crosswalk|RunwayLight|Guide|Water|WindowBand|Neon|Sign_|Star|Lamp|Radar|UFO|Aircraft|Vehicle|Pickup|Character)/i;

function realismKeyForName(value) {
  const name = String(value || "");
  if (!name || EXCLUDED_NAMES.test(name)) return null;

  // Traversable surfaces win before nearby facility names such as Groom Lake.
  if (/(?:LasVegasBoulevard|CrossStreet|Interstate|Highway|US95|ScenicDrive|AccessRoad|AccessWest|AccessNorth|Runway|Taxiway|Road)/i.test(name)) return "asphalt";
  if (/(?:Sidewalk|_Walk|Concrete|Plaza|Parking|Apron|TerminalFloor)/i.test(name)) return "sidewalk";
  if (/(?:Tunnel|WashRamp|WashRetainingWall|DrainPortal|FloodChannel|StormDrain)/i.test(name)) return "tunnel";
  if (/(?:Area51|GroomLake|Research|Bunker|OccupationCheckpoint)/i.test(name)) return "researchFacade";
  if (/(?:NellisHangar|MilitaryHangar|AirportHangar|FlightlineHangar)/i.test(name)) return "hangarFacade";
  if (/(?:AureliaTower|ProceduralBuildings|las-vegas-strip_Buildings|south-strip_Buildings|CasinoTower|ResortTower)/i.test(name)) return "casinoFacade";
  if (/(?:_Buildings_|Downtown|Fremont|Hotel|Office|Residential|Commercial|ControlTower)/i.test(name)) return "downtownFacade";
  if (/(?:DesertGround|Mojave|DesertRock|DesertMesa|SpringMountain|RedRock|Dune)/i.test(name)) return "desert";
  return null;
}

const CITY_FACADE_TILE_RULES = Object.freeze([
  { pattern: /^ProceduralBuildings_/i, tiles: [0, 1, 2, 3, 4, 5, 14, 15] },
  { pattern: /^las-vegas-strip_Buildings_/i, tiles: [0, 1, 2, 3, 4, 14] },
  { pattern: /^south-strip_Buildings_/i, tiles: [0, 2, 3, 4, 14, 15] },
  { pattern: /^downtown-vegas_Buildings_/i, tiles: [5, 6, 7] },
  { pattern: /^north-las-vegas_Buildings_/i, tiles: [8, 9] },
  { pattern: /^sunrise-manor_Buildings_/i, tiles: [10, 11] },
  { pattern: /^henderson_Buildings_/i, tiles: [12, 13] },
]);

function facadeAtlasTilesForName(value) {
  const name = String(value || "");
  return CITY_FACADE_TILE_RULES.find((rule) => rule.pattern.test(name))?.tiles || null;
}

const LANDMARK_ATLAS_RULES = Object.freeze([
  { pattern: /AureliaTower|AureliaCrown/i, key: "facadeAtlas", tile: 0 },
  { pattern: /AureliaPodium|AureliaEntryCanopy|AureliaColumn|AureliaDome/i, key: "facadeAtlas", tile: 2 },
  { pattern: /FremontStage/i, key: "facadeAtlas", tile: 10 },
  { pattern: /MetroStation|MetroLobby/i, key: "facadeAtlas", tile: 6 },
  { pattern: /AirportTerminal|AirportConcourse/i, key: "facadeAtlas", tile: 1 },
  { pattern: /AirportHangar/i, key: "facilityAtlas", tile: 0 },
  { pattern: /ControlTowerShaft/i, key: "facilityAtlas", tile: 3 },
  { pattern: /ControlTowerCab/i, key: "facilityAtlas", tile: 4 },
  { pattern: /NellisHangar/i, key: "facilityAtlas", tile: 0 },
  { pattern: /NellisControlTower/i, key: "facilityAtlas", tile: 3 },
  { pattern: /NellisTowerCab/i, key: "facilityAtlas", tile: 4 },
  { pattern: /Area51MainHangar/i, key: "facilityAtlas", tile: 8 },
  { pattern: /Area51ResearchHangar/i, key: "facilityAtlas", tile: 9 },
  { pattern: /Area51Bunker/i, key: "facilityAtlas", tile: 10 },
  { pattern: /Area51ControlTower/i, key: "facilityAtlas", tile: 11 },
  { pattern: /Area51TowerCab/i, key: "facilityAtlas", tile: 12 },
  { pattern: /OccupationCheckpoint/i, key: "facilityAtlas", tile: 13 },
]);

function landmarkAtlasForName(value) {
  const name = String(value || "");
  const rule = LANDMARK_ATLAS_RULES.find((candidate) => candidate.pattern.test(name));
  return rule ? { key: rule.key, tile: rule.tile } : null;
}

function scaleBoxUvs(geometry, size, spec) {
  const uv = geometry?.getAttribute?.("uv");
  const normal = geometry?.getAttribute?.("normal");
  if (!uv || !normal) return false;
  const width = Math.max(0.01, Math.abs(size.x));
  const height = Math.max(0.01, Math.abs(size.y));
  const depth = Math.max(0.01, Math.abs(size.z));
  const horizontalUnit = Math.max(0.01, spec.worldScale?.[0] || 8);
  const verticalUnit = Math.max(0.01, spec.worldScale?.[1] || horizontalUnit);
  for (let index = 0; index < uv.count; index += 1) {
    const nx = Math.abs(normal.getX(index));
    const ny = Math.abs(normal.getY(index));
    let uScale;
    let vScale;
    if (ny > 0.5) {
      uScale = width / horizontalUnit;
      vScale = depth / horizontalUnit;
    } else if (nx > 0.5) {
      uScale = depth / horizontalUnit;
      vScale = height / verticalUnit;
    } else {
      uScale = width / horizontalUnit;
      vScale = height / verticalUnit;
    }
    uv.setXY(index, uv.getX(index) * Math.max(1, uScale), uv.getY(index) * Math.max(1, vScale));
  }
  uv.needsUpdate = true;
  return true;
}

function supportsSurfaceMaps(material) {
  return Boolean(material?.isMeshStandardMaterial || material?.isMeshPhysicalMaterial);
}

function loadTexture(loader, url) {
  if (typeof loader.loadAsync === "function") return loader.loadAsync(url);
  return new Promise((resolve, reject) => loader.load(url, resolve, undefined, reject));
}

function configureColorTexture(THREE, texture, spec, anisotropy) {
  texture.name = `SinCityRealism:${spec.file}`;
  texture.wrapS = spec.atlasColumns ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.wrapT = spec.atlasRows ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  texture.repeat.set(spec.repeat[0], spec.repeat[1]);
  texture.anisotropy = anisotropy;
  texture.generateMipmaps = true;
  if (THREE.LinearMipmapLinearFilter) texture.minFilter = THREE.LinearMipmapLinearFilter;
  if (THREE.LinearFilter) texture.magFilter = THREE.LinearFilter;
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeBumpTexture(THREE, colorTexture) {
  const texture = colorTexture.clone();
  texture.name = `${colorTexture.name}:bump`;
  if (THREE.NoColorSpace !== undefined) texture.colorSpace = THREE.NoColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Applies generated photoreal materials to the completed world root.
 * Returns a controller with refresh/dispose methods for lifecycle-safe use.
 */
export async function installRealismVisuals(THREE, { root, renderer, enabled = true, useBump = false } = {}) {
  if (!enabled || !root?.traverse || !THREE?.TextureLoader) {
    return { enabled: false, appliedMeshes: 0, loadedTextures: 0, refresh: () => 0, dispose: () => {} };
  }
  if (root.userData.realismVisuals?.promise) return root.userData.realismVisuals.promise;

  const state = {
    promise: null,
    originals: new Map(),
    originalGeometries: new Map(),
    materialVariants: new Map(),
    colorTextures: new Map(),
    bumpTextures: new Map(),
    disposed: false,
  };
  root.userData.realismVisuals = state;

  state.promise = (async () => {
    const loader = new THREE.TextureLoader();
    const maxAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || 4;
    const anisotropy = Math.max(1, Math.min(8, maxAnisotropy));

    const loaded = await Promise.all(Object.entries(TEXTURE_SPECS).map(async ([key, spec]) => {
      try {
        const color = configureColorTexture(THREE, await loadTexture(loader, `${REALISM_ROOT}/${spec.file}`), spec, anisotropy);
        state.colorTextures.set(key, color);
        if (useBump) state.bumpTextures.set(key, makeBumpTexture(THREE, color));
        return true;
      } catch (error) {
        console.warn(`[visuals] Unable to load ${spec.file}; procedural material retained.`, error);
        return false;
      }
    }));

    const prepareInstancedAtlasGeometry = (object, tiles) => {
      if (!object?.isInstancedMesh || !object.geometry || state.originalGeometries.has(object)) return;
      state.originalGeometries.set(object, object.geometry);
      object.geometry = object.geometry.clone();
      const tileValues = new Float32Array(object.count);
      const nameSeed = [...String(object.name || "")].reduce((sum, character) => sum + character.charCodeAt(0), 0);
      for (let index = 0; index < object.count; index += 1) {
        tileValues[index] = tiles[(index + nameSeed) % tiles.length];
      }
      object.geometry.setAttribute("facadeTile", new THREE.InstancedBufferAttribute(tileValues, 1));
      object.userData.realismAtlasTiles = [...tiles];
    };

    const installAtlasShader = (material, key, { tile = 0, instanced = false } = {}) => {
      const spec = TEXTURE_SPECS[key];
      if (!spec?.atlasColumns || !spec?.atlasRows) return;
      const fixedTile = Math.max(0, Number(tile) || 0);
      material.userData.realismAtlas = { key, tile: fixedTile, instanced };
      material.customProgramCacheKey = () => `sin-city-atlas:${key}:${instanced ? "instanced" : fixedTile}`;
      material.onBeforeCompile = (shader) => {
        shader.uniforms.sinCityAtlasTile = { value: fixedTile };
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", `#include <common>\nuniform float sinCityAtlasTile;\n#ifdef USE_INSTANCING\nattribute float facadeTile;\n#endif\nvarying float vSinCityAtlasTile;`)
          .replace("#include <begin_vertex>", `#include <begin_vertex>\n#ifdef USE_INSTANCING\nvSinCityAtlasTile = facadeTile;\n#else\nvSinCityAtlasTile = sinCityAtlasTile;\n#endif`);
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vSinCityAtlasTile;")
          .replace("#include <map_fragment>", `
#ifdef USE_MAP
  float sinCityAtlasColumn = mod(vSinCityAtlasTile, ${spec.atlasColumns.toFixed(1)});
  float sinCityAtlasRow = floor(vSinCityAtlasTile / ${spec.atlasColumns.toFixed(1)});
  vec2 sinCityLocalUv = clamp(vMapUv, vec2(0.004), vec2(0.996));
  vec2 sinCityAtlasUv = vec2(
    (sinCityAtlasColumn + sinCityLocalUv.x) / ${spec.atlasColumns.toFixed(1)},
    1.0 - (sinCityAtlasRow + 1.0 - sinCityLocalUv.y) / ${spec.atlasRows.toFixed(1)}
  );
  vec4 sampledDiffuseColor = texture2D(map, sinCityAtlasUv);
  diffuseColor *= sampledDiffuseColor;
#endif`);
      };
    };

    const materialFor = (original, key, atlas = {}) => {
      if (!supportsSurfaceMaps(original) || !state.colorTextures.has(key)) return original;
      const atlasKey = TEXTURE_SPECS[key]?.atlasColumns ? `:${atlas.instanced ? "instance" : atlas.tile ?? 0}` : "";
      const cacheKey = `${original.uuid}:${key}${atlasKey}`;
      if (state.materialVariants.has(cacheKey)) return state.materialVariants.get(cacheKey);

      const spec = TEXTURE_SPECS[key];
      const material = original.clone();
      material.name = `${original.name || "WorldMaterial"}:realism:${key}`;
      material.map = state.colorTextures.get(key);
      material.bumpMap = useBump && spec.bumpScale > 0 ? state.bumpTextures.get(key) : null;
      material.bumpScale = useBump ? spec.bumpScale : 0;
      material.roughness = spec.roughness;
      material.metalness = spec.metalness;
      material.color?.setHex?.(spec.tint);
      if (spec.emissive !== undefined && material.emissive) material.emissive.setHex(spec.emissive);
      if (spec.emissiveIntensity !== undefined) material.emissiveIntensity = spec.emissiveIntensity;
      material.envMapIntensity = Math.max(0.75, Number(material.envMapIntensity) || 0);
      installAtlasShader(material, key, atlas);
      material.needsUpdate = true;
      state.materialVariants.set(cacheKey, material);
      return material;
    };

    const refresh = () => {
      if (state.disposed) return 0;
      let applied = 0;
      root.traverse((object) => {
        if (!object?.isMesh || object.userData?.realismVisualIgnore) return;
        const cityAtlasTiles = object.isInstancedMesh ? facadeAtlasTilesForName(object.name) : null;
        const landmarkAtlas = cityAtlasTiles ? null : landmarkAtlasForName(object.name);
        const key = cityAtlasTiles ? "facadeAtlas" : landmarkAtlas?.key || realismKeyForName(object.name);
        if (!key || !state.colorTextures.has(key)) return;
        if (cityAtlasTiles) prepareInstancedAtlasGeometry(object, cityAtlasTiles);
        else if (!object.isInstancedMesh && object.geometry && !state.originalGeometries.has(object)) {
          state.originalGeometries.set(object, object.geometry);
          object.geometry = object.geometry.clone();
          if (!TEXTURE_SPECS[key]?.atlasColumns) scaleBoxUvs(object.geometry, object.scale, TEXTURE_SPECS[key]);
        }
        if (!state.originals.has(object)) state.originals.set(object, object.material);
        const original = state.originals.get(object);
        const atlas = { tile: landmarkAtlas?.tile ?? 0, instanced: Boolean(cityAtlasTiles) };
        if (Array.isArray(original)) object.material = original.map((item) => materialFor(item, key, atlas));
        else object.material = materialFor(original, key, atlas);
        object.userData.realismVisualKey = key;
        if (landmarkAtlas) object.userData.realismAtlasTile = landmarkAtlas.tile;
        applied += 1;
      });
      return applied;
    };

    const appliedMeshes = refresh();
    const controller = {
      enabled: true,
      appliedMeshes,
      loadedTextures: loaded.filter(Boolean).length,
      refresh,
      dispose() {
        if (state.disposed) return;
        state.disposed = true;
        state.originals.forEach((material, object) => {
          if (object) object.material = material;
          if (object?.userData) {
            delete object.userData.realismVisualKey;
            delete object.userData.realismAtlasTile;
            delete object.userData.realismAtlasTiles;
          }
        });
        state.originalGeometries.forEach((geometry, object) => {
          object?.geometry?.dispose?.();
          if (object) object.geometry = geometry;
        });
        state.materialVariants.forEach((material) => material.dispose?.());
        state.colorTextures.forEach((texture) => texture.dispose?.());
        state.bumpTextures.forEach((texture) => texture.dispose?.());
        state.originals.clear();
        state.originalGeometries.clear();
        state.materialVariants.clear();
        state.colorTextures.clear();
        state.bumpTextures.clear();
        delete root.userData.realismVisuals;
      },
    };
    root.userData.realismVisuals.controller = controller;
    return controller;
  })();

  return state.promise;
}

export const REALISM_VISUAL_ASSETS = Object.freeze(Object.fromEntries(
  Object.entries(TEXTURE_SPECS).map(([key, spec]) => [key, `${REALISM_ROOT}/${spec.file}`]),
));
