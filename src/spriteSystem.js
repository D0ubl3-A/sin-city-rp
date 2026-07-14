const TEXTURE_CACHES = new WeakMap();
const CONTROLLERS = new WeakMap();

export const DIRECTION_NAMES = Object.freeze([
  "front",
  "frontRight",
  "right",
  "backRight",
  "back",
  "backLeft",
  "left",
  "frontLeft",
]);

export const DEFAULT_DIRECTION_TILES = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7]);

const TAU = Math.PI * 2;
const DIRECTION_STEP = TAU / DIRECTION_NAMES.length;
const MAX_ANIMATION_DELTA = 0.25;

const requireThree = (THREE) => {
  const required = [
    "Group",
    "Mesh",
    "PlaneGeometry",
    "MeshBasicMaterial",
    "TextureLoader",
    "DataTexture",
    "Vector3",
    "Quaternion",
    "Color",
  ];
  const missing = required.filter((name) => !THREE?.[name]);
  if (missing.length) {
    throw new TypeError(`Directional sprites require a complete THREE namespace (missing: ${missing.join(", ")}).`);
  }
};

const positiveInteger = (value, fallback) => {
  const parsed = Math.floor(Number(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const finiteNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const wrapIndex = (value, size) => {
  const index = Math.round(finiteNumber(value, 0));
  return ((index % size) + size) % size;
};

const normalizeAngle = (angle) => {
  let normalized = angle % TAU;
  if (normalized > Math.PI) normalized -= TAU;
  if (normalized <= -Math.PI) normalized += TAU;
  return normalized;
};

const setVector = (target, value) => {
  if (!value) return target;
  if (Array.isArray(value)) return target.set(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
  return target.set(value.x ?? target.x, value.y ?? target.y, value.z ?? target.z);
};

const normalizeAtlas = (atlas = {}) => {
  const columns = positiveInteger(atlas.columns, 4);
  const rows = positiveInteger(atlas.rows, 2);
  const totalTiles = columns * rows;
  const configuredTiles = Array.isArray(atlas.directionTiles) ? atlas.directionTiles : DEFAULT_DIRECTION_TILES;
  const directionTiles = DIRECTION_NAMES.map((_, index) =>
    wrapIndex(configuredTiles[index] ?? DEFAULT_DIRECTION_TILES[index], totalTiles),
  );

  return {
    columns,
    rows,
    totalTiles,
    directionTiles,
    uvInset: Math.max(0, Math.min(0.12, finiteNumber(atlas.uvInset, 0.001))),
  };
};

const normalizeAnimations = (animations, defaultAnimation) => {
  const source = animations && Object.keys(animations).length
    ? animations
    : { idle: { startTile: 0, frames: 1, fps: 0, loop: true } };
  const normalized = new Map();

  Object.entries(source).forEach(([name, config = {}]) => {
    const explicitTiles = Array.isArray(config.tiles)
      ? config.tiles.map((frame) => (Array.isArray(frame) ? frame.slice(0, DIRECTION_NAMES.length) : null))
      : null;
    const frames = explicitTiles?.length || positiveInteger(config.frames, 1);
    normalized.set(name, {
      name,
      startTile: Math.max(0, Math.floor(finiteNumber(config.startTile, 0))),
      frames,
      fps: Math.max(0, finiteNumber(config.fps, frames > 1 ? 8 : 0)),
      loop: config.loop !== false,
      frameStride: positiveInteger(config.frameStride, DIRECTION_NAMES.length),
      tiles: explicitTiles,
    });
  });

  const requested = typeof defaultAnimation === "string" ? defaultAnimation : "idle";
  const initialName = normalized.has(requested) ? requested : normalized.keys().next().value;
  return { animations: normalized, initialName };
};

const textureCacheFor = (THREE) => {
  let cache = TEXTURE_CACHES.get(THREE);
  if (!cache) {
    cache = new Map();
    TEXTURE_CACHES.set(THREE, cache);
  }
  return cache;
};

const textureKey = (THREE, url, options) => [
  String(url),
  options.colorSpace ?? THREE.SRGBColorSpace ?? "srgb",
  options.flipY === false ? "no-flip" : "flip",
  options.generateMipmaps === false ? "no-mips" : "mips",
  options.crossOrigin ?? "anonymous",
].join("|");

const configureTexture = (THREE, texture, options = {}) => {
  texture.colorSpace = options.colorSpace ?? THREE.SRGBColorSpace;
  texture.flipY = options.flipY !== false;
  texture.generateMipmaps = options.generateMipmaps !== false;
  texture.wrapS = options.wrapS ?? THREE.ClampToEdgeWrapping;
  texture.wrapT = options.wrapT ?? THREE.ClampToEdgeWrapping;
  texture.magFilter = options.pixelArt ? THREE.NearestFilter : (options.magFilter ?? THREE.LinearFilter);
  texture.minFilter = options.pixelArt
    ? THREE.NearestFilter
    : (options.minFilter ?? (texture.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter));
  texture.anisotropy = Math.max(1, positiveInteger(options.anisotropy, 4));
  texture.premultiplyAlpha = options.premultiplyAlpha === true;
  texture.needsUpdate = true;
  return texture;
};

const getOrCreateTextureRecord = (THREE, url, options = {}) => {
  if (!url || typeof url !== "string") throw new TypeError("A sprite atlas URL is required.");
  const cache = textureCacheFor(THREE);
  const key = textureKey(THREE, url, options);
  const cached = cache.get(key);
  if (cached && !(cached.status === "error" && options.retryFailed)) return cached;
  if (cached) {
    cached.texture?.dispose?.();
    cache.delete(key);
  }

  const record = {
    key,
    url,
    texture: null,
    status: "loading",
    error: null,
    refs: 0,
    promise: null,
  };
  cache.set(key, record);

  record.promise = new Promise((resolve, reject) => {
    try {
      const loader = new THREE.TextureLoader(options.loadingManager);
      if (typeof loader.setCrossOrigin === "function") loader.setCrossOrigin(options.crossOrigin ?? "anonymous");
      record.texture = loader.load(
        url,
        (texture) => {
          configureTexture(THREE, texture, options);
          record.status = "ready";
          resolve(texture);
        },
        undefined,
        (reason) => {
          const error = reason instanceof Error ? reason : new Error(`Unable to load sprite atlas: ${url}`);
          record.status = "error";
          record.error = error;
          reject(error);
        },
      );
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(`Unable to load sprite atlas: ${url}`);
      record.status = "error";
      record.error = error;
      reject(error);
    }
  });

  return record;
};

const makeFallbackAtlasTexture = (THREE, atlas, colorValue) => {
  const tileWidth = 16;
  const tileHeight = 32;
  const width = tileWidth * atlas.columns;
  const height = tileHeight * atlas.rows;
  const pixels = new Uint8Array(width * height * 4);
  const color = new THREE.Color(colorValue ?? 0x28d7ff);
  const rgb = [
    Math.round(color.r * 255),
    Math.round(color.g * 255),
    Math.round(color.b * 255),
  ];

  const paint = (x, y, alpha = 255, shade = 1) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (y * width + x) * 4;
    pixels[offset] = Math.round(rgb[0] * shade);
    pixels[offset + 1] = Math.round(rgb[1] * shade);
    pixels[offset + 2] = Math.round(rgb[2] * shade);
    pixels[offset + 3] = alpha;
  };

  for (let row = 0; row < atlas.rows; row += 1) {
    for (let column = 0; column < atlas.columns; column += 1) {
      const originX = column * tileWidth;
      const originY = (atlas.rows - row - 1) * tileHeight;
      for (let y = 1; y < tileHeight - 1; y += 1) {
        for (let x = 1; x < tileWidth - 1; x += 1) {
          const dx = x - tileWidth / 2;
          const head = dx * dx + (y - 25) * (y - 25) <= 10;
          const torso = y >= 11 && y <= 21 && Math.abs(dx) <= 4 - Math.abs(y - 16) * 0.08;
          const leftArm = y >= 10 && y <= 19 && dx >= -6 && dx <= -4;
          const rightArm = y >= 10 && y <= 19 && dx >= 4 && dx <= 6;
          const leftLeg = y >= 2 && y <= 11 && dx >= -4 && dx <= -1;
          const rightLeg = y >= 2 && y <= 11 && dx >= 1 && dx <= 4;
          if (head || torso || leftArm || rightArm || leftLeg || rightLeg) {
            const edgeShade = Math.abs(dx) > 4.5 || y <= 2 ? 0.55 : 1;
            paint(originX + x, originY + y, 235, edgeShade);
          }
        }
      }
    }
  }

  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat, THREE.UnsignedByteType);
  texture.name = "DirectionalSpriteFallbackAtlas";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.generateMipmaps = false;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
};

/** Applies a row-major, top-left-origin atlas tile to a geometry's UVs. */
export const applySpriteAtlasFrame = (geometry, atlasConfig, tileIndex) => {
  const atlas = atlasConfig.totalTiles ? atlasConfig : normalizeAtlas(atlasConfig);
  const uv = geometry?.attributes?.uv;
  if (!uv) throw new TypeError("Sprite geometry must expose a UV buffer attribute.");
  if (!geometry.userData.directionalSpriteBaseUv) {
    geometry.userData.directionalSpriteBaseUv = Float32Array.from(uv.array);
  }

  const tile = wrapIndex(tileIndex, atlas.totalTiles);
  const column = tile % atlas.columns;
  const row = Math.floor(tile / atlas.columns);
  const repeatX = 1 / atlas.columns;
  const repeatY = 1 / atlas.rows;
  const offsetX = column * repeatX;
  const offsetY = 1 - (row + 1) * repeatY;
  const insetX = repeatX * atlas.uvInset;
  const insetY = repeatY * atlas.uvInset;
  const usableX = repeatX - insetX * 2;
  const usableY = repeatY - insetY * 2;
  const base = geometry.userData.directionalSpriteBaseUv;

  for (let index = 0; index < uv.count; index += 1) {
    const cursor = index * uv.itemSize;
    uv.array[cursor] = offsetX + insetX + base[cursor] * usableX;
    uv.array[cursor + 1] = offsetY + insetY + base[cursor + 1] * usableY;
  }
  uv.needsUpdate = true;
  geometry.userData.directionalSpriteTile = tile;
  geometry.userData.directionalSpriteUv = {
    offsetX,
    offsetY,
    repeatX,
    repeatY,
  };
  return tile;
};

const directionIndexFrom = (direction) => {
  if (typeof direction === "string") {
    const normalized = direction.replace(/[\s_-]/g, "").toLowerCase();
    const index = DIRECTION_NAMES.findIndex((name) => name.toLowerCase() === normalized);
    if (index >= 0) return index;
  }
  return wrapIndex(direction, DIRECTION_NAMES.length);
};

const localForwardFor = (THREE, axis) => {
  if (axis?.isVector3 || (axis && typeof axis === "object")) {
    return new THREE.Vector3(axis.x ?? 0, 0, axis.z ?? -1).normalize();
  }
  switch (String(axis ?? "-Z").toUpperCase()) {
    case "+Z": return new THREE.Vector3(0, 0, 1);
    case "+X": return new THREE.Vector3(1, 0, 0);
    case "-X": return new THREE.Vector3(-1, 0, 0);
    default: return new THREE.Vector3(0, 0, -1);
  }
};

export class DirectionalSpriteController {
  constructor(THREE, options = {}) {
    requireThree(THREE);
    this.THREE = THREE;
    this.options = options;
    this.atlas = normalizeAtlas(options.atlas);
    const animationState = normalizeAnimations(options.animations, options.defaultAnimation);
    this.animations = animationState.animations;
    this.animationName = animationState.initialName;
    this.animationFrame = 0;
    this.animationElapsed = 0;
    this.playing = options.playing !== false;
    this.directionIndex = directionIndexFrom(options.direction ?? 0);
    this.tileIndex = -1;
    this.disposed = false;
    this.loadState = "fallback";
    this.loadError = null;
    this._textureRecord = null;
    this._fallbackTexture = makeFallbackAtlasTexture(THREE, this.atlas, options.fallbackColor ?? 0x28d7ff);
    this._cameraWorld = new THREE.Vector3();
    this._viewerWorld = new THREE.Vector3();
    this._spriteWorld = new THREE.Vector3();
    this._localTarget = new THREE.Vector3();
    this._forwardWorld = new THREE.Vector3();
    this._worldQuaternion = new THREE.Quaternion();
    this._localForward = localForwardFor(THREE, options.forwardAxis);

    const width = Math.max(0.01, finiteNumber(options.width, 1.2));
    const height = Math.max(0.01, finiteNumber(options.height, 2.45));
    this.root = new THREE.Group();
    this.root.name = options.name ?? "DirectionalSprite";
    this.billboard = new THREE.Group();
    this.billboard.name = `${this.root.name}_Billboard`;
    this._deformWidth = width;
    this._deformHeight = height;
    this._locomotion = { stride: 0, movement: 0 };
    const deformSegmentsX = options.walkDeform === true ? 10 : 1;
    const deformSegmentsY = options.walkDeform === true ? 12 : 1;
    this.geometry = new THREE.PlaneGeometry(width, height, deformSegmentsX, deformSegmentsY);
    this._restPositions = this.geometry.getAttribute("position").array.slice();
    this.material = new THREE.MeshBasicMaterial({
      map: this._fallbackTexture,
      color: 0xffffff,
      transparent: options.transparent !== false,
      opacity: Math.max(0, Math.min(1, finiteNumber(options.opacity, 1))),
      alphaTest: Math.max(0, Math.min(1, finiteNumber(options.alphaTest, 0.18))),
      depthTest: options.depthTest !== false,
      depthWrite: options.depthWrite !== false,
      side: options.side ?? THREE.DoubleSide,
      toneMapped: options.toneMapped !== false,
      fog: options.fog !== false,
    });
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = `${this.root.name}_Mesh`;
    this.mesh.position.y = height * 0.5 + finiteNumber(options.feetOffset, 0);
    this.mesh.renderOrder = finiteNumber(options.renderOrder, 0);
    this.mesh.castShadow = options.castShadow === true;
    this.mesh.receiveShadow = options.receiveShadow === true;
    this.mesh.frustumCulled = options.frustumCulled !== false;
    this.billboard.add(this.mesh);
    this.root.add(this.billboard);
    setVector(this.root.position, options.position);

    this.root.parts = { billboard: this.billboard, sprite: this.mesh };
    this.root.spriteController = this;
    this.root.userData.spriteAtlas = {
      system: "directional-sprite-v1",
      atlasUrl: options.url ?? null,
      columns: this.atlas.columns,
      rows: this.atlas.rows,
      direction: DIRECTION_NAMES[this.directionIndex],
      animation: this.animationName,
      frame: this.animationFrame,
      tile: 0,
      loadState: this.loadState,
    };
    CONTROLLERS.set(this.root, this);
    CONTROLLERS.set(this.billboard, this);
    CONTROLLERS.set(this.mesh, this);
    this._applyResolvedTile();

    this.ready = this._beginTextureLoad();
  }

  _beginTextureLoad() {
    const { THREE, options } = this;
    if (!options.url) {
      const error = new Error("No sprite atlas URL was supplied; the procedural fallback remains active.");
      this.loadError = error;
      this._setLoadState("fallback");
      options.onError?.(error, this);
      return Promise.resolve({ ok: false, controller: this, error });
    }

    let record;
    try {
      record = getOrCreateTextureRecord(THREE, options.url, options.texture ?? options);
      record.refs += 1;
      this._textureRecord = record;
      this._setLoadState(record.status === "ready" ? "ready" : "loading");
    } catch (reason) {
      const error = reason instanceof Error ? reason : new Error(String(reason));
      this.loadError = error;
      this._setLoadState("fallback");
      options.onError?.(error, this);
      return Promise.resolve({ ok: false, controller: this, error });
    }

    return record.promise.then((texture) => {
      if (this.disposed) return { ok: false, controller: this, disposed: true };
      this.material.map = texture;
      this.material.color.set(options.color ?? 0xffffff);
      this.material.needsUpdate = true;
      this._fallbackTexture?.dispose();
      this._fallbackTexture = null;
      this._setLoadState("ready");
      options.onReady?.(this, texture);
      return { ok: true, controller: this, texture };
    }).catch((error) => {
      if (this.disposed) return { ok: false, controller: this, disposed: true, error };
      this.loadError = error;
      this.material.map = this._fallbackTexture;
      this.material.color.set(0xffffff);
      this.material.needsUpdate = true;
      this._setLoadState("fallback");
      options.onError?.(error, this);
      return { ok: false, controller: this, error };
    });
  }

  _setLoadState(state) {
    this.loadState = state;
    if (this.root?.userData?.spriteAtlas) this.root.userData.spriteAtlas.loadState = state;
  }

  _animation() {
    return this.animations.get(this.animationName) ?? this.animations.values().next().value;
  }

  _resolvedTile() {
    const animation = this._animation();
    const frame = wrapIndex(this.animationFrame, animation.frames);
    const explicitFrame = animation.tiles?.[frame];
    if (Array.isArray(explicitFrame)) {
      return explicitFrame[this.directionIndex] ?? explicitFrame[0] ?? 0;
    }
    return animation.startTile
      + frame * animation.frameStride
      + this.atlas.directionTiles[this.directionIndex];
  }

  _applyResolvedTile() {
    const tile = applySpriteAtlasFrame(this.geometry, this.atlas, this._resolvedTile());
    this.tileIndex = tile;
    const metadata = this.root.userData.spriteAtlas;
    metadata.direction = DIRECTION_NAMES[this.directionIndex];
    metadata.animation = this.animationName;
    metadata.frame = this.animationFrame;
    metadata.tile = tile;
    return tile;
  }

  setDirection(direction) {
    const next = directionIndexFrom(direction);
    if (next !== this.directionIndex) {
      this.directionIndex = next;
      this._applyResolvedTile();
    }
    return this;
  }

  setAnimation(name, { restart = false, playing = true } = {}) {
    if (!this.animations.has(name)) return false;
    const changed = name !== this.animationName;
    this.animationName = name;
    this.playing = playing;
    if (changed || restart) {
      this.animationFrame = 0;
      this.animationElapsed = 0;
      this._applyResolvedTile();
    }
    return true;
  }

  /**
   * Applies a visible lower-body stride to a generated character sprite.
   * The deformation is opt-in so vehicle and building art remains perfectly rigid.
   */
  setLocomotion({ stride = 0, movement = 0 } = {}) {
    if (this.options.walkDeform !== true || !this._restPositions) return this;
    const nextStride = Math.max(-1, Math.min(1, finiteNumber(stride, 0)));
    const nextMovement = Math.max(0, Math.min(1, finiteNumber(movement, 0)));
    if (Math.abs(nextStride - this._locomotion.stride) < 0.0005
      && Math.abs(nextMovement - this._locomotion.movement) < 0.0005) return this;

    this._locomotion.stride = nextStride;
    this._locomotion.movement = nextMovement;
    const positions = this.geometry.getAttribute("position");
    const rest = this._restPositions;
    const halfHeight = this._deformHeight * 0.5;
    const stridePhase = nextStride * nextMovement;

    for (let index = 0; index < positions.count; index += 1) {
      const offset = index * 3;
      const baseX = rest[offset];
      const baseY = rest[offset + 1];
      const lowerBody = Math.max(0, Math.min(1, ((-baseY / halfHeight) - 0.02) / 0.56));
      const legSide = baseX < 0 ? -1 : 1;
      const legStride = stridePhase * legSide;
      const swing = legStride * lowerBody;
      const lift = Math.max(0, legStride) * lowerBody * lowerBody;
      positions.setXYZ(
        index,
        baseX + swing * this._deformWidth * 0.105,
        baseY + lift * this._deformHeight * 0.045,
        rest[offset + 2] - Math.abs(swing) * lowerBody * 0.025,
      );
    }
    positions.needsUpdate = true;
    this.geometry.computeBoundingSphere();
    return this;
  }

  setAnimationFrame(frame) {
    const animation = this._animation();
    const next = wrapIndex(frame, animation.frames);
    if (next !== this.animationFrame) {
      this.animationFrame = next;
      this.animationElapsed = 0;
      this._applyResolvedTile();
    }
    return this;
  }

  setAtlasFrame(tile) {
    this.tileIndex = applySpriteAtlasFrame(this.geometry, this.atlas, tile);
    this.root.userData.spriteAtlas.tile = this.tileIndex;
    return this;
  }

  setTint(color) {
    this.options.color = color;
    if (this.loadState === "ready") this.material.color.set(color ?? 0xffffff);
    return this;
  }

  setOpacity(opacity) {
    this.material.opacity = Math.max(0, Math.min(1, finiteNumber(opacity, 1)));
    this.material.visible = this.material.opacity > 0;
    return this;
  }

  _cameraPosition(cameraOrPosition) {
    if (cameraOrPosition?.isObject3D) return cameraOrPosition.getWorldPosition(this._cameraWorld);
    return setVector(this._cameraWorld, cameraOrPosition);
  }

  billboardTo(cameraOrPosition) {
    if (!cameraOrPosition || !this.billboard.parent) return this;
    const worldTarget = this._cameraPosition(cameraOrPosition);
    this._localTarget.copy(worldTarget);
    this.billboard.parent.worldToLocal(this._localTarget);
    const dx = this._localTarget.x - this.billboard.position.x;
    const dz = this._localTarget.z - this.billboard.position.z;
    if (dx * dx + dz * dz > 1e-8) this.billboard.rotation.y = Math.atan2(dx, dz);
    return this;
  }

  directionToward(cameraOrPosition, { facingObject = this.root, facingYaw } = {}) {
    const viewer = this._cameraPosition(cameraOrPosition);
    this.root.getWorldPosition(this._spriteWorld);
    this._viewerWorld.subVectors(viewer, this._spriteWorld);
    this._viewerWorld.y = 0;
    if (this._viewerWorld.lengthSq() < 1e-8) return this.directionIndex;

    this._forwardWorld.copy(this._localForward);
    if (Number.isFinite(facingYaw)) {
      this._forwardWorld.applyAxisAngle(DirectionalSpriteController.Y_AXIS, facingYaw);
    } else if (facingObject?.isObject3D) {
      facingObject.getWorldQuaternion(this._worldQuaternion);
      this._forwardWorld.applyQuaternion(this._worldQuaternion);
    }
    this._forwardWorld.y = 0;
    if (this._forwardWorld.lengthSq() < 1e-8) this._forwardWorld.set(0, 0, -1);
    this._forwardWorld.normalize();
    this._viewerWorld.normalize();

    const forwardBearing = Math.atan2(this._forwardWorld.x, this._forwardWorld.z);
    const viewerBearing = Math.atan2(this._viewerWorld.x, this._viewerWorld.z);
    return wrapIndex(Math.round(normalizeAngle(forwardBearing - viewerBearing) / DIRECTION_STEP), DIRECTION_NAMES.length);
  }

  update(deltaSeconds, cameraOrPosition, options = {}) {
    if (this.disposed) return this;
    if (cameraOrPosition && options.billboard !== false && this.options.autoBillboard !== false) {
      this.billboardTo(cameraOrPosition);
    }
    if (cameraOrPosition && options.direction !== false && this.options.autoDirection !== false) {
      this.setDirection(this.directionToward(cameraOrPosition, options));
    }

    const animation = this._animation();
    const delta = Math.max(0, Math.min(MAX_ANIMATION_DELTA, finiteNumber(deltaSeconds, 0)));
    if (this.playing && animation.frames > 1 && animation.fps > 0 && delta > 0) {
      this.animationElapsed += delta;
      const secondsPerFrame = 1 / animation.fps;
      let changed = false;
      while (this.animationElapsed >= secondsPerFrame) {
        this.animationElapsed -= secondsPerFrame;
        if (this.animationFrame + 1 < animation.frames) {
          this.animationFrame += 1;
        } else if (animation.loop) {
          this.animationFrame = 0;
        } else {
          this.animationFrame = animation.frames - 1;
          this.playing = false;
        }
        changed = true;
      }
      if (changed) this._applyResolvedTile();
    }
    return this;
  }

  dispose({ removeFromParent = true, evictTexture = false } = {}) {
    if (this.disposed) return;
    this.disposed = true;
    if (removeFromParent) this.root.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this._fallbackTexture?.dispose();
    this._fallbackTexture = null;
    if (this._textureRecord) {
      this._textureRecord.refs = Math.max(0, this._textureRecord.refs - 1);
      if (evictTexture && this._textureRecord.refs === 0) {
        this._textureRecord.texture?.dispose?.();
        textureCacheFor(this.THREE).delete(this._textureRecord.key);
      }
      this._textureRecord = null;
    }
    CONTROLLERS.delete(this.root);
    CONTROLLERS.delete(this.billboard);
    CONTROLLERS.delete(this.mesh);
    if (this.root.spriteController === this) delete this.root.spriteController;
  }
}

DirectionalSpriteController.Y_AXIS = Object.freeze({ x: 0, y: 1, z: 0 });

/** Creates a feet-anchored Group. The returned Group is never added to a scene automatically. */
export const createDirectionalSprite = (THREE, options = {}) =>
  new DirectionalSpriteController(THREE, options).root;

export const getDirectionalSpriteController = (spriteOrChild) => {
  if (!spriteOrChild) return null;
  return CONTROLLERS.get(spriteOrChild) ?? spriteOrChild.spriteController ?? null;
};

export const updateDirectionalSprite = (spriteOrChild, deltaSeconds, cameraOrPosition, options = {}) => {
  const controller = getDirectionalSpriteController(spriteOrChild);
  if (!controller) return false;
  controller.update(deltaSeconds, cameraOrPosition, options);
  return true;
};

export const setDirectionalSpriteAnimation = (spriteOrChild, animation, options) => {
  const controller = getDirectionalSpriteController(spriteOrChild);
  return controller ? controller.setAnimation(animation, options) : false;
};

export const disposeDirectionalSprite = (spriteOrChild, options) => {
  const controller = getDirectionalSpriteController(spriteOrChild);
  if (!controller) return false;
  controller.dispose(options);
  return true;
};

/** Warms the shared texture cache without creating scene objects. */
export const preloadDirectionalSpriteAtlas = (THREE, url, options = {}) => {
  requireThree(THREE);
  return getOrCreateTextureRecord(THREE, url, options).promise;
};

/** Clears unused cached atlases by default; pass force=true only during a full scene teardown. */
export const clearDirectionalSpriteTextureCache = (THREE, { force = false, dispose = true } = {}) => {
  const cache = TEXTURE_CACHES.get(THREE);
  if (!cache) return 0;
  let cleared = 0;
  cache.forEach((record, key) => {
    if (!force && record.refs > 0) return;
    if (dispose) record.texture?.dispose?.();
    cache.delete(key);
    cleared += 1;
  });
  if (cache.size === 0) TEXTURE_CACHES.delete(THREE);
  return cleared;
};

export const getDirectionalSpriteTextureCacheStats = (THREE) => {
  const cache = TEXTURE_CACHES.get(THREE);
  const stats = { total: 0, loading: 0, ready: 0, error: 0, referenced: 0 };
  cache?.forEach((record) => {
    stats.total += 1;
    stats[record.status] += 1;
    if (record.refs > 0) stats.referenced += 1;
  });
  return stats;
};
