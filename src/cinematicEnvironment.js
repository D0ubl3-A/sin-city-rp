const CINEMATIC_ENVIRONMENT_KEY = "cinematicEnvironment";

const QUALITY_PROFILES = Object.freeze({
  low: {
    stars: 320,
    skySegments: 32,
    mountainSegments: 96,
    reflectorLimit: 180,
    reflectorSpacing: 24,
    roadDecals: 4,
    puddles: 7,
    tunnelGrates: 2,
    glowLimit: 2,
  },
  balanced: {
    stars: 720,
    skySegments: 40,
    mountainSegments: 160,
    reflectorLimit: 440,
    reflectorSpacing: 16,
    roadDecals: 12,
    puddles: 16,
    tunnelGrates: 4,
    glowLimit: 4,
  },
  high: {
    stars: 1100,
    skySegments: 48,
    mountainSegments: 224,
    reflectorLimit: 760,
    reflectorSpacing: 11,
    roadDecals: 22,
    puddles: 28,
    tunnelGrates: 7,
    glowLimit: 6,
  },
  ultra: {
    stars: 1500,
    skySegments: 64,
    mountainSegments: 288,
    reflectorLimit: 1050,
    reflectorSpacing: 8,
    roadDecals: 34,
    puddles: 42,
    tunnelGrates: 10,
    glowLimit: 7,
  },
});

const ROAD_NAME_PATTERN = /(boulevard|crossstreet|interstate|highway|us95|scenicdrive|access(?:west|north)|runway|road)/i;
const TUNNEL_FLOOR_PATTERN = /Tunnel(?:Main|Branch)Floor/i;

function createRng(seed = 0x9e3779b9) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function createRadialTexture(THREE, size = 64, irregular = false) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ny = (y + 0.5) / size * 2 - 1;
      const distortion = irregular
        ? Math.sin(nx * 13 + ny * 5) * 0.045 + Math.sin(ny * 19) * 0.025
        : 0;
      const distance = Math.sqrt(nx * nx + ny * ny) + distortion;
      const alpha = Math.max(0, Math.min(1, 1 - distance));
      const shaped = Math.pow(alpha, irregular ? 0.72 : 1.65);
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(shaped * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.name = irregular ? "DrainMoistureMask" : "CityHazeMask";
  return texture;
}

function frameForObject(THREE, object) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  object.getWorldPosition(position);
  object.getWorldQuaternion(quaternion);
  object.getWorldScale(scale);

  const longIsX = scale.x >= scale.z;
  const longAxis = new THREE.Vector3(longIsX ? 1 : 0, 0, longIsX ? 0 : 1)
    .applyQuaternion(quaternion)
    .setY(0)
    .normalize();
  const crossAxis = new THREE.Vector3(longIsX ? 0 : 1, 0, longIsX ? 1 : 0)
    .applyQuaternion(quaternion)
    .setY(0)
    .normalize();

  return {
    object,
    position,
    quaternion,
    longAxis,
    crossAxis,
    length: Math.max(scale.x, scale.z),
    width: Math.min(scale.x, scale.z),
    height: scale.y,
    topY: position.y + scale.y * 0.5,
  };
}

function collectFrames(THREE, root, matcher) {
  const frames = [];
  root?.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || !matcher.test(object.name || "")) return;
    const frame = frameForObject(THREE, object);
    if (frame.length > 8 && frame.width > 1) frames.push(frame);
  });
  return frames;
}

function addSky(THREE, parent, profile, rng, resources) {
  const rig = new THREE.Group();
  rig.name = "CinematicNevadaSkyRig";
  rig.renderOrder = -1000;
  parent.add(rig);

  const skyGeometry = new THREE.SphereGeometry(
    3550,
    profile.skySegments,
    Math.max(16, Math.round(profile.skySegments * 0.5)),
  );
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthTest: false,
    depthWrite: false,
    fog: false,
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      void main() {
        float h = clamp(vDirection.y, -0.14, 1.0);
        float horizonBand = smoothstep(-0.04, 0.22, h);
        float upperBand = smoothstep(0.18, 0.86, h);
        vec3 horizon = vec3(0.075, 0.031, 0.105);
        vec3 middle = vec3(0.018, 0.024, 0.072);
        vec3 zenith = vec3(0.002, 0.004, 0.020);
        vec3 color = mix(horizon, middle, horizonBand);
        color = mix(color, zenith, upperBand);
        float warmDome = pow(max(0.0, 1.0 - abs(vDirection.x * 1.7)), 5.0)
          * (1.0 - smoothstep(0.01, 0.34, h));
        color += vec3(0.08, 0.025, 0.04) * warmDome;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  resources.add(skyGeometry);
  resources.add(skyMaterial);
  const sky = new THREE.Mesh(skyGeometry, skyMaterial);
  sky.name = "NevadaNightGradient";
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  rig.add(sky);

  const starPositions = new Float32Array(profile.stars * 3);
  const starColors = new Float32Array(profile.stars * 3);
  const warm = new THREE.Color(0xffe3ce);
  const cool = new THREE.Color(0xd6e9ff);
  for (let index = 0; index < profile.stars; index += 1) {
    const azimuth = rng() * Math.PI * 2;
    const elevation = 0.075 + Math.pow(rng(), 0.72) * 1.35;
    const radius = 3100 + rng() * 80;
    const horizontal = Math.cos(elevation) * radius;
    starPositions[index * 3] = Math.cos(azimuth) * horizontal;
    starPositions[index * 3 + 1] = Math.sin(elevation) * radius;
    starPositions[index * 3 + 2] = Math.sin(azimuth) * horizontal;
    const color = rng() > 0.24 ? cool : warm;
    const strength = 0.56 + rng() * 0.44;
    starColors[index * 3] = color.r * strength;
    starColors[index * 3 + 1] = color.g * strength;
    starColors[index * 3 + 2] = color.b * strength;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  starGeometry.setAttribute("color", new THREE.BufferAttribute(starColors, 3));
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    vertexColors: true,
    size: profile.stars > 1000 ? 1.35 : 1.6,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthTest: true,
    depthWrite: false,
    fog: false,
  });
  resources.add(starGeometry);
  resources.add(starMaterial);
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.name = "CinematicDesertStars";
  stars.frustumCulled = false;
  stars.renderOrder = -980;
  rig.add(stars);

  const mountainPositions = [];
  const mountainIndices = [];
  const segmentCount = profile.mountainSegments;
  for (let index = 0; index <= segmentCount; index += 1) {
    const angle = index / segmentCount * Math.PI * 2;
    const radius = 2420;
    const ridgeNoise =
      Math.sin(angle * 7.0 + 0.4) * 34 +
      Math.sin(angle * 19.0 + 1.6) * 18 +
      Math.sin(angle * 41.0) * 8;
    const northWestMass = Math.pow(Math.max(0, Math.sin(angle - 1.8)), 2.4) * 115;
    const top = 78 + ridgeNoise + northWestMass;
    mountainPositions.push(Math.cos(angle) * radius, -28, Math.sin(angle) * radius);
    mountainPositions.push(Math.cos(angle) * radius, top, Math.sin(angle) * radius);
    if (index < segmentCount) {
      const bottom = index * 2;
      mountainIndices.push(bottom, bottom + 2, bottom + 1, bottom + 2, bottom + 3, bottom + 1);
    }
  }
  const mountainGeometry = new THREE.BufferGeometry();
  mountainGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(mountainPositions, 3),
  );
  mountainGeometry.setIndex(mountainIndices);
  mountainGeometry.computeVertexNormals();
  const mountainMaterial = new THREE.MeshBasicMaterial({
    color: 0x070812,
    depthTest: true,
    depthWrite: false,
    fog: false,
    side: THREE.DoubleSide,
  });
  resources.add(mountainGeometry);
  resources.add(mountainMaterial);
  const mountains = new THREE.Mesh(mountainGeometry, mountainMaterial);
  mountains.name = "NevadaMountainHorizon";
  mountains.frustumCulled = false;
  mountains.renderOrder = -960;
  rig.add(mountains);

  return rig;
}

function addCityHaze(THREE, parent, world, profile, resources) {
  const texture = createRadialTexture(THREE, 64, false);
  resources.add(texture);
  const locationTable = world?.locations || {};
  const definitions = [
    { key: "spawn", color: 0xff315f, width: 540, height: 170, opacity: 0.085 },
    { key: "casino", color: 0xffbd55, width: 470, height: 145, opacity: 0.09 },
    { key: "fremont", color: 0xb75cff, width: 430, height: 130, opacity: 0.075 },
    { key: "airport", color: 0x65a8ff, width: 560, height: 130, opacity: 0.05 },
    { key: "nellis", color: 0x68a3d2, width: 470, height: 110, opacity: 0.045 },
    { key: "area51", color: 0x82e6c7, width: 360, height: 90, opacity: 0.035 },
    { key: "policeStation", color: 0x527cff, width: 240, height: 70, opacity: 0.04 },
  ];
  let count = 0;
  for (const definition of definitions) {
    if (count >= profile.glowLimit) break;
    const location = locationTable[definition.key];
    const source = location?.position || location;
    if (!source || !Number.isFinite(source.x) || !Number.isFinite(source.z)) continue;
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: definition.color,
      transparent: true,
      opacity: definition.opacity,
      depthTest: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    resources.add(material);
    const glow = new THREE.Sprite(material);
    glow.name = `CityLightHaze_${definition.key}`;
    glow.position.set(source.x, Math.max(55, (source.y || 0) + definition.height * 0.38), source.z);
    glow.scale.set(definition.width, definition.height, 1);
    glow.renderOrder = -20;
    parent.add(glow);
    count += 1;
  }
  return count;
}

function addRoadDressing(THREE, parent, world, profile, rng, resources) {
  const frames = collectFrames(THREE, world?.root, ROAD_NAME_PATTERN)
    .sort((a, b) => {
      const aMain = /LasVegasBoulevard/i.test(a.object.name) ? 1 : 0;
      const bMain = /LasVegasBoulevard/i.test(b.object.name) ? 1 : 0;
      return bMain - aMain || b.length - a.length;
    });
  const amber = [];
  const white = [];
  let remaining = profile.reflectorLimit;
  for (const frame of frames) {
    if (remaining <= 0) break;
    const start = -frame.length * 0.5 + profile.reflectorSpacing * 0.6;
    const end = frame.length * 0.5 - profile.reflectorSpacing * 0.6;
    const edgeOffset = Math.max(1.2, Math.min(frame.width * 0.41, 9.8));
    for (let along = start; along <= end && remaining > 0; along += profile.reflectorSpacing) {
      const center = frame.position.clone().addScaledVector(frame.longAxis, along);
      center.y = frame.topY + 0.055;
      amber.push({ position: center, direction: frame.longAxis });
      remaining -= 1;
      if (remaining > 0 && frame.width > 5) {
        white.push({
          position: center.clone().addScaledVector(frame.crossAxis, edgeOffset),
          direction: frame.longAxis,
        });
        remaining -= 1;
      }
      if (remaining > 0 && frame.width > 5) {
        white.push({
          position: center.clone().addScaledVector(frame.crossAxis, -edgeOffset),
          direction: frame.longAxis,
        });
        remaining -= 1;
      }
    }
  }

  const reflectorGeometry = new THREE.BoxGeometry(0.22, 0.065, 0.42);
  resources.add(reflectorGeometry);
  const up = new THREE.Vector3(0, 1, 0);
  const forward = new THREE.Vector3(0, 0, 1);
  const dummy = new THREE.Object3D();
  const buildReflectorMesh = (records, color, name) => {
    if (!records.length) return null;
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.65,
      roughness: 0.32,
      metalness: 0.12,
    });
    resources.add(material);
    const mesh = new THREE.InstancedMesh(reflectorGeometry, material, records.length);
    mesh.name = name;
    records.forEach((record, index) => {
      dummy.position.copy(record.position);
      dummy.quaternion.setFromUnitVectors(forward, record.direction);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  };
  buildReflectorMesh(amber, 0xffa329, "AmberRoadReflectors");
  buildReflectorMesh(white, 0xe8f4ff, "WhiteRoadReflectors");

  const decalCount = Math.min(profile.roadDecals, Math.max(0, frames.length * 2));
  if (decalCount) {
    const decalGeometry = new THREE.CircleGeometry(1, 14);
    const decalMaterial = new THREE.MeshBasicMaterial({
      color: 0x08090c,
      transparent: true,
      opacity: 0.14,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      side: THREE.DoubleSide,
    });
    resources.add(decalGeometry);
    resources.add(decalMaterial);
    const decals = new THREE.InstancedMesh(decalGeometry, decalMaterial, decalCount);
    decals.name = "RoadWearAndRepairDecals";
    const flat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
    for (let index = 0; index < decalCount; index += 1) {
      const frame = frames[index % frames.length];
      const along = (rng() - 0.5) * frame.length * 0.72;
      const cross = (rng() - 0.5) * frame.width * 0.42;
      dummy.position.copy(frame.position)
        .addScaledVector(frame.longAxis, along)
        .addScaledVector(frame.crossAxis, cross);
      dummy.position.y = frame.topY + 0.018;
      dummy.quaternion.copy(flat);
      const radius = 0.65 + rng() * 1.35;
      dummy.scale.set(radius, radius * (0.72 + rng() * 0.38), 1);
      dummy.updateMatrix();
      decals.setMatrixAt(index, dummy.matrix);
    }
    decals.instanceMatrix.needsUpdate = true;
    parent.add(decals);
  }

  return { reflectors: amber.length + white.length, decals: decalCount };
}

function addTunnelDressing(THREE, parent, world, profile, rng, resources) {
  const frames = collectFrames(THREE, world?.root, TUNNEL_FLOOR_PATTERN);
  if (!frames.length) return { puddles: 0, pipes: 0, grates: 0 };

  const moistureTexture = createRadialTexture(THREE, 64, true);
  const puddleGeometry = new THREE.CircleGeometry(1, 20);
  const puddleMaterial = new THREE.MeshPhysicalMaterial({
    map: moistureTexture,
    color: 0x9fb4c0,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    roughness: 0.2,
    metalness: 0.04,
    clearcoat: 0.75,
    clearcoatRoughness: 0.18,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    side: THREE.DoubleSide,
  });
  resources.add(moistureTexture);
  resources.add(puddleGeometry);
  resources.add(puddleMaterial);
  const puddles = new THREE.InstancedMesh(puddleGeometry, puddleMaterial, profile.puddles);
  puddles.name = "StormDrainMoisturePuddles";
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  const flat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), up);
  for (let index = 0; index < profile.puddles; index += 1) {
    const frame = frames[index % frames.length];
    const along = (rng() - 0.5) * frame.length * 0.82;
    const cross = (rng() - 0.5) * frame.width * 0.58;
    dummy.position.copy(frame.position)
      .addScaledVector(frame.longAxis, along)
      .addScaledVector(frame.crossAxis, cross);
    dummy.position.y = frame.topY + 0.026;
    dummy.quaternion.copy(flat);
    dummy.scale.set(1.1 + rng() * 3.2, 0.45 + rng() * 1.1, 1);
    dummy.updateMatrix();
    puddles.setMatrixAt(index, dummy.matrix);
  }
  puddles.instanceMatrix.needsUpdate = true;
  puddles.castShadow = false;
  puddles.receiveShadow = true;
  parent.add(puddles);

  const pipeGeometry = new THREE.CylinderGeometry(0.18, 0.18, 1, 10, 1, false);
  const pipeMaterial = new THREE.MeshStandardMaterial({
    color: 0x273039,
    roughness: 0.38,
    metalness: 0.72,
  });
  resources.add(pipeGeometry);
  resources.add(pipeMaterial);
  let pipeCount = 0;
  const vertical = new THREE.Vector3(0, 1, 0);
  frames.forEach((frame) => {
    for (const side of [-1, 1]) {
      const pipe = new THREE.Mesh(pipeGeometry, pipeMaterial);
      pipe.name = `StormDrainServicePipe_${pipeCount + 1}`;
      pipe.position.copy(frame.position)
        .addScaledVector(frame.crossAxis, side * Math.max(1.4, frame.width * 0.39));
      pipe.position.y = frame.topY + Math.max(2.6, Math.min(8.4, frame.width * 0.7));
      pipe.quaternion.setFromUnitVectors(vertical, frame.longAxis);
      pipe.scale.set(1, frame.length * 0.9, 1);
      pipe.castShadow = false;
      pipe.receiveShadow = true;
      parent.add(pipe);
      pipeCount += 1;
    }
  });

  const barsPerGrate = 5;
  const grateCount = profile.tunnelGrates;
  const grateGeometry = new THREE.BoxGeometry(0.12, 0.045, 1);
  const grateMaterial = new THREE.MeshStandardMaterial({
    color: 0x15191d,
    roughness: 0.46,
    metalness: 0.66,
  });
  resources.add(grateGeometry);
  resources.add(grateMaterial);
  const grates = new THREE.InstancedMesh(grateGeometry, grateMaterial, grateCount * barsPerGrate);
  grates.name = "StormDrainFloorGrates";
  const forward = new THREE.Vector3(0, 0, 1);
  let instance = 0;
  for (let grateIndex = 0; grateIndex < grateCount; grateIndex += 1) {
    const frame = frames[grateIndex % frames.length];
    const baseAlong = -frame.length * 0.34 +
      (grateIndex + 0.7) / Math.max(1, grateCount) * frame.length * 0.68;
    for (let barIndex = 0; barIndex < barsPerGrate; barIndex += 1) {
      const along = baseAlong + (barIndex - (barsPerGrate - 1) * 0.5) * 0.28;
      dummy.position.copy(frame.position).addScaledVector(frame.longAxis, along);
      dummy.position.y = frame.topY + 0.045;
      dummy.quaternion.setFromUnitVectors(forward, frame.crossAxis);
      dummy.scale.set(1, 1, Math.min(2.8, frame.width * 0.24));
      dummy.updateMatrix();
      grates.setMatrixAt(instance, dummy.matrix);
      instance += 1;
    }
  }
  grates.instanceMatrix.needsUpdate = true;
  parent.add(grates);

  return { puddles: profile.puddles, pipes: pipeCount, grates: grateCount };
}

function markAsVisualOnly(root) {
  root.traverse((object) => {
    object.userData.visualOnly = true;
    object.userData.weaponRaycastIgnore = true;
    object.userData.collisionIgnore = true;
  });
}

export function installCinematicEnvironment(THREE, {
  scene,
  world,
  camera,
  quality = "balanced",
  mobile = false,
  testMode = false,
} = {}) {
  if (!THREE || !scene || !world?.root || !camera) return null;
  const existing = scene.userData[CINEMATIC_ENVIRONMENT_KEY];
  if (existing?.group?.parent) return existing;

  const requestedQuality = QUALITY_PROFILES[quality] ? quality : "balanced";
  const effectiveQuality = mobile || testMode ? "low" : requestedQuality;
  const profile = QUALITY_PROFILES[effectiveQuality];
  const rng = createRng(0x53494e43);
  const resources = new Set();
  const hiddenObjects = [];
  const previousBackground = scene.background;
  const previousFogColor = scene.fog?.color?.clone?.() || null;

  const group = new THREE.Group();
  group.name = "CinematicEnvironment";
  const skyGroup = new THREE.Group();
  skyGroup.name = "CinematicSkyLayer";
  const staticGroup = new THREE.Group();
  staticGroup.name = "CinematicWorldDressing";
  group.add(skyGroup, staticGroup);
  scene.add(group);

  scene.traverse((object) => {
    if (object === group || group.getObjectById(object.id)) return;
    if (object.name === "NevadaNightSky" || object.name === "DesertStars") {
      hiddenObjects.push({ object, visible: object.visible });
      object.visible = false;
    }
  });

  scene.background = new THREE.Color(0x01030a);
  if (scene.fog?.color) scene.fog.color.set(0x0b0c16);

  const skyRig = addSky(THREE, skyGroup, profile, rng, resources);
  const glows = addCityHaze(THREE, staticGroup, world, profile, resources);
  const roadStats = addRoadDressing(THREE, staticGroup, world, profile, rng, resources);
  const tunnelStats = addTunnelDressing(THREE, staticGroup, world, profile, rng, resources);

  skyRig.onBeforeRender = () => {
    skyRig.position.set(camera.position.x, 0, camera.position.z);
  };
  markAsVisualOnly(group);

  const controller = {
    group,
    quality: effectiveQuality,
    stats: {
      quality: effectiveQuality,
      stars: profile.stars,
      glows,
      reflectors: roadStats.reflectors,
      roadDecals: roadStats.decals,
      puddles: tunnelStats.puddles,
      pipes: tunnelStats.pipes,
      tunnelGrates: tunnelStats.grates,
    },
    dispose() {
      if (group.parent) group.parent.remove(group);
      hiddenObjects.forEach(({ object, visible }) => {
        object.visible = visible;
      });
      for (const resource of resources) resource.dispose?.();
      if (scene.background === controller.background) scene.background = previousBackground;
      if (previousFogColor && scene.fog?.color) scene.fog.color.copy(previousFogColor);
      if (scene.userData[CINEMATIC_ENVIRONMENT_KEY] === controller) {
        delete scene.userData[CINEMATIC_ENVIRONMENT_KEY];
      }
    },
  };
  controller.background = scene.background;
  scene.userData[CINEMATIC_ENVIRONMENT_KEY] = controller;
  world.root.userData.cinematicEnvironmentStats = controller.stats;
  return controller;
}
