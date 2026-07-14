import { GAME_CONFIG, NPC_PROFILES, PICKUP_TYPES, VEHICLE_TYPES } from "./gameData.js";

const RESOURCE_CACHES = new WeakMap();
let entitySequence = 0;

const nextEntityId = (prefix) => `${prefix}-${++entitySequence}`;

const requireThree = (THREE) => {
  if (!THREE?.Group || !THREE?.Mesh || !THREE?.Vector3) {
    throw new TypeError("A complete THREE namespace is required by entity factories.");
  }
};

const resourcesFor = (THREE) => {
  let resources = RESOURCE_CACHES.get(THREE);
  if (!resources) {
    resources = { geometries: new Map(), materials: new Map() };
    RESOURCE_CACHES.set(THREE, resources);
  }
  return resources;
};

const sharedGeometry = (THREE, key, factory) => {
  const cache = resourcesFor(THREE).geometries;
  if (!cache.has(key)) cache.set(key, factory());
  return cache.get(key);
};

const sharedMaterial = (THREE, color, options = {}) => {
  const materialOptions = {
    color,
    roughness: options.roughness ?? 0.68,
    metalness: options.metalness ?? 0.08,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
  };
  if (options.side !== undefined) materialOptions.side = options.side;
  const key = JSON.stringify(materialOptions);
  const cache = resourcesFor(THREE).materials;
  if (!cache.has(key)) cache.set(key, new THREE.MeshStandardMaterial(materialOptions));
  return cache.get(key);
};

const boxGeometry = (THREE, width, height, depth) =>
  sharedGeometry(THREE, `box:${width}:${height}:${depth}`, () => new THREE.BoxGeometry(width, height, depth));

const sphereGeometry = (THREE, radius, widthSegments = 12, heightSegments = 8) =>
  sharedGeometry(
    THREE,
    `sphere:${radius}:${widthSegments}:${heightSegments}`,
    () => new THREE.SphereGeometry(radius, widthSegments, heightSegments),
  );

const cylinderGeometry = (THREE, top, bottom, height, segments = 10) =>
  sharedGeometry(
    THREE,
    `cylinder:${top}:${bottom}:${height}:${segments}`,
    () => new THREE.CylinderGeometry(top, bottom, height, segments),
  );

const coneGeometry = (THREE, radius, height, segments = 10) =>
  sharedGeometry(THREE, `cone:${radius}:${height}:${segments}`, () => new THREE.ConeGeometry(radius, height, segments));

const torusGeometry = (THREE, radius, tube, radialSegments = 6, tubularSegments = 16) =>
  sharedGeometry(
    THREE,
    `torus:${radius}:${tube}:${radialSegments}:${tubularSegments}`,
    () => new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments),
  );

const octahedronGeometry = (THREE, radius) =>
  sharedGeometry(THREE, `octahedron:${radius}`, () => new THREE.OctahedronGeometry(radius, 0));

const makeMesh = (THREE, geometry, material, shadows = true) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = shadows;
  mesh.receiveShadow = shadows;
  return mesh;
};

const addBox = (THREE, parent, dimensions, position, material, rotation = null, shadows = true) => {
  const mesh = makeMesh(THREE, boxGeometry(THREE, ...dimensions), material, shadows);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
};

const addCylinder = (THREE, parent, dimensions, position, material, rotation = null, shadows = true) => {
  const mesh = makeMesh(THREE, cylinderGeometry(THREE, ...dimensions), material, shadows);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  parent.add(mesh);
  return mesh;
};

const createCharacterModel = (THREE, palette, { police = false, player = false } = {}) => {
  const model = new THREE.Group();
  model.name = player ? "PlayerModel" : police ? "PoliceModel" : "NpcModel";

  const skin = sharedMaterial(THREE, palette.skin, { roughness: 0.8 });
  const shirt = sharedMaterial(THREE, palette.shirt, { roughness: 0.72 });
  const pants = sharedMaterial(THREE, palette.pants, { roughness: 0.82 });
  const accent = sharedMaterial(THREE, palette.accent, {
    roughness: 0.45,
    metalness: police ? 0.55 : 0.2,
    emissive: player ? palette.accent : 0x000000,
    emissiveIntensity: player ? 0.12 : 0,
  });
  const shoe = sharedMaterial(THREE, 0x111318, { roughness: 0.9 });
  const hair = sharedMaterial(THREE, palette.hair ?? 0x22170f, { roughness: 0.95 });

  const pelvis = addBox(THREE, model, [0.62, 0.34, 0.4], [0, 0.94, 0], pants);
  const torso = addCylinder(THREE, model, [0.38, 0.31, 0.82, 8], [0, 1.42, 0], shirt);
  torso.scale.z = 0.72;

  const neck = addCylinder(THREE, model, [0.1, 0.11, 0.14, 8], [0, 1.9, 0], skin);
  const head = makeMesh(THREE, sphereGeometry(THREE, 0.27, 12, 8), skin);
  head.position.set(0, 2.12, -0.015);
  head.scale.set(0.88, 1.05, 0.92);
  model.add(head);

  const hairCap = makeMesh(THREE, sphereGeometry(THREE, 0.276, 12, 6), hair);
  hairCap.position.set(0, 2.19, 0.005);
  hairCap.scale.set(0.9, 0.57, 0.93);
  model.add(hairCap);

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.43, 1.68, 0);
  addCylinder(THREE, leftArm, [0.105, 0.09, 0.7, 8], [0, -0.27, 0], shirt, [0, 0, -0.08]);
  addCylinder(THREE, leftArm, [0.085, 0.075, 0.52, 8], [-0.02, -0.82, -0.01], skin, [0, 0, 0.05]);
  model.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.43, 1.68, 0);
  addCylinder(THREE, rightArm, [0.105, 0.09, 0.7, 8], [0, -0.27, 0], shirt, [0, 0, 0.08]);
  addCylinder(THREE, rightArm, [0.085, 0.075, 0.52, 8], [0.02, -0.82, -0.01], skin, [0, 0, -0.05]);
  model.add(rightArm);

  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.19, 0.88, 0);
  addCylinder(THREE, leftLeg, [0.14, 0.12, 0.76, 8], [0, -0.3, 0], pants);
  addCylinder(THREE, leftLeg, [0.12, 0.1, 0.63, 8], [0, -0.94, 0.015], pants);
  addBox(THREE, leftLeg, [0.25, 0.16, 0.43], [0, -1.28, -0.08], shoe);
  model.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.19, 0.88, 0);
  addCylinder(THREE, rightLeg, [0.14, 0.12, 0.76, 8], [0, -0.3, 0], pants);
  addCylinder(THREE, rightLeg, [0.12, 0.1, 0.63, 8], [0, -0.94, 0.015], pants);
  addBox(THREE, rightLeg, [0.25, 0.16, 0.43], [0, -1.28, -0.08], shoe);
  model.add(rightLeg);

  if (player) {
    const sash = addBox(THREE, model, [0.1, 0.88, 0.07], [0.12, 1.43, -0.3], accent, [0, 0, -0.48]);
    sash.castShadow = false;
  }

  if (police) {
    const hat = addCylinder(THREE, model, [0.3, 0.32, 0.12, 12], [0, 2.36, 0], shirt);
    const brim = addBox(THREE, model, [0.44, 0.04, 0.28], [0, 2.31, -0.14], shirt);
    const badge = makeMesh(THREE, octahedronGeometry(THREE, 0.09), accent);
    badge.position.set(-0.12, 1.57, -0.29);
    badge.scale.set(0.75, 1, 0.3);
    model.add(badge);
    addBox(THREE, model, [0.13, 0.3, 0.11], [0.36, 1.03, 0.1], shoe);
    hat.castShadow = true;
    brim.castShadow = true;
  }

  model.parts = { pelvis, torso, neck, head, leftArm, rightArm, leftLeg, rightLeg };
  return model;
};

/** Returns a ready-to-place player Group; it is not added to a scene. */
export function createPlayer(THREE) {
  requireThree(THREE);
  const palette = {
    skin: 0xb87955,
    shirt: 0x202631,
    pants: 0x11151c,
    accent: 0x28d7ff,
    hair: 0x17100d,
  };
  const player = createCharacterModel(THREE, palette, { player: true });
  player.name = "Player";
  player.userData = {
    entityId: nextEntityId("player"),
    entityType: "player",
    type: "player",
    forwardAxis: "-Z",
    role: "drifter",
    health: GAME_CONFIG.player.startHealth,
    maxHealth: GAME_CONFIG.player.maxHealth,
    armor: GAME_CONFIG.player.startArmor,
    maxArmor: GAME_CONFIG.player.maxArmor,
    cash: GAME_CONFIG.player.startCash,
    casinoChips: GAME_CONFIG.player.startCasinoChips,
    weapon: "pistol",
    ammo: GAME_CONFIG.player.startAmmo,
    inventory: [],
    wantedLevel: 0,
    heat: 0,
    reputation: 0,
    charisma: 5,
    velocity: new THREE.Vector3(),
    grounded: true,
    movementMode: "onFoot",
    activeVehicleId: null,
    interactable: false,
    collisionRadius: GAME_CONFIG.player.radius,
    sharedVisualResources: true,
  };
  return player;
}

const resolveNpcProfile = (profile, isCop) => {
  if (profile && typeof profile === "object") return profile;
  if (typeof profile === "string") {
    if (NPC_PROFILES[profile]) return NPC_PROFILES[profile];
    const match = Object.values(NPC_PROFILES).find((entry) => entry.id.toLowerCase() === profile.toLowerCase());
    if (match) return match;
  }
  return isCop ? NPC_PROFILES.patrolOfficer : NPC_PROFILES.local;
};

/** Returns a civilian or police NPC Group with interaction and AI state metadata. */
export function createNpc(THREE, profile, isCop = false) {
  requireThree(THREE);
  const resolved = resolveNpcProfile(profile, isCop);
  const police = Boolean(isCop || resolved.isCop || resolved.occupation === "police");
  const palette = resolved.colors ?? NPC_PROFILES.local.colors;
  const npc = createCharacterModel(THREE, palette, { police });
  const maxHealth = resolved.health ?? (police ? 125 : 85);
  const bribe = resolved.bribe ?? { allowed: true, minimum: GAME_CONFIG.interaction.bribe.baseAmount, greed: 0.5 };

  npc.name = police ? `Cop_${resolved.id ?? "officer"}` : `NPC_${resolved.id ?? "civilian"}`;
  npc.userData = {
    entityId: nextEntityId(police ? "cop" : "npc"),
    entityType: "npc",
    type: police ? "cop" : "civilian",
    forwardAxis: "-Z",
    profileId: resolved.id ?? "custom",
    label: resolved.label ?? (police ? "Officer" : "Civilian"),
    occupation: resolved.occupation ?? "civilian",
    isCop: police,
    health: maxHealth,
    maxHealth,
    armor: resolved.armor ?? 0,
    weapon: resolved.weapon ?? null,
    cashRange: Array.from(resolved.cash ?? [20, 100]),
    velocity: new THREE.Vector3(),
    state: police ? "patrol" : "wander",
    aiState: police ? "patrol" : "wander",
    previousState: null,
    targetEntityId: null,
    alertness: 0,
    bravery: resolved.bravery ?? 0.4,
    trust: resolved.trust ?? 35,
    fear: resolved.fear ?? 5,
    walkSpeed: resolved.walkSpeed ?? 2.4,
    chaseSpeed: resolved.chaseSpeed ?? (police ? GAME_CONFIG.police.chaseSpeed : 4.5),
    persuasionDifficulty: resolved.persuasionDifficulty ?? 0.5,
    canPersuade: resolved.canPersuade !== false,
    canBribe: Boolean(bribe.allowed),
    bribeMinimum: bribe.minimum ?? GAME_CONFIG.interaction.bribe.baseAmount,
    bribeGreed: bribe.greed ?? 0.5,
    bribeMaxWantedLevel: bribe.maxWantedLevel ?? 5,
    interaction: {
      canPersuade: resolved.canPersuade !== false,
      canBribe: Boolean(bribe.allowed),
      persuasionDifficulty: resolved.persuasionDifficulty ?? 0.5,
      bribeMinimum: bribe.minimum ?? GAME_CONFIG.interaction.bribe.baseAmount,
    },
    dialogue: Array.from(resolved.dialogue ?? []),
    interactable: true,
    collisionRadius: 0.42,
    sharedVisualResources: true,
  };
  return npc;
}

const resolveVehicleType = (type) => {
  if (type && typeof type === "object") return type;
  if (typeof type === "string") {
    if (VEHICLE_TYPES[type]) return VEHICLE_TYPES[type];
    const match = Object.values(VEHICLE_TYPES).find((entry) => entry.id.toLowerCase() === type.toLowerCase());
    if (match) return match;
  }
  return VEHICLE_TYPES.sedan;
};

const createWheel = (THREE, wheelConfig) => {
  const wheel = new THREE.Group();
  const tireMaterial = sharedMaterial(THREE, 0x101217, { roughness: 0.94 });
  const hubMaterial = sharedMaterial(THREE, 0xaeb4bd, { roughness: 0.32, metalness: 0.72 });
  const visualRadius = wheelConfig.radius * 0.78;
  const visualWidth = wheelConfig.width * 0.82;
  const tire = makeMesh(
    THREE,
    cylinderGeometry(THREE, visualRadius, visualRadius, visualWidth, 12),
    tireMaterial,
  );
  tire.rotation.z = Math.PI / 2;
  wheel.add(tire);
  const hub = makeMesh(
    THREE,
    cylinderGeometry(THREE, visualRadius * 0.48, visualRadius * 0.48, visualWidth + 0.015, 10),
    hubMaterial,
  );
  hub.rotation.z = Math.PI / 2;
  wheel.add(hub);
  return wheel;
};

/** Returns a detailed, low-cost road vehicle Group. */
export function createVehicle(THREE, type = "sedan", color) {
  requireThree(THREE);
  const config = resolveVehicleType(type);
  const typeId = config.id ?? (typeof type === "string" ? type : "custom");
  const paintColor = color ?? config.colors?.[0] ?? 0x545b66;
  const dimensions = config.dimensions ?? VEHICLE_TYPES.sedan.dimensions;
  const wheelConfig = config.wheel ?? VEHICLE_TYPES.sedan.wheel;
  const { width, length, height } = dimensions;
  const car = new THREE.Group();
  car.name = `Vehicle_${typeId}`;

  const paint = sharedMaterial(THREE, paintColor, { roughness: 0.34, metalness: 0.42 });
  const trim = sharedMaterial(THREE, 0x12151a, { roughness: 0.72, metalness: 0.22 });
  const glass = sharedMaterial(THREE, 0x172c3f, { roughness: 0.18, metalness: 0.3, transparent: true, opacity: 0.84 });
  const chrome = sharedMaterial(THREE, 0xb7bdc5, { roughness: 0.2, metalness: 0.82 });
  const headlight = sharedMaterial(THREE, 0xf8f2cf, {
    roughness: 0.18,
    emissive: 0xffe9a8,
    emissiveIntensity: 1.2,
  });
  const tailLight = sharedMaterial(THREE, 0xb80f28, {
    roughness: 0.28,
    emissive: 0xff183f,
    emissiveIntensity: 0.8,
  });

  const wheelY = wheelConfig.radius;
  const lowerBodyY = wheelY + height * 0.25;
  const chassis = addBox(THREE, car, [width, height * 0.48, length], [0, lowerBodyY, 0], paint);
  addBox(THREE, car, [width * 0.92, height * 0.13, length * 0.9], [0, wheelY + 0.03, 0], trim);
  addBox(THREE, car, [width * 0.86, height * 0.42, length * 0.48], [0, lowerBodyY + height * 0.42, length * 0.045], paint);
  const cabin = addBox(
    THREE,
    car,
    [width * 0.76, height * 0.33, length * 0.39],
    [0, lowerBodyY + height * 0.46, length * 0.01],
    glass,
  );
  cabin.castShadow = true;
  addBox(THREE, car, [width * 0.8, 0.08, length * 0.34], [0, lowerBodyY + height * 0.66, length * 0.04], paint);

  const frontZ = -length * 0.502;
  const rearZ = length * 0.502;
  for (const side of [-1, 1]) {
    const lightX = side * width * 0.3;
    addBox(THREE, car, [width * 0.2, height * 0.13, 0.055], [lightX, lowerBodyY + height * 0.08, frontZ], headlight, null, false);
    addBox(THREE, car, [width * 0.2, height * 0.13, 0.055], [lightX, lowerBodyY + height * 0.08, rearZ], tailLight, null, false);
  }
  addBox(THREE, car, [width * 0.5, 0.08, 0.08], [0, wheelY + 0.14, frontZ - 0.01], chrome);
  addBox(THREE, car, [width * 0.58, 0.07, 0.08], [0, wheelY + 0.12, rearZ + 0.01], trim);

  const wheelZ = length * 0.31;
  const wheelX = width * 0.51;
  const wheels = [];
  for (const side of [-1, 1]) {
    for (const axle of [-1, 1]) {
      const wheel = createWheel(THREE, wheelConfig);
      wheel.position.set(side * wheelX, wheelY, axle * wheelZ);
      car.add(wheel);
      wheels.push(wheel);
    }
  }

  // Door hinge groups stay hidden while closed and become visible when the
  // dynamics adapter animates them. This preserves the generated vehicle art
  // while still giving entry/exit a real 3D moving door silhouette.
  const doors = {};
  if (width > 1.45 && length > 3.45) {
    const addDoor = (id, side, rear = false) => {
      const hinge = new THREE.Group();
      const doorLength = length * (rear ? 0.2 : 0.235);
      const hingeZ = rear ? length * 0.025 : -length * 0.255;
      hinge.name = `DoorHinge_${id}`;
      hinge.position.set(side * width * 0.505, lowerBodyY + height * 0.22, hingeZ);
      const panel = addBox(
        THREE,
        hinge,
        [0.075, height * 0.43, doorLength],
        [side * 0.015, 0, doorLength * 0.5],
        paint,
        null,
        true,
      );
      panel.name = `DoorPanel_${id}`;
      panel.userData.realisticKeepVisible = true;
      hinge.visible = false;
      car.add(hinge);
      doors[id] = hinge;
    };
    addDoor("driver", -1, false);
    addDoor("frontPassenger", 1, false);
    addDoor("rearLeft", -1, true);
    addDoor("rearRight", 1, true);
  }

  if (config.roofSign) {
    const signMaterial = sharedMaterial(THREE, 0xffdf66, { emissive: 0xffbc2d, emissiveIntensity: 0.45 });
    addBox(THREE, car, [width * 0.38, 0.18, 0.3], [0, lowerBodyY + height * 0.79, 0.04], signMaterial);
  }

  if (config.police || config.hasSiren) {
    const red = sharedMaterial(THREE, 0xe21f3f, { emissive: 0xff173e, emissiveIntensity: 1.4 });
    const blue = sharedMaterial(THREE, 0x1e69e8, { emissive: 0x176cff, emissiveIntensity: 1.4 });
    addBox(THREE, car, [width * 0.34, 0.12, 0.18], [-width * 0.19, lowerBodyY + height * 0.8, 0.04], red, null, false);
    addBox(THREE, car, [width * 0.34, 0.12, 0.18], [width * 0.19, lowerBodyY + height * 0.8, 0.04], blue, null, false);
    addBox(THREE, car, [width * 0.78, 0.035, 0.15], [0, lowerBodyY + height * 0.73, 0.04], trim);
  }

  car.parts = { chassis, cabin, wheels, doors };
  car.userData = {
    entityId: nextEntityId("vehicle"),
    entityType: "vehicle",
    type: typeId,
    vehicleType: typeId,
    vehicleClass: config.class ?? "car",
    forwardAxis: "-Z",
    paintColor,
    dimensions: { width, length, height },
    health: config.maxHealth ?? 180,
    maxHealth: config.maxHealth ?? 180,
    speed: 0,
    speedKph: 0,
    throttle: 0,
    steering: 0,
    heading: 0,
    velocity: new THREE.Vector3(),
    maxSpeed: config.maxSpeed ?? 42,
    reverseSpeed: config.reverseSpeed ?? 13,
    acceleration: config.acceleration ?? 15,
    brake: config.brake ?? 27,
    handling: config.handling ?? 1.9,
    grip: config.grip ?? 0.9,
    seats: config.seats ?? 4,
    value: config.value ?? 0,
    fuel: 100,
    maxFuel: 100,
    engineOn: false,
    occupied: false,
    driverEntityId: null,
    locked: false,
    sirenOn: false,
    policeVehicle: Boolean(config.police),
    airborne: false,
    interactable: true,
    collisionRadius: Math.max(width, length * 0.5),
    massKg: config.massKg ?? (config.class === "bicycle" ? 105 : config.class === "motorcycle" ? 260 : Math.round(780 + width * length * height * 105)),
    sharedVisualResources: true,
  };
  return car;
}

/** Returns a recognizable single-engine plane Group with flight metadata. */
export function createPlane(THREE) {
  requireThree(THREE);
  const plane = new THREE.Group();
  plane.name = "Plane_DesertSkipper";

  const white = sharedMaterial(THREE, 0xe8edf2, { roughness: 0.34, metalness: 0.32 });
  const accent = sharedMaterial(THREE, 0xe73f67, { roughness: 0.32, metalness: 0.25 });
  const dark = sharedMaterial(THREE, 0x15191f, { roughness: 0.72, metalness: 0.25 });
  const glass = sharedMaterial(THREE, 0x19405d, { roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.78 });
  const chrome = sharedMaterial(THREE, 0xabb4bf, { roughness: 0.19, metalness: 0.85 });
  const beacon = sharedMaterial(THREE, 0xff2b4d, { emissive: 0xff1738, emissiveIntensity: 1.25 });

  const fuselage = addCylinder(THREE, plane, [0.45, 0.58, 7.2, 12], [0, 1.52, 0], white, [Math.PI / 2, 0, 0]);
  addCylinder(THREE, plane, [0.18, 0.43, 1.55, 10], [0, 1.52, 3.93], accent, [Math.PI / 2, 0, 0]);
  const nose = makeMesh(THREE, coneGeometry(THREE, 0.46, 1.35, 12), accent);
  nose.position.set(0, 1.52, -4.18);
  nose.rotation.x = -Math.PI / 2;
  plane.add(nose);

  const wings = addBox(THREE, plane, [9.2, 0.14, 1.28], [0, 1.56, -0.15], white);
  addBox(THREE, plane, [8.4, 0.055, 0.18], [0, 1.65, -0.76], accent);
  addBox(THREE, plane, [3.5, 0.1, 0.78], [0, 1.72, 3.05], white);
  addBox(THREE, plane, [0.14, 1.58, 1.45], [0, 2.25, 3.05], accent, [0.22, 0, 0]);

  const cockpit = makeMesh(THREE, sphereGeometry(THREE, 0.72, 12, 8), glass);
  cockpit.position.set(0, 1.98, -0.84);
  cockpit.scale.set(0.72, 0.7, 1.25);
  plane.add(cockpit);
  addBox(THREE, plane, [0.08, 0.68, 0.06], [0, 2.06, -1.38], dark, [0.17, 0, 0]);

  const propeller = new THREE.Group();
  propeller.position.set(0, 1.52, -4.9);
  addCylinder(THREE, propeller, [0.16, 0.16, 0.35, 10], [0, 0, 0.12], chrome, [Math.PI / 2, 0, 0]);
  addBox(THREE, propeller, [0.13, 2.65, 0.07], [0, 0, -0.05], dark);
  addBox(THREE, propeller, [2.65, 0.13, 0.07], [0, 0, -0.05], dark);
  plane.add(propeller);

  const gearMaterial = sharedMaterial(THREE, 0x16191e, { roughness: 0.94 });
  const landingGear = [];
  for (const [x, z, radius] of [
    [-1.25, -0.35, 0.31],
    [1.25, -0.35, 0.31],
    [0, 2.85, 0.22],
  ]) {
    addBox(THREE, plane, [0.07, 0.86, 0.07], [x, 0.76, z], chrome, [0, 0, x === 0 ? 0 : x > 0 ? -0.18 : 0.18]);
    const wheel = makeMesh(THREE, cylinderGeometry(THREE, radius, radius, 0.18, 10), gearMaterial);
    wheel.position.set(x, radius, z);
    wheel.rotation.z = Math.PI / 2;
    plane.add(wheel);
    landingGear.push(wheel);
  }
  const beaconMesh = makeMesh(THREE, sphereGeometry(THREE, 0.09, 8, 6), beacon, false);
  beaconMesh.position.set(0, 3.08, 2.85);
  plane.add(beaconMesh);

  plane.parts = { fuselage, wings, cockpit, propeller, landingGear, beacon: beaconMesh };
  plane.userData = {
    entityId: nextEntityId("plane"),
    entityType: "vehicle",
    type: "plane",
    vehicleType: "plane",
    vehicleClass: "aircraft",
    forwardAxis: "-Z",
    dimensions: { ...GAME_CONFIG.plane.dimensions },
    health: GAME_CONFIG.plane.maxHealth,
    maxHealth: GAME_CONFIG.plane.maxHealth,
    speed: 0,
    throttle: 0,
    yawInput: 0,
    pitchInput: 0,
    rollInput: 0,
    velocity: new THREE.Vector3(),
    maxSpeed: GAME_CONFIG.plane.maxSpeed,
    cruiseSpeed: GAME_CONFIG.plane.cruiseSpeed,
    stallSpeed: GAME_CONFIG.plane.stallSpeed,
    acceleration: GAME_CONFIG.plane.acceleration,
    fuel: 100,
    maxFuel: 100,
    engineOn: false,
    propellerAngle: 0,
    altitude: 0,
    airborne: false,
    grounded: true,
    occupied: false,
    driverEntityId: null,
    interactable: true,
    collisionRadius: 4.7,
    sharedVisualResources: true,
  };
  return plane;
}

const resolvePickupType = (kind) => {
  if (kind && typeof kind === "object") return kind;
  const aliases = {
    chips: "casinoChips",
    casinochips: "casinoChips",
    weapon: "weaponCrate",
    gun: "weaponCrate",
    health: "medkit",
  };
  const key = String(kind ?? "cash");
  if (PICKUP_TYPES[key]) return PICKUP_TYPES[key];
  const aliased = aliases[key.toLowerCase()];
  if (aliased) return PICKUP_TYPES[aliased];
  return Object.values(PICKUP_TYPES).find((entry) => entry.id.toLowerCase() === key.toLowerCase()) ?? PICKUP_TYPES.cash;
};

const addPickupVisual = (THREE, group, pickup) => {
  const main = sharedMaterial(THREE, pickup.color, { roughness: 0.48, metalness: pickup.rarity === "rare" ? 0.35 : 0.12 });
  const dark = sharedMaterial(THREE, 0x20242b, { roughness: 0.84 });
  const light = sharedMaterial(THREE, 0xf1f3f5, { roughness: 0.7 });
  const red = sharedMaterial(THREE, 0xd92e45, { roughness: 0.62 });
  const gold = sharedMaterial(THREE, 0xe5b84a, { roughness: 0.3, metalness: 0.6 });

  switch (pickup.id) {
    case "cash":
      for (let index = 0; index < 3; index += 1) {
        const bill = addBox(THREE, group, [0.72, 0.1, 0.38], [0, 0.18 + index * 0.1, 0], main, [0, index * 0.16, 0]);
        addBox(THREE, bill, [0.12, 0.105, 0.39], [0, 0, 0], light, null, false);
      }
      break;
    case "medkit": {
      addBox(THREE, group, [0.78, 0.58, 0.4], [0, 0.38, 0], light);
      addBox(THREE, group, [0.14, 0.38, 0.035], [0, 0.4, -0.218], red, null, false);
      addBox(THREE, group, [0.4, 0.14, 0.035], [0, 0.4, -0.219], red, null, false);
      addBox(THREE, group, [0.34, 0.08, 0.12], [0, 0.72, 0], dark);
      break;
    }
    case "armor":
      addBox(THREE, group, [0.62, 0.68, 0.28], [0, 0.45, 0], main);
      addBox(THREE, group, [0.17, 0.62, 0.2], [-0.32, 0.52, 0], main, [0, 0, -0.24]);
      addBox(THREE, group, [0.17, 0.62, 0.2], [0.32, 0.52, 0], main, [0, 0, 0.24]);
      addBox(THREE, group, [0.4, 0.08, 0.31], [0, 0.18, 0], dark);
      break;
    case "ammo":
      addBox(THREE, group, [0.86, 0.52, 0.55], [0, 0.34, 0], main);
      addBox(THREE, group, [0.9, 0.07, 0.59], [0, 0.62, 0], dark);
      for (const x of [-0.24, 0, 0.24]) addCylinder(THREE, group, [0.055, 0.055, 0.42, 8], [x, 0.92, 0], gold);
      break;
    case "casinoChips":
      for (let index = 0; index < 5; index += 1) {
        const chipColor = index % 2 ? gold : main;
        addCylinder(THREE, group, [0.33, 0.33, 0.09, 16], [0, 0.14 + index * 0.085, 0], chipColor);
      }
      break;
    case "lockpick":
      addBox(THREE, group, [0.08, 0.08, 0.85], [-0.1, 0.28, 0], main, [0, 0.25, 0.12]);
      addBox(THREE, group, [0.08, 0.08, 0.75], [0.14, 0.32, 0], main, [0, -0.22, -0.1]);
      addCylinder(THREE, group, [0.14, 0.14, 0.06, 12], [-0.2, 0.16, 0.35], dark, [Math.PI / 2, 0, 0]);
      break;
    case "fuel":
      addBox(THREE, group, [0.62, 0.78, 0.36], [0, 0.43, 0], main);
      addBox(THREE, group, [0.25, 0.22, 0.38], [0.13, 0.87, 0], main);
      addBox(THREE, group, [0.25, 0.28, 0.18], [0.04, 0.79, -0.11], dark);
      break;
    case "weaponCrate":
      addBox(THREE, group, [1.05, 0.32, 0.6], [0, 0.26, 0], main);
      addBox(THREE, group, [1.08, 0.09, 0.63], [0, 0.46, 0], dark);
      addBox(THREE, group, [0.16, 0.16, 0.05], [0, 0.3, -0.33], gold, null, false);
      break;
    case "contraband":
      addBox(THREE, group, [0.82, 0.34, 0.54], [0, 0.28, 0], main, [0, 0.13, 0]);
      addBox(THREE, group, [0.12, 0.35, 0.56], [0, 0.28, 0], dark, [0, 0.13, 0]);
      break;
    case "collectible": {
      const token = makeMesh(THREE, octahedronGeometry(THREE, 0.48), gold);
      token.position.set(0, 0.58, 0);
      token.rotation.z = Math.PI / 4;
      group.add(token);
      break;
    }
    default: {
      const marker = makeMesh(THREE, sphereGeometry(THREE, 0.38, 10, 7), main);
      marker.position.y = 0.44;
      group.add(marker);
    }
  }
};

/** Returns a collectible Group with a distinct silhouette and pickup effect metadata. */
export function createPickup(THREE, kind = "cash") {
  requireThree(THREE);
  const pickup = resolvePickupType(kind);
  const group = new THREE.Group();
  group.name = `Pickup_${pickup.id}`;

  const glowMaterial = sharedMaterial(THREE, pickup.glowColor ?? pickup.color, {
    roughness: 0.25,
    emissive: pickup.glowColor ?? pickup.color,
    emissiveIntensity: 0.9,
    transparent: true,
    opacity: 0.76,
  });
  const ring = makeMesh(THREE, torusGeometry(THREE, 0.66, 0.045, 6, 20), glowMaterial, false);
  ring.position.y = 0.055;
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  addPickupVisual(THREE, group, pickup);

  group.parts = { glowRing: ring };
  group.userData = {
    entityId: nextEntityId("pickup"),
    entityType: "pickup",
    type: "pickup",
    kind: pickup.id,
    label: pickup.label,
    rarity: pickup.rarity,
    amountMin: pickup.amount?.[0] ?? 1,
    amountMax: pickup.amount?.[1] ?? 1,
    effect: { ...(pickup.effect ?? {}) },
    lootTable: pickup.lootTable ? Array.from(pickup.lootTable) : null,
    pickupHeat: pickup.pickupHeat ?? 0,
    collected: false,
    respawnSeconds: pickup.rarity === "rare" || pickup.rarity === "legendary"
      ? GAME_CONFIG.pickups.rareRespawnSeconds
      : GAME_CONFIG.pickups.respawnSeconds,
    bobPhase: (entitySequence * 2.399963) % (Math.PI * 2),
    bobHeight: GAME_CONFIG.pickups.bobHeight,
    bobSpeed: GAME_CONFIG.pickups.bobSpeed,
    spinSpeed: GAME_CONFIG.pickups.spinSpeed,
    interactable: true,
    collisionRadius: GAME_CONFIG.pickups.collectRadius,
    sharedVisualResources: true,
  };
  return group;
}

const vectorFrom = (THREE, value) => {
  const source = value?.isObject3D ? value.getWorldPosition(new THREE.Vector3()) : value?.position ?? value;
  return new THREE.Vector3(source?.x ?? 0, source?.y ?? 0, source?.z ?? 0);
};

/** Returns a short-lived Line tracer between world-space points. */
export function createBulletTracer(THREE, from, to, color = 0xffd36a) {
  requireThree(THREE);
  const start = vectorFrom(THREE, from);
  const end = vectorFrom(THREE, to);
  const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
  const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.92 });
  const tracer = new THREE.Line(geometry, material);
  tracer.name = "BulletTracer";
  tracer.frustumCulled = false;
  tracer.userData = {
    entityId: nextEntityId("tracer"),
    entityType: "effect",
    type: "bulletTracer",
    ttl: GAME_CONFIG.combat.tracerLifetime,
    maxTtl: GAME_CONFIG.combat.tracerLifetime,
    distance: start.distanceTo(end),
    from: start.toArray(),
    to: end.toArray(),
    ownsResources: true,
  };
  return tracer;
}
