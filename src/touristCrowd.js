const DEFAULT_ATLAS_URL = "/assets/sprites/characters/tourists-complete-4x4-v2-runtime.png";
const LEGACY_ATLAS_URL = "/assets/sprites/characters/tourists-variety-4x2-v1-runtime.png";
const ATLAS_COLUMNS = 4;
const ATLAS_ROWS = 4;
const ATLAS_TILE_COUNT = 15;
const MAX_TOURISTS = 220;

export const TOURIST_CROWD_QUALITY = Object.freeze({
  low: Object.freeze({ population: 160, farDistance: 280, cullInterval: 0.24 }),
  balanced: Object.freeze({ population: 180, farDistance: 390, cullInterval: 0.18 }),
  high: Object.freeze({ population: 200, farDistance: 520, cullInterval: 0.13 }),
  ultra: Object.freeze({ population: 220, farDistance: 680, cullInterval: 0.09 }),
});

export const TOURIST_CROWD_CLUSTERS = Object.freeze([
  Object.freeze({ id: "strip", count: 108 }),
  Object.freeze({ id: "fremont", count: 46 }),
  Object.freeze({ id: "casino", count: 36 }),
  Object.freeze({ id: "airport", count: 30 }),
]);

const FALLBACK_LOOKS = Object.freeze([
  { skin: [246, 190, 144], shirt: [36, 204, 255], pants: [24, 34, 58], accent: [255, 236, 91] },
  { skin: [110, 66, 43], shirt: [255, 69, 139], pants: [29, 42, 74], accent: [255, 255, 255] },
  { skin: [206, 139, 92], shirt: [255, 144, 40], pants: [34, 30, 51], accent: [74, 244, 192] },
  { skin: [89, 52, 36], shirt: [121, 86, 255], pants: [18, 31, 43], accent: [255, 195, 58] },
  { skin: [247, 207, 167], shirt: [68, 233, 151], pants: [37, 45, 69], accent: [255, 78, 107] },
  { skin: [153, 95, 64], shirt: [255, 219, 75], pants: [31, 52, 70], accent: [41, 199, 255] },
  { skin: [232, 171, 119], shirt: [255, 90, 68], pants: [23, 29, 49], accent: [218, 235, 255] },
  { skin: [74, 43, 31], shirt: [37, 211, 201], pants: [46, 32, 62], accent: [255, 167, 213] },
]);

const TINTS = Object.freeze([
  [1.0, 1.0, 1.0],
  [1.08, 0.96, 0.92],
  [0.92, 1.04, 1.08],
  [1.05, 1.02, 0.88],
  [0.98, 0.91, 1.08],
]);

const VERTEX_SHADER = /* glsl */ `
  attribute vec3 instanceTint;
  attribute float instanceTile;
  attribute float instancePhase;
  attribute float instanceTempo;

  uniform float uTime;
  uniform vec2 uAtlasGrid;

  varying vec2 vAtlasUv;
  varying vec3 vTint;
  varying float vViewDistance;

  void main() {
    vec4 centerWorld = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float width = length(instanceMatrix[0].xyz);
    float height = length(instanceMatrix[1].xyz);

    vec3 cameraRight = normalize(vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]));
    vec3 cameraUp = normalize(vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]));
    float gait = uTime * instanceTempo + instancePhase;
    float bob = abs(sin(gait)) * 0.025 * height;
    float sway = sin(gait * 0.52) * 0.018 * height * (position.y + 0.5);
    vec3 worldPosition = centerWorld.xyz;
    worldPosition += cameraRight * (position.x * width + sway);
    worldPosition += cameraUp * ((position.y + 0.5) * height + bob);

    vec2 safeUv = mix(vec2(0.012), vec2(0.988), uv);
    float tile = floor(instanceTile + 0.5);
    float column = mod(tile, uAtlasGrid.x);
    float topRow = floor(tile / uAtlasGrid.x);
    float bottomRow = uAtlasGrid.y - 1.0 - topRow;
    vAtlasUv = (vec2(column, bottomRow) + safeUv) / uAtlasGrid;
    vTint = instanceTint;
    vViewDistance = distance(cameraPosition, centerWorld.xyz);
    gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uAtlas;
  uniform float uNearFade;
  uniform float uFarFade;
  uniform float uOpacity;

  varying vec2 vAtlasUv;
  varying vec3 vTint;
  varying float vViewDistance;

  void main() {
    vec4 texel = texture2D(uAtlas, vAtlasUv);
    float nearVisibility = smoothstep(0.55, uNearFade, vViewDistance);
    float farVisibility = 1.0 - smoothstep(uFarFade * 0.82, uFarFade, vViewDistance);
    float alpha = texel.a * nearVisibility * farVisibility * uOpacity;
    if (alpha < 0.055) discard;
    vec3 color = texel.rgb * vTint;
    gl_FragColor = vec4(color, alpha);
  }
`;

function requireThree(THREE) {
  const required = [
    "Group", "InstancedMesh", "PlaneGeometry", "ShaderMaterial", "InstancedBufferAttribute",
    "DataTexture", "TextureLoader", "Object3D", "Vector3", "Matrix4", "Frustum", "Sphere",
    "BoxGeometry", "MeshStandardMaterial", "Color", "Quaternion",
  ];
  const missing = required.filter((key) => !THREE?.[key]);
  if (missing.length) throw new TypeError(`createTouristCrowd requires Three.js (${missing.join(", ")} missing).`);
}

function finite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeQuality(value) {
  const requested = String(value || "balanced").toLowerCase();
  if (requested === "test" || requested === "mobile") return "low";
  if (requested === "medium" || requested === "default") return "balanced";
  return Object.hasOwn(TOURIST_CROWD_QUALITY, requested) ? requested : "balanced";
}

function seededRandom(seedValue) {
  let state = (Number(seedValue) >>> 0) || 0x51c17a5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createFallbackAtlas(THREE) {
  const tileWidth = 24;
  const tileHeight = 48;
  const width = tileWidth * ATLAS_COLUMNS;
  const height = tileHeight * ATLAS_ROWS;
  const pixels = new Uint8Array(width * height * 4);

  const paint = (x, y, color, alpha = 255) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 4;
    pixels[offset] = color[0];
    pixels[offset + 1] = color[1];
    pixels[offset + 2] = color[2];
    pixels[offset + 3] = alpha;
  };

  const rect = (originX, originY, x0, y0, x1, y1, color) => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) paint(originX + x, originY + y, color);
    }
  };

  for (let index = 0; index < ATLAS_TILE_COUNT; index += 1) {
    const look = FALLBACK_LOOKS[index % FALLBACK_LOOKS.length];
    const column = index % ATLAS_COLUMNS;
    const topRow = Math.floor(index / ATLAS_COLUMNS);
    const originX = column * tileWidth;
    const originY = (ATLAS_ROWS - 1 - topRow) * tileHeight;
    const outline = [14, 17, 28];
    rect(originX, originY, 7, 1, 10, 16, outline);
    rect(originX, originY, 13, 1, 16, 16, outline);
    rect(originX, originY, 8, 2, 10, 16, look.pants);
    rect(originX, originY, 13, 2, 15, 16, look.pants);
    rect(originX, originY, 5, 15, 18, 33, outline);
    rect(originX, originY, 6, 16, 17, 32, look.shirt);
    rect(originX, originY, 3, 18, 6, 30, look.skin);
    rect(originX, originY, 17, 18, 20, 30, look.skin);
    rect(originX, originY, 8, 32, 15, 42, outline);
    for (let y = 33; y <= 41; y += 1) {
      for (let x = 9; x <= 14; x += 1) {
        const dx = x - 11.5;
        const dy = y - 37;
        if (dx * dx / 10 + dy * dy / 22 <= 1) paint(originX + x, originY + y, look.skin);
      }
    }
    rect(originX, originY, 4, 27, 7, 31, look.accent);
    rect(originX, originY, 16, 29, 20, 31, look.accent);
  }

  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = "SinCityTouristFallbackAtlas";
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function makeRecord(random, cluster, localIndex, clusterCount, sampler) {
  const sampled = sampler(random, localIndex);
  const idle = random() < 0.16;
  const tint = TINTS[Math.floor(random() * TINTS.length)];
  return {
    id: `${cluster}-${String(localIndex + 1).padStart(3, "0")}`,
    cluster,
    x: sampled.x,
    y: sampled.y ?? 0.2,
    z: sampled.z,
    axis: sampled.axis,
    minimum: sampled.minimum,
    maximum: sampled.maximum,
    direction: random() < 0.5 ? -1 : 1,
    speed: idle ? 0 : 0.38 + random() * 0.74,
    width: 0.72 + random() * 0.18,
    height: 1.68 + random() * 0.3,
    // Tile 15 is intentionally blank in the generated 4x4 atlas.
    tile: Math.floor(random() * ATLAS_TILE_COUNT),
    tint,
    phase: random() * Math.PI * 2,
    tempo: idle ? 0.72 + random() * 0.15 : 3.5 + random() * 1.7,
    densityScore: (localIndex + random() * 0.35) / clusterCount,
    activeOrder: 0,
  };
}

function createRecords(seed) {
  const random = seededRandom(seed);
  const records = [];
  const addCluster = (id, count, sampler) => {
    for (let index = 0; index < count; index += 1) {
      records.push(makeRecord(random, id, index, count, sampler));
    }
  };

  addCluster("strip", 108, (rng) => {
    const side = rng() < 0.5 ? -1 : 1;
    return {
      x: side * (18.1 + rng() * 5.3), y: 0.25, z: -360 + rng() * 700,
      axis: "z", minimum: -362, maximum: 342,
    };
  });
  addCluster("fremont", 46, (rng) => {
    const walkAlongX = rng() < 0.48;
    return {
      x: -20.5 + rng() * 41, y: 0.18, z: -369 + rng() * 83,
      axis: walkAlongX ? "x" : "z",
      minimum: walkAlongX ? -21.5 : -371,
      maximum: walkAlongX ? 21.5 : -282,
    };
  });
  addCluster("casino", 36, (rng) => {
    const walkAlongX = rng() < 0.28;
    return {
      x: -29 + rng() * 15.5, y: 0.21, z: -48 + rng() * 66,
      axis: walkAlongX ? "x" : "z",
      minimum: walkAlongX ? -30 : -51,
      maximum: walkAlongX ? -12.5 : 21,
    };
  });
  addCluster("airport", 30, (rng, index) => {
    const curb = index < 19;
    return curb
      ? { x: 207 + rng() * 68, y: 0.19, z: 82 + rng() * 17, axis: "x", minimum: 205, maximum: 277 }
      : { x: 260 + rng() * 15, y: 0.19, z: 103 + rng() * 73, axis: "z", minimum: 101, maximum: 179 };
  });

  records
    .slice()
    .sort((a, b) => a.densityScore - b.densityScore || a.id.localeCompare(b.id))
    .forEach((record, index) => { record.activeOrder = index; });
  return records;
}

function configureLoadedTexture(THREE, texture, anisotropy) {
  texture.name = "SinCityTouristAtlas";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = clamp(Math.floor(finite(anisotropy, 4)), 1, 16);
  texture.needsUpdate = true;
  return texture;
}

function disposeObjectTree(object) {
  const geometries = new Set();
  const materials = new Set();
  object?.traverse?.((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (Array.isArray(child.material)) child.material.forEach((material) => materials.add(material));
    else if (child.material) materials.add(child.material);
  });
  object?.parent?.remove?.(object);
  object?.clear?.();
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

function sampleAtlasTile(texture, tile, sampleWidth, sampleHeight) {
  const image = texture?.image;
  if (!image?.width || !image?.height) return null;
  const tileWidth = Math.max(1, Math.floor(image.width / ATLAS_COLUMNS));
  const tileHeight = Math.max(1, Math.floor(image.height / ATLAS_ROWS));
  const sourceX = (tile % ATLAS_COLUMNS) * tileWidth;
  const sourceY = texture.flipY === false
    ? (ATLAS_ROWS - 1 - Math.floor(tile / ATLAS_COLUMNS)) * tileHeight
    : Math.floor(tile / ATLAS_COLUMNS) * tileHeight;
  const sampled = new Uint8ClampedArray(sampleWidth * sampleHeight * 4);

  if (image.data && image.data.length >= image.width * image.height * 4) {
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        const srcX = clamp(Math.floor(sourceX + (x + 0.5) * tileWidth / sampleWidth), 0, image.width - 1);
        const srcY = clamp(Math.floor(sourceY + (y + 0.5) * tileHeight / sampleHeight), 0, image.height - 1);
        const src = (srcY * image.width + srcX) * 4;
        const dst = (y * sampleWidth + x) * 4;
        sampled[dst] = image.data[src];
        sampled[dst + 1] = image.data[src + 1];
        sampled[dst + 2] = image.data[src + 2];
        sampled[dst + 3] = image.data[src + 3];
      }
    }
    return sampled;
  }

  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.imageSmoothingEnabled = true;
  context.clearRect(0, 0, sampleWidth, sampleHeight);
  context.drawImage(image, sourceX, sourceY, tileWidth, tileHeight, 0, 0, sampleWidth, sampleHeight);
  return context.getImageData(0, 0, sampleWidth, sampleHeight).data;
}

function createTouristVoxelModel(THREE, atlasTexture, record) {
  const root = new THREE.Group();
  root.name = `TouristImageVoxel3D_${record.id}`;
  root.userData.record = record;
  root.userData.imageVoxel3d = true;

  const sampleWidth = 12;
  const sampleHeight = 24;
  const pixels = sampleAtlasTile(atlasTexture, record.tile, sampleWidth, sampleHeight);
  let count = 0;
  if (pixels) {
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        if (pixels[(y * sampleWidth + x) * 4 + 3] > 42) count += 1;
      }
    }
  }

  if (!pixels || !count) {
    const fallback = new THREE.Mesh(
      new THREE.BoxGeometry(record.width * 0.42, record.height * 0.78, 0.16),
      new THREE.MeshStandardMaterial({ color: 0xffd08c, roughness: 0.78, metalness: 0.02 }),
    );
    fallback.name = "TouristImageVoxelFallback";
    fallback.position.y = record.height * 0.45;
    root.add(fallback);
    return root;
  }

  const cellWidth = record.width / sampleWidth;
  const cellHeight = record.height / sampleHeight;
  const depth = Math.max(0.09, record.width * 0.16);
  const geometry = new THREE.BoxGeometry(cellWidth * 0.94, cellHeight * 0.94, depth);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.78,
    metalness: 0.03,
    emissive: 0x030303,
    emissiveIntensity: 0.05,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = "TouristAtlasPixelVoxelMesh";
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.userData.nonColliding = true;
  mesh.userData.imageVoxel3d = true;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let instance = 0;
  for (let y = 0; y < sampleHeight; y += 1) {
    for (let x = 0; x < sampleWidth; x += 1) {
      const offset = (y * sampleWidth + x) * 4;
      const alpha = pixels[offset + 3];
      if (alpha <= 42) continue;
      const red = pixels[offset];
      const green = pixels[offset + 1];
      const blue = pixels[offset + 2];
      const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      position.set(
        -record.width * 0.5 + (x + 0.5) * cellWidth,
        record.height - (y + 0.5) * cellHeight,
        (luminance - 0.5) * depth * 0.5,
      );
      scale.set(Math.max(0.35, alpha / 255), Math.max(0.35, alpha / 255), 0.62 + luminance * 0.62);
      matrix.compose(position, quaternion, scale);
      mesh.setMatrixAt(instance, matrix);
      color.setRGB(
        clamp((red / 255) * record.tint[0], 0, 1),
        clamp((green / 255) * record.tint[1], 0, 1),
        clamp((blue / 255) * record.tint[2], 0, 1),
        THREE.SRGBColorSpace,
      );
      mesh.setColorAt(instance, color);
      instance += 1;
    }
  }
  mesh.count = instance;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  root.add(mesh);
  return root;
}

function createProcedural3dTouristCrowd(THREE, options, parent) {
  const imageVoxelMode = options.renderMode === "image-voxel-3d";
  let quality = normalizeQuality(options.quality);
  let profile = TOURIST_CROWD_QUALITY[quality];
  let populationOverride = Number.isFinite(Number(options.population))
    ? clamp(Math.floor(Number(options.population)), 1, MAX_TOURISTS)
    : null;
  let disposed = false;
  let elapsed = 0;
  const records = createRecords(options.seed ?? 0x51c17a5);
  const clusterVisible = { strip: 0, fremont: 0, casino: 0, airport: 0 };
  let atlasStatus = imageVoxelMode ? "loading" : "disabled";
  let atlasError = null;
  let loadedAtlas = null;
  const fallbackAtlas = imageVoxelMode ? createFallbackAtlas(THREE) : null;
  let activeVoxelAtlas = fallbackAtlas;
  records
    .slice()
    .sort((a, b) => a.densityScore - b.densityScore || a.id.localeCompare(b.id))
    .forEach((record, index) => { record.activeOrder = index; });

  const group = new THREE.Group();
  group.name = options.name || "TouristCrowd3D";
  parent.add(group);

  const createColor = (rgb, multiplier = 1) => new THREE.Color(
    clamp((rgb[0] / 255) * multiplier, 0, 1),
    clamp((rgb[1] / 255) * multiplier, 0, 1),
    clamp((rgb[2] / 255) * multiplier, 0, 1),
  );

  const createTouristModel = (record) => {
    if (imageVoxelMode) return createTouristVoxelModel(THREE, activeVoxelAtlas, record);

    const look = FALLBACK_LOOKS[record.tile % FALLBACK_LOOKS.length];
    const root = new THREE.Group();
    root.name = `Tourist3D_${record.id}`;
    root.userData.record = record;

    const skin = new THREE.MeshStandardMaterial({ color: createColor(look.skin), roughness: 0.72, metalness: 0.02 });
    const shirt = new THREE.MeshStandardMaterial({ color: createColor(look.shirt), roughness: 0.78, metalness: 0.02 });
    const pants = new THREE.MeshStandardMaterial({ color: createColor(look.pants, 0.82), roughness: 0.82, metalness: 0.02 });
    const accent = new THREE.MeshStandardMaterial({ color: createColor(look.accent), roughness: 0.65, metalness: 0.04 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(record.width * 0.55, record.height * 0.42, 0.25), shirt);
    body.name = "Tourist3DBody";
    body.position.y = record.height * 0.56;
    const head = new THREE.Mesh(new THREE.SphereGeometry(record.width * 0.18, 12, 8), skin);
    head.name = "Tourist3DHead";
    head.position.y = record.height * 0.86;
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.09, record.height * 0.34, 0.09), skin);
    const armR = armL.clone();
    armL.name = "Tourist3DArmL";
    armR.name = "Tourist3DArmR";
    armL.position.set(-record.width * 0.36, record.height * 0.55, 0);
    armR.position.set(record.width * 0.36, record.height * 0.55, 0);
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.11, record.height * 0.38, 0.1), pants);
    const legR = legL.clone();
    legL.name = "Tourist3DLegL";
    legR.name = "Tourist3DLegR";
    legL.position.set(-record.width * 0.13, record.height * 0.2, 0);
    legR.position.set(record.width * 0.13, record.height * 0.2, 0);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(record.width * 0.22, record.height * 0.18, 0.13), accent);
    bag.name = "Tourist3DBag";
    bag.position.set(record.width * 0.34, record.height * 0.48, 0.08);

    root.add(body, head, armL, armR, legL, legR, bag);
    root.userData.parts = { armL, armR, legL, legR };
    root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = false;
        child.receiveShadow = true;
        child.userData.nonColliding = true;
      }
    });
    return root;
  };

  const models = records.map((record) => {
    const model = createTouristModel(record);
    group.add(model);
    return model;
  });

  let resolveReady;
  const ready = imageVoxelMode ? new Promise((resolve) => { resolveReady = resolve; }) : Promise.resolve({ status: "ready", mode: "procedural-3d" });
  const rebuildVoxelModels = () => {
    if (!imageVoxelMode || disposed) return;
    for (let index = 0; index < records.length; index += 1) {
      const oldModel = models[index];
      const wasVisible = oldModel?.visible ?? false;
      disposeObjectTree(oldModel);
      const model = createTouristModel(records[index]);
      model.visible = wasVisible;
      models[index] = model;
      group.add(model);
    }
    update(0, elapsed, options.camera);
  };

  if (imageVoxelMode) {
    const requestedAtlasUrl = String(options.atlasUrl || DEFAULT_ATLAS_URL);
    const atlasUrl = requestedAtlasUrl === LEGACY_ATLAS_URL ? DEFAULT_ATLAS_URL : requestedAtlasUrl;
    try {
      const loader = options.textureLoader ?? new THREE.TextureLoader(options.loadingManager);
      if (typeof loader.setCrossOrigin === "function") loader.setCrossOrigin(options.crossOrigin || "anonymous");
      loader.load(
        atlasUrl,
        (texture) => {
          configureLoadedTexture(THREE, texture, options.anisotropy);
          if (disposed) {
            texture.dispose();
            resolveReady({ status: "disposed", url: atlasUrl, mode: "image-voxel-3d" });
            return;
          }
          loadedAtlas = texture;
          activeVoxelAtlas = texture;
          atlasStatus = "ready";
          rebuildVoxelModels();
          resolveReady({ status: "ready", url: atlasUrl, mode: "image-voxel-3d", texture });
        },
        undefined,
        (reason) => {
          atlasStatus = "fallback";
          atlasError = reason instanceof Error ? reason.message : `Could not load ${atlasUrl}`;
          resolveReady({ status: "fallback", url: atlasUrl, mode: "image-voxel-3d", error: atlasError });
        },
      );
    } catch (reason) {
      atlasStatus = "fallback";
      atlasError = reason instanceof Error ? reason.message : String(reason);
      resolveReady({ status: "fallback", mode: "image-voxel-3d", error: atlasError });
    }
  }

  const population = () => populationOverride ?? profile.population;
  const isActive = (record) => record.activeOrder < population();

  function update(deltaSeconds = 0, elapsedSeconds, camera = options.camera) {
    if (disposed) return 0;
    const delta = clamp(finite(deltaSeconds, 0), 0, 0.1);
    elapsed = Number.isFinite(Number(elapsedSeconds)) ? Number(elapsedSeconds) : elapsed + delta;
    clusterVisible.strip = 0;
    clusterVisible.fremont = 0;
    clusterVisible.casino = 0;
    clusterVisible.airport = 0;
    const farDistance = finite(options.farDistance, profile.farDistance);
    const farDistanceSq = farDistance * farDistance;
    let visible = 0;
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      const model = models[index];
      if (!isActive(record)) {
        model.visible = false;
        continue;
      }
      if (record.speed > 0) {
        record[record.axis] += record.direction * record.speed * delta;
        if (record[record.axis] < record.minimum) {
          record[record.axis] = record.minimum;
          record.direction = 1;
        } else if (record[record.axis] > record.maximum) {
          record[record.axis] = record.maximum;
          record.direction = -1;
        }
      }
      model.position.set(record.x, record.y, record.z);
      model.rotation.y = record.axis === "x"
        ? (record.direction > 0 ? Math.PI * 0.5 : -Math.PI * 0.5)
        : (record.direction > 0 ? 0 : Math.PI);
      if (camera?.isCamera && model.position.distanceToSquared(camera.position) > farDistanceSq) {
        model.visible = false;
        continue;
      }
      const stride = Math.sin(elapsed * record.tempo + record.phase) * (record.speed > 0 ? 0.42 : 0.08);
      const parts = model.userData.parts;
      parts.legL.rotation.x = stride;
      parts.legR.rotation.x = -stride;
      parts.armL.rotation.x = -stride * 0.65;
      parts.armR.rotation.x = stride * 0.65;
      model.visible = true;
      clusterVisible[record.cluster] += 1;
      visible += 1;
    }
    return visible;
  }

  function setQuality(nextQuality, nextPopulation) {
    if (disposed) return quality;
    quality = normalizeQuality(nextQuality);
    profile = TOURIST_CROWD_QUALITY[quality];
    populationOverride = Number.isFinite(Number(nextPopulation))
      ? clamp(Math.floor(Number(nextPopulation)), 1, MAX_TOURISTS)
      : null;
    return quality;
  }

  function snapshot() {
    const activeByCluster = { strip: 0, fremont: 0, casino: 0, airport: 0 };
    records.forEach((record) => {
      if (isActive(record)) activeByCluster[record.cluster] += 1;
    });
    return {
      mode: "procedural-3d",
      quality,
      mode: imageVoxelMode ? "image-voxel-3d" : "procedural-3d",
      active: population(),
      capacity: MAX_TOURISTS,
      visible: models.filter((model) => model.visible).length,
      drawCalls: models.filter((model) => model.visible).length * (imageVoxelMode ? 1 : 7),
      atlas: imageVoxelMode
        ? { status: atlasStatus, url: options.atlasUrl || DEFAULT_ATLAS_URL, fallback: atlasStatus !== "ready", error: atlasError }
        : { status: "disabled", url: null, fallback: false, error: null },
      clusters: Object.fromEntries(Object.keys(activeByCluster).map((id) => [id, {
        active: activeByCluster[id],
        visible: clusterVisible[id],
      }])),
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    parent.remove(group);
    group.children.slice().forEach((child) => disposeObjectTree(child));
    group.clear();
    fallbackAtlas?.dispose?.();
    loadedAtlas?.dispose?.();
  }

  update(0, 0, options.camera);
  return Object.freeze({ group, mesh: group, records, ready, update, setQuality, snapshot, dispose });
}

/**
 * Creates a dense, non-colliding Las Vegas tourist population in one draw call.
 * update(deltaSeconds, elapsedSeconds, camera) should be called from the game loop.
 */
export function createTouristCrowd(THREE, options = {}) {
  requireThree(THREE);
  const parent = options.parent ?? options.root ?? options.scene;
  if (!parent?.isObject3D) throw new TypeError("createTouristCrowd requires options.parent, options.root, or options.scene.");
  if (options.renderMode === "procedural-3d" || options.renderMode === "image-voxel-3d") return createProcedural3dTouristCrowd(THREE, options, parent);

  let quality = normalizeQuality(options.quality);
  let profile = TOURIST_CROWD_QUALITY[quality];
  let populationOverride = Number.isFinite(Number(options.population))
    ? clamp(Math.floor(Number(options.population)), 1, MAX_TOURISTS)
    : null;
  let disposed = false;
  let elapsed = 0;
  let cullClock = Number.POSITIVE_INFINITY;
  let lastCamera = options.camera?.isCamera ? options.camera : null;
  let atlasStatus = "loading";
  let atlasError = null;
  let loadedAtlas = null;
  const records = createRecords(options.seed ?? 0x51c17a5);
  const visibleIndices = [];
  const clusterVisible = { strip: 0, fremont: 0, casino: 0, airport: 0 };

  const group = new THREE.Group();
  group.name = options.name || "TouristCrowd";
  group.matrixAutoUpdate = false;
  group.updateMatrix();
  parent.add(group);

  const fallbackAtlas = createFallbackAtlas(THREE);
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  geometry.name = "TouristCrowdBillboardGeometry";
  const tintAttribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TOURISTS * 3), 3);
  const tileAttribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TOURISTS), 1);
  const phaseAttribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TOURISTS), 1);
  const tempoAttribute = new THREE.InstancedBufferAttribute(new Float32Array(MAX_TOURISTS), 1);
  [tintAttribute, tileAttribute, phaseAttribute, tempoAttribute].forEach((attribute) => {
    attribute.setUsage(THREE.DynamicDrawUsage);
  });
  geometry.setAttribute("instanceTint", tintAttribute);
  geometry.setAttribute("instanceTile", tileAttribute);
  geometry.setAttribute("instancePhase", phaseAttribute);
  geometry.setAttribute("instanceTempo", tempoAttribute);

  const material = new THREE.ShaderMaterial({
    name: "TouristCrowdBillboardMaterial",
    uniforms: {
      uAtlas: { value: fallbackAtlas },
      uAtlasGrid: { value: new THREE.Vector2(ATLAS_COLUMNS, ATLAS_ROWS) },
      uTime: { value: 0 },
      uNearFade: { value: Math.max(1.2, finite(options.nearFade, 1.8)) },
      uFarFade: { value: profile.farDistance },
      uOpacity: { value: clamp(finite(options.opacity, 1), 0, 1) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  material.extensions = { derivatives: false };

  const mesh = new THREE.InstancedMesh(geometry, material, MAX_TOURISTS);
  mesh.name = "InstancedVegasTourists";
  mesh.count = 0;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = finite(options.renderOrder, 4);
  mesh.userData.kind = "tourist-crowd";
  mesh.userData.nonColliding = true;
  group.add(mesh);

  const dummy = new THREE.Object3D();
  const projectionView = new THREE.Matrix4();
  const frustum = new THREE.Frustum();
  const point = new THREE.Vector3();
  const sphere = new THREE.Sphere(point, 1.3);

  const requestedAtlasUrl = String(options.atlasUrl || DEFAULT_ATLAS_URL);
  // Preserve callers that still pass the previous default while moving the
  // runtime crowd to the complete 4x4 atlas. Explicit custom URLs still win.
  const atlasUrl = requestedAtlasUrl === LEGACY_ATLAS_URL ? DEFAULT_ATLAS_URL : requestedAtlasUrl;
  let resolveReady;
  const ready = new Promise((resolve) => { resolveReady = resolve; });
  try {
    const loader = options.textureLoader ?? new THREE.TextureLoader(options.loadingManager);
    if (typeof loader.setCrossOrigin === "function") loader.setCrossOrigin(options.crossOrigin || "anonymous");
    loader.load(
      atlasUrl,
      (texture) => {
        configureLoadedTexture(THREE, texture, options.anisotropy);
        if (disposed) {
          texture.dispose();
          resolveReady({ status: "disposed", url: atlasUrl });
          return;
        }
        loadedAtlas = texture;
        material.uniforms.uAtlas.value = texture;
        material.needsUpdate = true;
        atlasStatus = "ready";
        resolveReady({ status: "ready", url: atlasUrl, texture });
      },
      undefined,
      (reason) => {
        atlasStatus = "fallback";
        atlasError = reason instanceof Error ? reason.message : `Could not load ${atlasUrl}`;
        resolveReady({ status: "fallback", url: atlasUrl, error: atlasError });
      },
    );
  } catch (reason) {
    atlasStatus = "fallback";
    atlasError = reason instanceof Error ? reason.message : String(reason);
    resolveReady({ status: "fallback", url: atlasUrl, error: atlasError });
  }

  const population = () => populationOverride ?? profile.population;
  const isActive = (record) => record.activeOrder < population();

  function refreshVisibility(camera, force = false) {
    if (!camera?.isCamera) {
      visibleIndices.length = 0;
      for (let index = 0; index < records.length && visibleIndices.length < population(); index += 1) {
        if (isActive(records[index])) visibleIndices.push(index);
      }
      return;
    }
    if (!force && cullClock < profile.cullInterval) return;
    cullClock = 0;
    camera.updateMatrixWorld?.(false);
    projectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(projectionView);
    const farDistance = finite(options.farDistance, profile.farDistance);
    const farDistanceSq = farDistance * farDistance;
    visibleIndices.length = 0;
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (!isActive(record)) continue;
      point.set(record.x, record.y + record.height * 0.5, record.z);
      if (point.distanceToSquared(camera.position) > farDistanceSq) continue;
      sphere.center.copy(point);
      sphere.radius = record.height * 0.7;
      if (!frustum.intersectsSphere(sphere)) continue;
      visibleIndices.push(index);
    }
  }

  function uploadVisibleInstances() {
    clusterVisible.strip = 0;
    clusterVisible.fremont = 0;
    clusterVisible.casino = 0;
    clusterVisible.airport = 0;
    const limit = Math.min(visibleIndices.length, population(), MAX_TOURISTS);
    for (let slot = 0; slot < limit; slot += 1) {
      const record = records[visibleIndices[slot]];
      dummy.position.set(record.x, record.y, record.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(record.width, record.height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(slot, dummy.matrix);
      tintAttribute.setXYZ(slot, record.tint[0], record.tint[1], record.tint[2]);
      tileAttribute.setX(slot, record.tile);
      phaseAttribute.setX(slot, record.phase);
      tempoAttribute.setX(slot, record.tempo);
      clusterVisible[record.cluster] += 1;
    }
    mesh.count = limit;
    mesh.visible = limit > 0;
    mesh.instanceMatrix.needsUpdate = true;
    tintAttribute.needsUpdate = true;
    tileAttribute.needsUpdate = true;
    phaseAttribute.needsUpdate = true;
    tempoAttribute.needsUpdate = true;
  }

  function update(deltaSeconds = 0, elapsedSeconds, camera = lastCamera) {
    if (disposed) return 0;
    const delta = clamp(finite(deltaSeconds, 0), 0, 0.1);
    elapsed = Number.isFinite(Number(elapsedSeconds)) ? Number(elapsedSeconds) : elapsed + delta;
    if (camera?.isCamera) lastCamera = camera;
    cullClock += delta;
    const activePopulation = population();
    for (let index = 0; index < records.length; index += 1) {
      const record = records[index];
      if (record.activeOrder >= activePopulation || record.speed <= 0) continue;
      record[record.axis] += record.direction * record.speed * delta;
      if (record[record.axis] < record.minimum) {
        record[record.axis] = record.minimum;
        record.direction = 1;
      } else if (record[record.axis] > record.maximum) {
        record[record.axis] = record.maximum;
        record.direction = -1;
      }
    }
    material.uniforms.uTime.value = elapsed;
    material.uniforms.uFarFade.value = finite(options.farDistance, profile.farDistance);
    refreshVisibility(lastCamera, mesh.count === 0);
    uploadVisibleInstances();
    return mesh.count;
  }

  function setQuality(nextQuality, nextPopulation) {
    if (disposed) return quality;
    quality = normalizeQuality(nextQuality);
    profile = TOURIST_CROWD_QUALITY[quality];
    populationOverride = Number.isFinite(Number(nextPopulation))
      ? clamp(Math.floor(Number(nextPopulation)), 1, MAX_TOURISTS)
      : null;
    material.uniforms.uFarFade.value = finite(options.farDistance, profile.farDistance);
    cullClock = Number.POSITIVE_INFINITY;
    refreshVisibility(lastCamera, true);
    uploadVisibleInstances();
    return quality;
  }

  function snapshot() {
    const activeByCluster = { strip: 0, fremont: 0, casino: 0, airport: 0 };
    records.forEach((record) => {
      if (isActive(record)) activeByCluster[record.cluster] += 1;
    });
    return {
      quality,
      active: population(),
      capacity: MAX_TOURISTS,
      visible: mesh.count,
      drawCalls: mesh.count > 0 ? 1 : 0,
      atlas: { status: atlasStatus, url: atlasUrl, fallback: atlasStatus !== "ready", error: atlasError },
      clusters: Object.fromEntries(Object.keys(activeByCluster).map((id) => [id, {
        active: activeByCluster[id],
        visible: clusterVisible[id],
      }])),
    };
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    parent.remove(group);
    group.clear();
    geometry.dispose();
    material.dispose();
    fallbackAtlas.dispose();
    loadedAtlas?.dispose?.();
    visibleIndices.length = 0;
  }

  update(0, 0, lastCamera);
  return Object.freeze({
    group,
    mesh,
    records,
    ready,
    update,
    setQuality,
    snapshot,
    dispose,
  });
}

export default createTouristCrowd;
