const DEFAULT_ALPHA_THRESHOLD = 42;

const configureTexture = (THREE, texture, anisotropy = 4) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.max(1, anisotropy);
  texture.needsUpdate = true;
  return texture;
};

const makeTextureState = (THREE, url, anisotropy) => {
  const state = {
    url,
    texture: null,
    status: "loading",
    error: null,
    listeners: new Set(),
  };
  const loader = new THREE.TextureLoader();
  const settle = (status, texture, error = null) => {
    if (texture) state.texture = configureTexture(THREE, texture, anisotropy);
    state.status = status;
    state.error = error instanceof Error ? error : error ? new Error(String(error)) : null;
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

const textureStates = new WeakMap();

const getTextureState = (THREE, url, anisotropy) => {
  let cache = textureStates.get(THREE);
  if (!cache) {
    cache = new Map();
    textureStates.set(THREE, cache);
  }
  const key = `${url}|${Math.max(1, anisotropy)}`;
  if (!cache.has(key)) cache.set(key, makeTextureState(THREE, url, anisotropy));
  return cache.get(key);
};

const isKeyedPixel = (red, green, blue, chromaKey) =>
  chromaKey && green > 95 && green - Math.max(red, blue) > 28;

const disposeChildren = (group) => {
  group.traverse((child) => {
    if (child === group) return;
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
    else child.material?.dispose?.();
  });
  group.clear();
};

export function createImageVoxelAtlasModel(THREE, {
  url,
  tile = 0,
  columns = 4,
  rows = 2,
  width = 1.8,
  height = 2.6,
  depth = 0.22,
  feetOffset = 0,
  name = "ImageVoxelAtlasModel",
  sampleWidth = 24,
  sampleHeight = 38,
  alphaThreshold = DEFAULT_ALPHA_THRESHOLD,
  chromaKey = false,
  anisotropy = 4,
  visible = true,
} = {}) {
  if (!url) throw new TypeError("createImageVoxelAtlasModel requires an atlas url.");
  const textureState = getTextureState(THREE, url, anisotropy);
  const group = new THREE.Group();
  group.name = `${name}ImageVoxelRoot`;
  group.visible = visible;
  group.userData.imageDerived3D = true;
  group.userData.imageVoxel3d = true;
  group.userData.url = url;
  group.userData.tile = tile;
  group.userData.loadState = textureState.status;
  group.userData.loadError = null;
  group.userData.weaponRaycastIgnore = true;

  const rebuild = (nextTile = group.userData.tile) => {
    const image = textureState.texture?.image;
    if (!image) return false;
    const resolvedTile = ((Math.floor(nextTile) % (columns * rows)) + (columns * rows)) % (columns * rows);
    if (group.userData.tile === resolvedTile && group.userData.voxelReady) return true;
    group.userData.tile = resolvedTile;
    disposeChildren(group);

    const tileWidth = Math.max(1, Math.floor(image.width / columns));
    const tileHeight = Math.max(1, Math.floor(image.height / rows));
    const sourceX = (resolvedTile % columns) * tileWidth;
    const sourceY = Math.floor(resolvedTile / columns) * tileHeight;
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
        if (pixels[offset + 3] > alphaThreshold && !isKeyedPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2], chromaKey)) count += 1;
      }
    }
    if (!count) return false;

    const cellWidth = width / sampleWidth;
    const cellHeight = height / sampleHeight;
    const geometry = new THREE.BoxGeometry(cellWidth * 0.96, cellHeight * 0.96, depth);
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0.035,
      emissive: 0x030303,
      emissiveIntensity: 0.08,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.name = `${name}ImageVoxelMesh`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.imageDerived3D = true;
    mesh.userData.weaponRaycastIgnore = true;

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    let index = 0;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        const offset = (y * sampleWidth + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        if (pixels[offset + 3] <= alphaThreshold || isKeyedPixel(red, green, blue, chromaKey)) continue;
        const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
        const localX = -width * 0.5 + (x + 0.5) * cellWidth;
        const localY = feetOffset + height - (y + 0.5) * cellHeight;
        const localZ = (luminance - 0.5) * depth * 0.5;
        matrix.makeTranslation(localX, localY, localZ);
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
    group.userData.loadState = "ready";
    return true;
  };

  group.userData.rebuild = rebuild;
  group.userData.setTile = (nextTile) => rebuild(nextTile);
  if (textureState.status === "ready") rebuild(tile);
  else if (textureState.status === "loading") {
    textureState.listeners.add((state) => {
      group.userData.loadState = state.status;
      group.userData.loadError = state.error?.message || null;
      if (state.status === "ready") rebuild(group.userData.tile);
    });
  } else {
    group.userData.loadState = "error";
    group.userData.loadError = textureState.error?.message || null;
  }
  return group;
}

export function hideRenderableMeshes(object, except = new Set()) {
  object?.traverse?.((child) => {
    if (child.isMesh && !except.has(child) && !child.userData?.imageDerived3D && !child.userData?.realisticKeepVisible) {
      child.visible = false;
      child.userData.hiddenByImageDerived3D = true;
    }
  });
}
