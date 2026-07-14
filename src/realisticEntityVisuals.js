const NPC_ATLAS = "/assets/sprites/characters/npcs-complete-4x4-v3-runtime.png";
const VEHICLE_ATLAS = "/assets/sprites/vehicles/vehicles-realistic-types-4x2-v2-runtime.png";
const PLAYER_ACTION_ATLAS = "/assets/sprites/characters/player-actions-realistic-4x4-v2-runtime.png";
const PICKUP_ATLAS = "/assets/sprites/pickups/pickups-complete-5x2-v1-runtime.png";
const ENTITY_VISUAL_MODE = "sprite-billboard";
const USE_IMAGE_VOXEL_3D = ENTITY_VISUAL_MODE === "image-voxel-3d";

const VEHICLE_DIRECTION_ATLASES = Object.freeze({
  sedanTaxi: { url: "/assets/sprites/vehicles/vehicles-sedan-taxi-8dir-v1-runtime.png", chromaKey: false },
  limoSports: { url: "/assets/sprites/vehicles/vehicles-limo-sports-8dir-v1-runtime.png", chromaKey: false },
  policeOffroad: { url: "/assets/sprites/vehicles/vehicles-police-offroad-8dir-v1-runtime.png", chromaKey: true },
  motorcycles: { url: "/assets/sprites/vehicles/vehicles-motorcycles-8dir-v1-runtime.png", chromaKey: false },
  aircraft: { url: "/assets/sprites/vehicles/aircraft-plane-helicopter-8dir-v1-chroma.png", chromaKey: true },
  service: { url: "/assets/sprites/vehicles/vehicles-service-8dir-v2-runtime.png", chromaKey: false },
  bicycleAtv: { url: "/assets/sprites/vehicles/vehicles-bicycle-atv-8dir-v1-runtime.png", chromaKey: false },
});

const VEHICLE_DIRECTION_CONFIG = Object.freeze({
  compact: { atlas: "sedanTaxi", baseTile: 0 },
  sedan: { atlas: "sedanTaxi", baseTile: 0 },
  taxi: { atlas: "sedanTaxi", baseTile: 8 },
  limousine: { atlas: "limoSports", baseTile: 0 },
  muscle: { atlas: "limoSports", baseTile: 8 },
  sports: { atlas: "limoSports", baseTile: 8 },
  sports_car: { atlas: "limoSports", baseTile: 8 },
  policeCruiser: { atlas: "policeOffroad", baseTile: 0 },
  policeSuv: { atlas: "policeOffroad", baseTile: 0 },
  police_cruiser: { atlas: "policeOffroad", baseTile: 0 },
  police_suv: { atlas: "policeOffroad", baseTile: 0 },
  suv: { atlas: "policeOffroad", baseTile: 8 },
  motorcycle: { atlas: "motorcycles", baseTile: 0 },
  streetMotorcycle: { atlas: "motorcycles", baseTile: 0 },
  bicycle: { atlas: "bicycleAtv", baseTile: 0 },
  bike: { atlas: "bicycleAtv", baseTile: 0 },
  atv: { atlas: "bicycleAtv", baseTile: 8 },
  dirtBike: { atlas: "motorcycles", baseTile: 8 },
  private_jet: { atlas: "aircraft", baseTile: 0 },
  plane: { atlas: "aircraft", baseTile: 0 },
  helicopter: { atlas: "aircraft", baseTile: 8 },
  utilityVan: { atlas: "service", baseTile: 0 },
  utility_van: { atlas: "service", baseTile: 0 },
  airportShuttle: { atlas: "service", baseTile: 8 },
  airport_shuttle: { atlas: "service", baseTile: 8 },
});

const NPC_TILES = Object.freeze({
  local: 0,
  tourist: 1,
  casinoDealer: 2,
  security: 3,
  patrolOfficer: 4,
  detective: 5,
  mechanic: 6,
  tunnelRunner: 7,
  highRoller: 8,
  pigEnforcer: 9,
  reptilianMarshal: 10,
  nellisGuard: 11,
  alienObserver: 12,
  area51Scientist: 13,
});

const NPC_VARIANT_TILES = Object.freeze({
  street_performer: 14,
  pilot: 15,
  drain_scout: 7,
  tunnel_squatter: 7,
  smuggler: 7,
});

const PICKUP_TILES = Object.freeze({
  cash: 0,
  medkit: 1,
  armor: 2,
  ammo: 3,
  casinoChips: 4,
  lockpick: 5,
  fuel: 6,
  weaponCrate: 7,
  contraband: 8,
  collectible: 9,
});

const VEHICLE_TILES = Object.freeze({
  compact: 0, sedan: 0, taxi: 1, limousine: 2, muscle: 3, sports: 3,
  policeCruiser: 4, policeSuv: 4, suv: 5, utilityVan: 5, airportShuttle: 5,
  offroadPickup: 5, offroadSuv: 5, duneBuggy: 5, atv: 5,
  streetMotorcycle: 6, bicycle: 6, dirtBike: 7,
  sports_car: 3, police_cruiser: 4, police_suv: 4, utility_van: 5,
  airport_shuttle: 5, motorcycle: 6,
});

const configureTexture = (THREE, texture, anisotropy) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
};

const setTileUv = (geometry, tile, columns, rows) => {
  const column = tile % columns;
  const topRow = Math.floor(tile / columns);
  const u0 = column / columns;
  const u1 = (column + 1) / columns;
  const v1 = 1 - topRow / rows;
  const v0 = 1 - (topRow + 1) / rows;
  const uv = geometry.getAttribute("uv");
  uv.setXY(0, u0, v1);
  uv.setXY(1, u1, v1);
  uv.setXY(2, u0, v0);
  uv.setXY(3, u1, v0);
  uv.needsUpdate = true;
};

const collectProceduralMeshes = (object) => {
  const meshes = [];
  object.traverse((child) => {
    if (!child.isMesh || child.userData?.realisticBillboard || child.userData?.realisticKeepVisible) return;
    meshes.push({ mesh: child, visible: child.visible });
  });
  return meshes;
};

const setProceduralMeshesVisible = (records, visible) => {
  for (const record of records) {
    const mesh = record.mesh;
    if (!mesh) continue;
    if (visible) {
      mesh.visible = record.visible;
      if (mesh.userData?.hiddenByRealismLayer) delete mesh.userData.hiddenByRealismLayer;
    } else if (record.visible) {
      mesh.visible = false;
      mesh.userData.hiddenByRealismLayer = true;
    }
  }
};

const disposeBillboard = (visual) => {
  const geometries = new Set();
  const materials = new Set();
  visual?.traverse?.((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (Array.isArray(child.material)) child.material.forEach((material) => materials.add(material));
    else if (child.material) materials.add(child.material);
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
};

const disposeVisualChildren = (visual) => {
  const geometries = new Set();
  const materials = new Set();
  visual?.traverse?.((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (Array.isArray(child.material)) child.material.forEach((material) => materials.add(material));
    else if (child.material) materials.add(child.material);
  });
  visual?.clear?.();
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
};

const createChromaMaterial = (THREE, texture) => new THREE.ShaderMaterial({
  uniforms: { map: { value: texture } },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(map, vUv);
      float greenDominance = texel.g - max(texel.r, texel.b);
      float key = smoothstep(0.12, 0.34, greenDominance) * smoothstep(0.38, 0.82, texel.g);
      texel.a *= 1.0 - key;
      if (texel.a < 0.08) discard;
      gl_FragColor = texel;
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthTest: true,
  depthWrite: true,
  side: THREE.DoubleSide,
  toneMapped: true,
});

const createBillboard = (THREE, texture, { tile, columns, rows, width, height, feetOffset = 0, name, chromaKey = false }) => {
  const group = new THREE.Group();
  group.name = `${name}BillboardRoot`;
  const geometry = new THREE.PlaneGeometry(width, height, 1, 1);
  setTileUv(geometry, tile, columns, rows);
  const material = chromaKey
    ? createChromaMaterial(THREE, texture)
    : new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.08,
      depthTest: true,
      depthWrite: true,
      side: THREE.DoubleSide,
      toneMapped: true,
    });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `${name}Billboard`;
  mesh.position.y = height * 0.5 + feetOffset;
  mesh.userData.realisticBillboard = true;
  mesh.castShadow = true;
  group.add(mesh);
  group.userData.tile = tile;
  group.userData.geometry = geometry;
  group.userData.mesh = mesh;
  group.userData.material = material;
  group.userData.loadState = "loading";
  return group;
};

const createVoxelVisual = (THREE, textureState, {
  tile,
  columns,
  rows,
  width,
  height,
  depth = 0.18,
  feetOffset = 0,
  name,
  sampleWidth = 22,
  sampleHeight = 34,
  chromaKey = false,
}) => {
  const group = new THREE.Group();
  group.name = `${name}Voxel3DRoot`;
  group.userData.realisticBillboard = false;
  group.userData.imageVoxel3d = true;
  group.userData.tile = tile;
  group.userData.loadState = "loading";
  group.userData.rebuild = (nextTile = group.userData.tile) => {
    if (!textureState.texture?.image) return false;
    if (group.userData.tile === nextTile && group.userData.voxelReady) return true;
    group.userData.tile = nextTile;
    disposeVisualChildren(group);
    const image = textureState.texture.image;
    const tileWidth = Math.max(1, Math.floor(image.width / columns));
    const tileHeight = Math.max(1, Math.floor(image.height / rows));
    const sourceX = (nextTile % columns) * tileWidth;
    const sourceY = Math.floor(nextTile / columns) * tileHeight;
    const canvas = document.createElement("canvas");
    canvas.width = sampleWidth;
    canvas.height = sampleHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return false;
    context.imageSmoothingEnabled = true;
    context.clearRect(0, 0, sampleWidth, sampleHeight);
    context.drawImage(image, sourceX, sourceY, tileWidth, tileHeight, 0, 0, sampleWidth, sampleHeight);
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    let count = 0;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        const offset = (y * sampleWidth + x) * 4;
        const alpha = pixels[offset + 3];
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const keyed = chromaKey && green > 95 && green - Math.max(red, blue) > 28;
        if (alpha > 42 && !keyed) count += 1;
      }
    }
    if (!count) return false;
    const cellWidth = width / sampleWidth;
    const cellHeight = height / sampleHeight;
    const geometry = new THREE.BoxGeometry(cellWidth * 0.96, cellHeight * 0.96, depth);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.7,
      metalness: 0.04,
      emissive: 0x050505,
      emissiveIntensity: 0.08,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `${name}ImageVoxel3D`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.imageVoxel3d = true;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3(1, 1, 1);
    const color = new THREE.Color();
    let index = 0;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        const offset = (y * sampleWidth + x) * 4;
        const alpha = pixels[offset + 3];
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const keyed = chromaKey && green > 95 && green - Math.max(red, blue) > 28;
        if (alpha <= 42 || keyed) continue;
        const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
        const localX = -width * 0.5 + (x + 0.5) * cellWidth;
        const localY = feetOffset + height - (y + 0.5) * cellHeight;
        const localZ = (luminance - 0.5) * depth * 0.45;
        const alphaScale = Math.max(0.35, alpha / 255);
        const depthScale = 0.58 + luminance * 0.58;
        position.set(localX, localY, localZ);
        scale.set(alphaScale, alphaScale, depthScale);
        matrix.compose(position, quaternion, scale);
        mesh.setMatrixAt(index, matrix);
        color.setRGB(red / 255, green / 255, blue / 255, THREE.SRGBColorSpace);
        mesh.setColorAt(index, color);
        index += 1;
      }
    }
    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
    group.userData.voxelReady = true;
    return true;
  };
  return group;
};

const createTextureState = (THREE, loader, url, anisotropy, { chromaKey = false } = {}) => {
  const state = {
    url,
    texture: null,
    status: "loading",
    error: null,
    chromaKey,
    listeners: new Set(),
    disposed: false,
  };
  const settle = (status, texture, reason) => {
    if (state.disposed) {
      texture?.dispose?.();
      return;
    }
    if (texture) state.texture = configureTexture(THREE, texture, anisotropy);
    state.status = status;
    state.error = reason instanceof Error ? reason : reason ? new Error(String(reason)) : null;
    const listeners = [...state.listeners];
    state.listeners.clear();
    listeners.forEach((listener) => listener(state));
  };
  try {
    state.texture = loader.load(
      url,
      (texture) => settle("ready", texture),
      undefined,
      (reason) => settle("error", null, reason || `Unable to load ${url}`),
    );
  } catch (error) {
    settle("error", null, error);
  }
  return state;
};

export function createRealisticEntityVisuals(THREE, { renderer } = {}) {
  const loader = new THREE.TextureLoader();
  const anisotropy = Math.max(1, Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 4));
  const npcTexture = createTextureState(THREE, loader, NPC_ATLAS, anisotropy);
  const vehicleTexture = createTextureState(THREE, loader, VEHICLE_ATLAS, anisotropy);
  const playerTexture = createTextureState(THREE, loader, PLAYER_ACTION_ATLAS, anisotropy);
  const pickupTexture = createTextureState(THREE, loader, PICKUP_ATLAS, anisotropy);
  const directionalVehicleTextures = Object.fromEntries(Object.entries(VEHICLE_DIRECTION_ATLASES).map(([key, spec]) => [
    key,
    createTextureState(THREE, loader, spec.url, anisotropy, { chromaKey: spec.chromaKey }),
  ]));
  const textureStates = [npcTexture, vehicleTexture, playerTexture, pickupTexture, ...Object.values(directionalVehicleTextures)];
  const tracked = new Map();
  const cameraWorld = new THREE.Vector3();
  const objectWorld = new THREE.Vector3();
  let disposed = false;

  const restoreEntry = (entry) => {
    setProceduralMeshesVisible(entry.proceduralMeshes, true);
    entry.visual.visible = false;
    if (entry.fallbackVisual) entry.fallbackVisual.visible = true;
    entry.active = false;
  };

  const applyTextureState = (entry) => {
    if (disposed || tracked.get(entry.object) !== entry) return;
    const { status } = entry.textureState;
    entry.visual.userData.loadState = status;
    entry.visual.userData.loadError = entry.textureState.error?.message || null;
    entry.visual.userData.assetReady = status === "ready";
    if (entry.suspended || status !== "ready") {
      restoreEntry(entry);
      return;
    }
    if (USE_IMAGE_VOXEL_3D && entry.visual.userData.rebuild) {
      const built = entry.visual.userData.rebuild(entry.visual.userData.tile);
      if (!built) {
        restoreEntry(entry);
        return;
      }
    }
    if (entry.kind === "entity") {
      setProceduralMeshesVisible(entry.proceduralMeshes, false);
      entry.visual.visible = true;
      entry.active = true;
    }
  };

  const track = (entry) => {
    tracked.set(entry.object, entry);
    entry.textureListener = () => applyTextureState(entry);
    if (entry.textureState.status === "loading") entry.textureState.listeners.add(entry.textureListener);
    applyTextureState(entry);
    return entry.visual;
  };

  const attachNpc = (object, profileId = "local", variant = null) => {
    if (disposed || !object?.isObject3D) return null;
    if (tracked.has(object) || object.userData.realisticVisual) return tracked.get(object)?.visual || object.userData.realisticVisual;
    const tile = NPC_VARIANT_TILES[variant] ?? NPC_TILES[profileId] ?? 0;
    const width = profileId === "pigEnforcer" || profileId === "reptilianMarshal" ? 1.62 : 1.28;
    const height = profileId === "alienObserver" ? 2.65 : 2.5;
    const visual = USE_IMAGE_VOXEL_3D
      ? createVoxelVisual(THREE, npcTexture, { tile, columns: 4, rows: 4, width, height, depth: 0.2, feetOffset: -0.03, name: `RealNpc_${profileId}_${variant || "default"}`, sampleWidth: 22, sampleHeight: 36 })
      : createBillboard(THREE, npcTexture.texture, { tile, columns: 4, rows: 4, width, height, feetOffset: -0.03, name: `RealNpc_${profileId}_${variant || "default"}` });
    visual.visible = false;
    object.add(visual);
    object.userData.realisticVisual = visual;
    return track({
      kind: "entity",
      object,
      visual,
      textureState: npcTexture,
      proceduralMeshes: collectProceduralMeshes(object),
      userDataKey: "realisticVisual",
      active: false,
      suspended: false,
    });
  };

  const attachVehicle = (object, type = "sedan") => {
    const directional = VEHICLE_DIRECTION_CONFIG[type] || null;
    if (disposed || !object?.isObject3D || (!directional && !(type in VEHICLE_TILES))) return null;
    if (tracked.has(object) || object.userData.realisticVisual) return tracked.get(object)?.visual || object.userData.realisticVisual;
    const dimensions = object.userData.dimensions || { width: 2, length: 4, height: 1.6 };
    const isBike = ["streetMotorcycle", "bicycle", "bike", "dirtBike", "motorcycle"].includes(type);
    const isAtv = type === "atv";
    const textureState = directional ? directionalVehicleTextures[directional.atlas] : vehicleTexture;
    const tile = directional?.baseTile ?? VEHICLE_TILES[type];
    const rows = directional ? 4 : 2;
    const width = isBike ? 2.25 : isAtv ? 2.8 : Math.max(3.9, Math.min(6.4, dimensions.length * 1.12));
    const height = isBike ? 1.75 : isAtv ? 1.9 : Math.max(2, dimensions.height * 1.5);
    const feetOffset = directional ? -height * 0.29 : -height * 0.2;
    const visual = USE_IMAGE_VOXEL_3D
      ? createVoxelVisual(THREE, textureState, { tile, columns: 4, rows, width, height, depth: isBike ? 0.22 : 0.36, feetOffset, name: `RealVehicle_${type}`, sampleWidth: isBike ? 30 : 38, sampleHeight: isBike ? 22 : 24, chromaKey: textureState.chromaKey })
      : createBillboard(THREE, textureState.texture, { tile, columns: 4, rows, width, height, feetOffset, name: `RealVehicle_${type}`, chromaKey: textureState.chromaKey });
    visual.userData.setTile = (nextTile) => {
      if (visual.userData.tile === nextTile) return;
      if (USE_IMAGE_VOXEL_3D) {
        visual.userData.rebuild?.(nextTile);
        return;
      }
      visual.userData.tile = nextTile;
      setTileUv(visual.userData.geometry, nextTile, 4, rows);
    };
    visual.visible = false;
    object.add(visual);
    object.userData.realisticVisual = visual;
    return track({
      kind: "entity",
      object,
      visual,
      textureState,
      proceduralMeshes: collectProceduralMeshes(object),
      userDataKey: "realisticVisual",
      directional: Boolean(directional),
      directionBaseTile: directional?.baseTile ?? 0,
      active: false,
      suspended: false,
    });
  };

  const attachPickup = (object, kind = "cash") => {
    if (disposed || !object?.isObject3D || !(kind in PICKUP_TILES)) return null;
    if (tracked.has(object) || object.userData.realisticVisual) return tracked.get(object)?.visual || object.userData.realisticVisual;
    const tile = PICKUP_TILES[kind];
    const large = kind === "weaponCrate" || kind === "contraband";
    const width = large ? 1.16 : 0.9;
    const height = large ? 0.92 : 0.88;
    const visual = USE_IMAGE_VOXEL_3D
      ? createVoxelVisual(THREE, pickupTexture, { tile, columns: 5, rows: 2, width, height, depth: 0.14, feetOffset: 0.02, name: `RealPickup_${kind}`, sampleWidth: 18, sampleHeight: 18 })
      : createBillboard(THREE, pickupTexture.texture, {
        tile,
        columns: 5,
        rows: 2,
        width,
        height,
        feetOffset: 0.02,
        name: `RealPickup_${kind}`,
      });
    visual.visible = false;
    object.add(visual);
    object.userData.realisticVisual = visual;
    return track({
      kind: "entity",
      object,
      visual,
      textureState: pickupTexture,
      proceduralMeshes: collectProceduralMeshes(object),
      userDataKey: "realisticVisual",
      active: false,
      suspended: false,
    });
  };

  const attachPlayerActions = (object) => {
    if (disposed || !object?.isObject3D) return null;
    if (tracked.has(object) || object.userData.realisticActionVisual) return tracked.get(object)?.visual || object.userData.realisticActionVisual;
    const visual = USE_IMAGE_VOXEL_3D
      ? createVoxelVisual(THREE, playerTexture, { tile: 4, columns: 4, rows: 4, width: 1.92, height: 2.56, depth: 0.22, feetOffset: -0.49, name: "RealPlayerAction", sampleWidth: 24, sampleHeight: 38 })
      : createBillboard(THREE, playerTexture.texture, { tile: 4, columns: 4, rows: 4, width: 1.92, height: 2.56, feetOffset: -0.49, name: "RealPlayerAction" });
    visual.visible = false;
    visual.userData.setTile = (tile) => {
      if (visual.userData.tile === tile) return;
      if (USE_IMAGE_VOXEL_3D) {
        visual.userData.rebuild?.(tile);
        return;
      }
      visual.userData.tile = tile;
      setTileUv(visual.userData.geometry, tile, 4, 4);
    };
    object.add(visual);
    object.userData.realisticActionVisual = visual;
    return track({
      kind: "playerActions",
      object,
      visual,
      textureState: playerTexture,
      proceduralMeshes: [],
      fallbackVisual: object.userData.generatedVisual || null,
      userDataKey: "realisticActionVisual",
      active: false,
      suspended: false,
    });
  };

  const restore = (object) => {
    const entry = tracked.get(object);
    if (!entry) return false;
    entry.suspended = true;
    restoreEntry(entry);
    return true;
  };

  const detach = (object, { restoreProcedural = true } = {}) => {
    const entry = tracked.get(object);
    if (!entry) return false;
    entry.textureState.listeners.delete(entry.textureListener);
    if (restoreProcedural) restoreEntry(entry);
    entry.visual.parent?.remove(entry.visual);
    disposeBillboard(entry.visual);
    if (entry.userDataKey && object.userData?.[entry.userDataKey] === entry.visual) delete object.userData[entry.userDataKey];
    tracked.delete(object);
    return true;
  };

  const update = (camera) => {
    if (disposed || !camera?.isCamera) return;
    camera.getWorldPosition(cameraWorld);
    for (const entry of tracked.values()) {
      const { object, visual, textureState } = entry;
      if (entry.suspended || textureState.status !== "ready") {
        restoreEntry(entry);
        continue;
      }
      if (!object?.visible || !visual?.visible) continue;
      object.getWorldPosition(objectWorld);
      const worldYaw = Math.atan2(cameraWorld.x - objectWorld.x, cameraWorld.z - objectWorld.z);
      if (entry.directional) {
        const frontRelative = Math.atan2(
          Math.sin(worldYaw - object.rotation.y - Math.PI),
          Math.cos(worldYaw - object.rotation.y - Math.PI),
        );
        const direction = ((Math.round(-frontRelative / (Math.PI / 4)) % 8) + 8) % 8;
        visual.userData.setTile(entry.directionBaseTile + direction);
      }
      visual.rotation.y = worldYaw - object.rotation.y;
    }
  };

  const snapshot = () => ({
    mode: ENTITY_VISUAL_MODE,
    disposed,
    tracked: tracked.size,
    textures: Object.fromEntries(textureStates.map((state) => [state.url, {
      status: state.status,
      error: state.error?.message || null,
    }])),
  });

  const dispose = () => {
    if (disposed) return;
    [...tracked.keys()].forEach((object) => detach(object, { restoreProcedural: true }));
    disposed = true;
    textureStates.forEach((state) => {
      state.disposed = true;
      state.listeners.clear();
      state.texture?.dispose?.();
    });
  };

  return Object.freeze({ attachNpc, attachVehicle, attachPickup, attachPlayerActions, update, restore, detach, snapshot, dispose });
}

export const REALISTIC_VISUAL_ASSETS = Object.freeze({
  npc: NPC_ATLAS,
  vehicle: VEHICLE_ATLAS,
  playerActions: PLAYER_ACTION_ATLAS,
  pickup: PICKUP_ATLAS,
  directionalVehicles: Object.freeze(Object.fromEntries(
    Object.entries(VEHICLE_DIRECTION_ATLASES).map(([key, value]) => [key, value.url]),
  )),
});

export const REALISTIC_SPRITE_COVERAGE = Object.freeze({
  characters: Object.freeze([...Object.keys(NPC_TILES), ...Object.keys(NPC_VARIANT_TILES)]),
  vehicles: Object.freeze([...new Set([...Object.keys(VEHICLE_TILES), ...Object.keys(VEHICLE_DIRECTION_CONFIG)])]),
  pickups: Object.freeze(Object.keys(PICKUP_TILES)),
});
