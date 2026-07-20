import { generateArea51HangarManifest } from "./easterEggSystems.js";

const EXPANSION_CONFIG = Object.freeze({
  halfExtent: 1400,
  coreHalfExtent: 450,
  roadY: 0.025,
  groundTop: -0.05,
});

const DISTRICTS = Object.freeze([
  { id: "downtown-vegas", center: [0, -650], radius: [270, 180], count: 42, height: [18, 72], palette: [0x161c2b, 0x1d2637, 0x302238] },
  { id: "north-las-vegas", center: [390, -610], radius: [250, 210], count: 30, height: [10, 38], palette: [0x242b34, 0x30343b, 0x2b2630] },
  { id: "sunrise-manor", center: [720, -120], radius: [250, 330], count: 34, height: [8, 30], palette: [0x26313b, 0x2f3440, 0x342b35] },
  { id: "henderson", center: [720, 760], radius: [340, 260], count: 38, height: [8, 34], palette: [0x2d3036, 0x34343b, 0x2b3540] },
  { id: "south-strip", center: [0, 720], radius: [210, 250], count: 34, height: [14, 58], palette: [0x171b29, 0x202c3a, 0x38293c] },
]);

const LANDMARKS = Object.freeze({
  nellis: { x: 875, z: -720, radius: 250 },
  area51: { x: -930, z: -1110, radius: 270 },
  checkpoint: { x: 0, z: -470, radius: 70 },
  crashSite: { x: 820, z: 770, radius: 90 },
  redRock: { x: -1080, z: 120, radius: 300 },
});

const ROAD_CLEARANCE_CORRIDORS = Object.freeze([
  { axis: "z", x: 0, zMin: -1225, zMax: 1355, halfWidth: 22 },
  { axis: "z", x: -115, zMin: -1305, zMax: 1355, halfWidth: 27 },
  { axis: "x", z: -565, xMin: -70, xMax: 950, halfWidth: 25 },
  { axis: "z", x: 730, zMin: -785, zMax: -5, halfWidth: 21 },
  { axis: "z", x: 690, zMin: 0, zMax: 965, halfWidth: 22 },
  { axis: "x", z: -955, xMin: -1040, xMax: -240, halfWidth: 19 },
  { axis: "z", x: -930, zMin: -1310, zMax: -935, halfWidth: 22 },
  { axis: "x", z: 120, xMin: -1410, xMax: -465, halfWidth: 19 },
  { axis: "z", x: 835, zMin: -985, zMax: -485, halfWidth: 19 },
  { axis: "z", x: 905, zMin: -985, zMax: -485, halfWidth: 19 },
  { axis: "z", x: -930, zMin: -1415, zMax: -805, halfWidth: 23 },
]);

const toPosition = (x, y, z) => ({ x, y, z });
const toRotation = (y = 0) => ({ x: 0, y, z: 0 });

export function createVegasExpansion(THREE, options = {}) {
  if (!THREE) throw new Error("createVegasExpansion requires Three.js");
  const parent = options.root;
  if (!parent?.isObject3D) throw new Error("createVegasExpansion requires the existing world root");

  const collisionBoxes = options.collisionBoxes ?? [];
  const group = new THREE.Group();
  group.name = "GreaterLasVegasExpansion";
  parent.add(group);

  let fallbackState = 0xa51a51;
  const fallbackRandom = () => {
    fallbackState = (Math.imul(fallbackState, 1664525) + 1013904223) >>> 0;
    return fallbackState / 4294967296;
  };
  const sourceRandom = typeof options.random === "function" ? options.random : fallbackRandom;
  const random = () => {
    const value = Number(sourceRandom());
    return Number.isFinite(value) ? Math.abs(value % 1) : fallbackRandom();
  };
  const between = (min, max) => min + (max - min) * random();
  const choose = (items) => items[Math.min(items.length - 1, Math.floor(random() * items.length))];
  const blocksRoadClearance = (x, z, width = 1, depth = 1, padding = 5) => ROAD_CLEARANCE_CORRIDORS.some((road) => {
    const halfX = width / 2 + padding;
    const halfZ = depth / 2 + padding;
    if (road.axis === "z") return Math.abs(x - road.x) <= road.halfWidth + halfX && z + halfZ >= road.zMin && z - halfZ <= road.zMax;
    return Math.abs(z - road.z) <= road.halfWidth + halfZ && x + halfX >= road.xMin && x - halfX <= road.xMax;
  });

  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const cylinderGeometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 12);
  const coneGeometry = new THREE.ConeGeometry(1, 1, 7);
  const dummy = new THREE.Object3D();
  const materials = {
    desert: new THREE.MeshStandardMaterial({ color: 0x5b4331, roughness: 1 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x10131b, roughness: 0.91, metalness: 0.06 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x74736f, roughness: 0.94 }),
    military: new THREE.MeshStandardMaterial({ color: 0x303b34, roughness: 0.78, metalness: 0.2 }),
    hangar: new THREE.MeshStandardMaterial({ color: 0x3f4850, roughness: 0.64, metalness: 0.48 }),
    secret: new THREE.MeshStandardMaterial({ color: 0x171b20, roughness: 0.54, metalness: 0.55 }),
    occupation: new THREE.MeshStandardMaterial({ color: 0x4b1627, emissive: 0x8e0e38, emissiveIntensity: 0.72, roughness: 0.46 }),
    alien: new THREE.MeshStandardMaterial({ color: 0x56675f, emissive: 0x21ffb4, emissiveIntensity: 1.7, metalness: 0.72, roughness: 0.18 }),
    alienGlass: new THREE.MeshStandardMaterial({ color: 0x1a3751, emissive: 0x14c8ff, emissiveIntensity: 1.25, metalness: 0.42, roughness: 0.12, transparent: true, opacity: 0.72 }),
    runwayMark: new THREE.MeshBasicMaterial({ color: 0xe9eef6 }),
    runwayGlow: new THREE.MeshBasicMaterial({ color: 0x53caff, toneMapped: false }),
    warningGlow: new THREE.MeshBasicMaterial({ color: 0xff315c, toneMapped: false }),
    windowGlow: new THREE.MeshStandardMaterial({ color: 0x182235, emissive: 0x1c7fd0, emissiveIntensity: 1.2, roughness: 0.35 }),
  };

  function pushCollision(name, position, size, type = "building") {
    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(position[0], position[1], position[2]),
      new THREE.Vector3(size[0], size[1], size[2]),
    );
    box.userData = { name, type };
    collisionBoxes.push(box);
    return box;
  }

  function addBox(name, size, position, material, { collidable = false, rotationY = 0, parent: target = group } = {}) {
    const mesh = new THREE.Mesh(boxGeometry, material);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.scale.set(...size);
    mesh.rotation.y = rotationY;
    mesh.receiveShadow = true;
    mesh.castShadow = size[1] > 5;
    target.add(mesh);
    if (collidable) pushCollision(name, position, size);
    return mesh;
  }

  function addRoad(name, x, z, width, length, horizontal = false) {
    const size = horizontal ? [length, 0.12, width] : [width, 0.12, length];
    return addBox(name, size, [x, EXPANSION_CONFIG.roadY, z], materials.asphalt);
  }

  function addInstancedBoxes(name, records, material, { collisions = false } = {}) {
    if (!records.length) return null;
    const mesh = new THREE.InstancedMesh(boxGeometry, material, records.length);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    records.forEach((record, index) => {
      dummy.position.set(record.position[0], record.position[1], record.position[2]);
      dummy.rotation.set(0, record.rotationY || 0, 0);
      dummy.scale.set(record.size[0], record.size[1], record.size[2]);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      if (collisions) pushCollision(`${name}_${index}`, record.position, record.size);
    });
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    return mesh;
  }

  // Four slabs extend the existing 900x900 core without z-fighting over it.
  const outerSpan = EXPANSION_CONFIG.halfExtent - EXPANSION_CONFIG.coreHalfExtent;
  const outerCenter = EXPANSION_CONFIG.coreHalfExtent + outerSpan / 2;
  addBox("MojaveWestExpansion", [outerSpan, 1, EXPANSION_CONFIG.halfExtent * 2], [-outerCenter, -0.55, 0], materials.desert);
  addBox("MojaveEastExpansion", [outerSpan, 1, EXPANSION_CONFIG.halfExtent * 2], [outerCenter, -0.55, 0], materials.desert);
  addBox("MojaveNorthExpansion", [EXPANSION_CONFIG.coreHalfExtent * 2, 1, outerSpan], [0, -0.55, -outerCenter], materials.desert);
  addBox("MojaveSouthExpansion", [EXPANSION_CONFIG.coreHalfExtent * 2, 1, outerSpan], [0, -0.55, outerCenter], materials.desert);

  // Compressed but geographically legible Las Vegas road network.
  addRoad("LasVegasBoulevardNorth", 0, -835, 30, 770);
  addRoad("LasVegasBoulevardSouth", 0, 900, 30, 900);
  addRoad("Interstate15North", -115, -850, 42, 900);
  addRoad("Interstate15South", -115, 900, 42, 900);
  addRoad("US95Downtown", 440, -565, 34, 990, true);
  addRoad("NellisBoulevard", 730, -390, 28, 760);
  addRoad("BoulderHighway", 690, 480, 30, 940);
  addRoad("Area51AccessWest", -640, -955, 24, 770, true);
  addRoad("Area51AccessNorth", -930, -1125, 24, 350);
  addRoad("RedRockScenicDrive", -940, 120, 24, 920, true);

  const laneMarkers = [];
  for (let z = -1320; z <= -460; z += 34) laneMarkers.push({ position: [0, 0.105, z], size: [0.35, 0.03, 12] });
  for (let z = 460; z <= 1340; z += 34) laneMarkers.push({ position: [0, 0.105, z], size: [0.35, 0.03, 12] });
  addInstancedBoxes("ExtendedBoulevardLaneMarkers", laneMarkers, materials.runwayMark);

  // Dense, data-driven skyline families around the real valley districts.
  DISTRICTS.forEach((district) => {
    const buckets = district.palette.map(() => []);
    for (let index = 0; index < district.count; index += 1) {
      let x;
      let z;
      let width;
      let depth;
      let attempts = 0;
      do {
        x = district.center[0] + between(-district.radius[0], district.radius[0]);
        z = district.center[1] + between(-district.radius[1], district.radius[1]);
        width = between(14, 34);
        depth = between(14, 31);
        attempts += 1;
      } while (blocksRoadClearance(x, z, width, depth, 8) && attempts < 24);
      if (blocksRoadClearance(x, z, width, depth, 5)) continue;
      const height = between(district.height[0], district.height[1]);
      const record = { position: [x, height / 2, z], size: [width, height, depth] };
      buckets[Math.floor(random() * buckets.length)].push(record);
    }
    buckets.forEach((records, paletteIndex) => {
      const color = district.palette[paletteIndex];
      const material = new THREE.MeshStandardMaterial({
        color,
        emissive: new THREE.Color(color).multiplyScalar(0.25),
        emissiveIntensity: 0.5,
        metalness: 0.3,
        roughness: 0.42,
      });
      addInstancedBoxes(`${district.id}_Buildings_${paletteIndex}`, records, material, { collisions: true });
    });
  });

  // Low-cost mountains keep the desert and aerial horizon populated.
  const mountainRecords = [];
  for (let index = 0; index < 64; index += 1) {
    const baseAngle = index / 64 * Math.PI * 2;
    let angle;
    let radius;
    let x;
    let z;
    let attempts = 0;
    do {
      angle = baseAngle + attempts * 0.22 + between(-0.09, 0.09);
      radius = between(1190, 1390);
      x = Math.cos(angle) * radius;
      z = Math.sin(angle) * radius;
      attempts += 1;
    } while (attempts < 14 && (
      (x - LANDMARKS.nellis.x) ** 2 + (z - LANDMARKS.nellis.z) ** 2 < 420 ** 2
      || (x - LANDMARKS.area51.x) ** 2 + (z - LANDMARKS.area51.z) ** 2 < 440 ** 2
    ));
    const height = between(55, 180);
    mountainRecords.push({
      position: [x, height / 2 - 0.2, z],
      size: [between(35, 95), height, between(35, 95)],
      rotationY: between(0, Math.PI),
    });
  }
  const mountains = new THREE.InstancedMesh(coneGeometry, materials.desert, mountainRecords.length);
  mountains.name = "SpringMountainsAndDesertRidges";
  mountainRecords.forEach((record, index) => {
    dummy.position.set(...record.position);
    dummy.rotation.set(0, record.rotationY, 0);
    dummy.scale.set(...record.size);
    dummy.updateMatrix();
    mountains.setMatrixAt(index, dummy.matrix);
  });
  mountains.instanceMatrix.needsUpdate = true;
  group.add(mountains);

  const runwayLights = [];
  function addRunway(name, centerX, centerZ, width, length, heading = 0) {
    const horizontal = Math.abs(Math.sin(heading)) > 0.5;
    addRoad(name, centerX, centerZ, width, length, horizontal);
    const step = 22;
    for (let offset = -length / 2 + 10; offset <= length / 2 - 10; offset += step) {
      if (horizontal) {
        runwayLights.push({ position: [centerX + offset, 0.2, centerZ - width / 2], size: [0.45, 0.25, 0.45] });
        runwayLights.push({ position: [centerX + offset, 0.2, centerZ + width / 2], size: [0.45, 0.25, 0.45] });
      } else {
        runwayLights.push({ position: [centerX - width / 2, 0.2, centerZ + offset], size: [0.45, 0.25, 0.45] });
        runwayLights.push({ position: [centerX + width / 2, 0.2, centerZ + offset], size: [0.45, 0.25, 0.45] });
      }
    }
  }

  // Nellis Air Force Base: parallel runways, flight line, hangars, radar and control tower.
  addRunway("NellisRunway03L", 835, -735, 24, 470);
  addRunway("NellisRunway03R", 905, -735, 24, 470);
  for (let index = 0; index < 6; index += 1) {
    addBox(`NellisHangar_${index}`, [42, 18, 34], [720 + (index % 2) * 52, 9, -865 + Math.floor(index / 2) * 52], materials.hangar, { collidable: true });
  }
  addBox("NellisControlTower", [12, 52, 12], [770, 26, -650], materials.military, { collidable: true });
  addBox("NellisTowerCab", [22, 7, 22], [770, 55, -650], materials.windowGlow, { collidable: true });
  const nellisRadar = new THREE.Mesh(new THREE.SphereGeometry(8, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), materials.runwayGlow);
  nellisRadar.name = "NellisRadarDish";
  nellisRadar.position.set(704, 31, -640);
  nellisRadar.rotation.z = Math.PI / 2;
  group.add(nellisRadar);
  [
    { position: [748, 22, -820], color: 0xd9eaff, intensity: 42, distance: 210 },
    { position: [842, 18, -710], color: 0xffe2b7, intensity: 34, distance: 185 },
  ].forEach((definition, index) => {
    const floodlight = new THREE.PointLight(definition.color, definition.intensity, definition.distance, 1.8);
    floodlight.name = `NellisFloodlight_${index + 1}`;
    floodlight.position.set(...definition.position);
    group.add(floodlight);
  });

  // Area 51: remote runway, hardened hangars, bunker, perimeter and active craft.
  addRunway("GroomLakeRunway", LANDMARKS.area51.x, LANDMARKS.area51.z, 30, 580);
  addBox("Area51MainHangar", [92, 28, 54], [-1035, 14, -1150], materials.secret, { collidable: true });
  addBox("Area51ResearchHangar", [66, 24, 48], [-1035, 12, -1055], materials.hangar, { collidable: true });
  addBox("Area51BunkerEntrance", [45, 13, 30], [-842, 6.5, -1018], materials.occupation, { collidable: true });
  addBox("Area51ControlTower", [11, 46, 11], [-850, 23, -1190], materials.secret, { collidable: true });
  addBox("Area51ControlCab", [21, 6, 21], [-850, 49, -1190], materials.alienGlass, { collidable: true });

  const area51Manifest = generateArea51HangarManifest({
    seed: options.seed || "groom-lake-flight-complex",
    count: 28,
    hangarCount: 4,
  });
  const area51CraftVisuals = [];
  const craftBodyGeometry = new THREE.SphereGeometry(1, 18, 9);
  const craftRimGeometry = new THREE.TorusGeometry(0.82, 0.09, 8, 28);
  const craftDomeGeometry = new THREE.SphereGeometry(0.42, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2);
  const hangarOrigins = [
    new THREE.Vector3(-1125, 0, -1260),
    new THREE.Vector3(-1045, 0, -1260),
    new THREE.Vector3(-965, 0, -1260),
    new THREE.Vector3(-885, 0, -1260),
  ];
  hangarOrigins.forEach((origin, index) => {
    const hangarName = `Area51FlightHangar_${index + 1}`;
    addBox(`${hangarName}_Roof`, [72, 2, 58], [origin.x, 21, origin.z], materials.hangar, { collidable: true });
    addBox(`${hangarName}_WestWall`, [2, 21, 58], [origin.x - 35, 10.5, origin.z], materials.secret, { collidable: true });
    addBox(`${hangarName}_EastWall`, [2, 21, 58], [origin.x + 35, 10.5, origin.z], materials.secret, { collidable: true });
    addBox(`${hangarName}_BackWall`, [72, 21, 2], [origin.x, 10.5, origin.z - 28], materials.secret, { collidable: true });
    const light = new THREE.PointLight(0x58ffd1, 22, 85, 2);
    light.name = `${hangarName}_AlienFloodlight`;
    light.position.set(origin.x, 15, origin.z + 8);
    group.add(light);
  });
  area51Manifest.craft.forEach((entry, index) => {
    const hangarIndex = Math.max(0, Math.min(hangarOrigins.length - 1, Number(entry.hangarId.slice(-2)) - 1));
    const origin = hangarOrigins[hangarIndex];
    const localIndex = Math.floor(index / hangarOrigins.length);
    const column = localIndex % 4;
    const row = Math.floor(localIndex / 4);
    const craft = new THREE.Group();
    craft.name = entry.id;
    craft.position.set(origin.x + (column - 1.5) * 15, 2.2, origin.z + 12 - row * 18);
    craft.rotation.y = entry.localPosition.yaw;
    const body = new THREE.Mesh(craftBodyGeometry, materials.alien);
    const longBody = ["silentManta", "crescentInterceptor", "ionCourier"].includes(entry.classId);
    const cargoBody = entry.classId === "cargoDisc";
    body.scale.set(longBody ? 6.8 : cargoBody ? 6.2 : 5.3, cargoBody ? 1.2 : 0.82, longBody ? 3.9 : 5.3);
    const rim = new THREE.Mesh(craftRimGeometry, materials.runwayGlow);
    rim.scale.set(cargoBody ? 6.7 : 5.7, cargoBody ? 6.7 : 5.7, 1);
    rim.rotation.x = Math.PI / 2;
    const dome = new THREE.Mesh(craftDomeGeometry, materials.alienGlass);
    dome.scale.set(4.2, 2.6, 4.2);
    dome.position.y = 0.7;
    craft.add(body, rim, dome);
    craft.userData.area51Craft = entry;
    group.add(craft);
    area51CraftVisuals.push({ object: craft, baseY: craft.position.y, phase: index * 0.77 });
  });

  const ufo = new THREE.Group();
  ufo.name = "Area51ActiveUFO";
  ufo.position.set(-930, 68, -1010);
  const saucer = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 12), materials.alien);
  saucer.scale.set(24, 3.2, 24);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(19, 1.4, 10, 42), materials.runwayGlow);
  rim.rotation.x = Math.PI / 2;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), materials.alienGlass);
  dome.position.y = 2.4;
  ufo.add(saucer, rim, dome);
  group.add(ufo);
  const beamMaterial = new THREE.MeshBasicMaterial({ color: 0x55ffbb, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(3, 16, 62, 24, 1, true), beamMaterial);
  beam.name = "Area51TractorBeam";
  beam.position.set(-930, 31, -1010);
  group.add(beam);
  const ufoLight = new THREE.PointLight(0x42ffc0, 85, 230, 1.7);
  ufoLight.position.copy(ufo.position);
  group.add(ufoLight);

  // The takeover checkpoint makes the new faction visible before the long desert trip.
  addBox("OccupationCheckpointArch", [46, 4, 5], [0, 8, -470], materials.occupation, { collidable: true });
  addBox("OccupationCheckpointLegWest", [4, 14, 4], [-21, 7, -470], materials.occupation, { collidable: true });
  addBox("OccupationCheckpointLegEast", [4, 14, 4], [21, 7, -470], materials.occupation, { collidable: true });
  for (let index = -2; index <= 2; index += 1) {
    if (index === 0) continue;
    addBox(`OccupationBarricade_${index}`, [8, 1.2, 1.4], [Math.sign(index) * (24 + Math.abs(index) * 4), 0.65, -448], materials.warningGlow, { collidable: true, rotationY: index * 0.08 });
  }

  // Henderson crash site ties the alien invasion into the populated valley.
  const crashedCraft = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 10), materials.alien);
  crashedCraft.name = "HendersonCrashedScoutCraft";
  crashedCraft.position.set(LANDMARKS.crashSite.x, 4, LANDMARKS.crashSite.z);
  crashedCraft.scale.set(15, 2.7, 11);
  crashedCraft.rotation.z = 0.2;
  group.add(crashedCraft);
  const crashGlow = new THREE.PointLight(0x42ffac, 44, 120, 1.8);
  crashGlow.position.set(LANDMARKS.crashSite.x, 8, LANDMARKS.crashSite.z);
  group.add(crashGlow);

  addInstancedBoxes("NellisAndArea51RunwayLights", runwayLights, materials.runwayGlow);

  const locations = {
    downtown: { name: "Downtown Las Vegas", position: new THREE.Vector3(0, 0.6, -650), radius: 80, zone: "downtown-vegas" },
    occupationCheckpoint: { name: "Occupation Checkpoint", position: new THREE.Vector3(0, 0.6, -470), radius: 55, zone: "occupation-zone" },
    nellis: { name: "Nellis Air Force Base", position: new THREE.Vector3(LANDMARKS.nellis.x, 0.6, LANDMARKS.nellis.z), radius: 170, zone: "nellis-air-force-base" },
    area51: { name: "Area 51 / Groom Lake", position: new THREE.Vector3(LANDMARKS.area51.x, 0.6, LANDMARKS.area51.z), radius: 190, zone: "area-51" },
    alienCrash: { name: "Henderson Impact Site", position: new THREE.Vector3(LANDMARKS.crashSite.x, 0.6, LANDMARKS.crashSite.z), radius: 70, zone: "alien-crash-site" },
    redRock: { name: "Red Rock Canyon", position: new THREE.Vector3(LANDMARKS.redRock.x, 0.6, LANDMARKS.redRock.z), radius: 160, zone: "red-rock-canyon" },
    henderson: { name: "Henderson", position: new THREE.Vector3(720, 0.6, 760), radius: 120, zone: "henderson" },
  };

  const vehicleSpawns = [
    { type: "police_cruiser", position: toPosition(-28, 0.55, -490), rotation: toRotation(0), variant: "occupation" },
    { type: "policeSuv", position: toPosition(735, 0.65, -675), rotation: toRotation(Math.PI / 2), variant: "nellis_security" },
    { type: "utilityVan", position: toPosition(-1040, 0.65, -1090), rotation: toRotation(Math.PI), variant: "area51_research" },
    { type: "sports_car", position: toPosition(18, 0.55, -620), rotation: toRotation(Math.PI), variant: "downtown" },
    { type: "private_jet", position: toPosition(944, 2.1, -620), rotation: toRotation(Math.PI), variant: "nellis_flyable" },
    { type: "airportShuttle", position: toPosition(690, 0.65, 730), rotation: toRotation(Math.PI / 2), variant: "henderson" },
    { type: "dirtBike", position: toPosition(-612, 0.46, 835), rotation: toRotation(-Math.PI / 3), variant: "mojave_trail" },
    { type: "atv", position: toPosition(525, 0.52, 1115), rotation: toRotation(Math.PI / 4), variant: "desert_recreation" },
    { type: "duneBuggy", position: toPosition(-1025, 0.62, 82), rotation: toRotation(-Math.PI / 2), variant: "red_rock_tour" },
    { type: "offroadSuv", position: toPosition(-1122, 0.65, 164), rotation: toRotation(Math.PI / 2), variant: "red_rock_rescue" },
    { type: "offroadPickup", position: toPosition(746, 0.65, -812), rotation: toRotation(Math.PI), variant: "nellis_flight_line" },
    { type: "offroadSuv", position: toPosition(664, 0.65, 792), rotation: toRotation(Math.PI / 2), variant: "henderson_response" },
  ];

  const npcSpawns = [
    { type: "reptilian_pig_cop", position: toPosition(-24, 0.4, -463), rotation: toRotation(0), role: "occupation_enforcer", memoryId: "npc:occupation:enforcer-west", legacyMemoryIds: ["npc:reptilian_pig_cop:occupation_enforcer:14"] },
    { type: "reptilian_pig_cop", position: toPosition(24, 0.4, -463), rotation: toRotation(0), role: "occupation_enforcer", memoryId: "npc:occupation:enforcer-east", legacyMemoryIds: ["npc:reptilian_pig_cop:occupation_enforcer:15"] },
    { type: "reptilian_marshal", position: toPosition(774, 0.4, -664), rotation: toRotation(Math.PI / 2), role: "nellis_command", memoryId: "npc:nellis:reptilian-marshal", legacyMemoryIds: ["npc:reptilian_marshal:nellis_command:16"] },
    { type: "nellis_guard", position: toPosition(820, 0.4, -840), rotation: toRotation(Math.PI), role: "flight_line", memoryId: "npc:nellis:flight-line-guard", legacyMemoryIds: ["npc:nellis_guard:flight_line:17"] },
    { type: "alien_infiltrator", position: toPosition(-920, 0.4, -1030), rotation: toRotation(Math.PI), role: "groom_observer", memoryId: "npc:area51:groom-observer", legacyMemoryIds: ["npc:alien_infiltrator:groom_observer:18"] },
    { type: "alien_infiltrator", position: toPosition(810, 0.4, 758), rotation: toRotation(-Math.PI / 2), role: "crash_survivor", memoryId: "npc:alien-crash:survivor", legacyMemoryIds: ["npc:alien_infiltrator:crash_survivor:19"] },
    { type: "area51_scientist", position: toPosition(-1015, 0.4, -1080), rotation: toRotation(Math.PI / 2), role: "researcher", memoryId: "npc:area51:researcher", legacyMemoryIds: ["npc:area51_scientist:researcher:20"] },
  ];

  const pickupSpawns = [
    { type: "collectible", position: toPosition(-930, 0.4, -1004), rotation: toRotation(0.7), rarity: "legendary", variant: "alien_power_cell" },
    { type: "contraband", position: toPosition(-842, 0.4, -1002), rotation: toRotation(1.2), rarity: "legendary", variant: "reptilian_orders" },
    { type: "weaponCrate", position: toPosition(730, 0.4, -876), rotation: toRotation(0), rarity: "rare", variant: "nellis_armory" },
    { type: "collectible", position: toPosition(818, 0.4, 772), rotation: toRotation(2.1), rarity: "legendary", variant: "crash_fragment" },
    { type: "fuel", position: toPosition(940, 0.4, -790), rotation: toRotation(0), rarity: "common", variant: "jet_fuel" },
    { type: "weaponCrate", position: toPosition(-885, 0.4, -1228), rotation: toRotation(Math.PI / 2), rarity: "legendary", variant: "golden_pistol_relic" },
  ];

  function zoneAt(point) {
    const x = Number(point?.x ?? 0);
    const z = Number(point?.z ?? 0);
    const distanceSquared = (landmark) => (x - landmark.x) ** 2 + (z - landmark.z) ** 2;
    if (distanceSquared(LANDMARKS.area51) <= LANDMARKS.area51.radius ** 2) return "area-51";
    if (distanceSquared(LANDMARKS.nellis) <= LANDMARKS.nellis.radius ** 2) return "nellis-air-force-base";
    if (distanceSquared(LANDMARKS.crashSite) <= LANDMARKS.crashSite.radius ** 2) return "alien-crash-site";
    if (distanceSquared(LANDMARKS.checkpoint) <= LANDMARKS.checkpoint.radius ** 2) return "occupation-zone";
    if (x < -760 && Math.abs(z) < 470) return "red-rock-canyon";
    if (x > 480 && z > 480) return "henderson";
    if (Math.abs(x) < 330 && z < -430 && z > -840) return "downtown-vegas";
    if (x > 430 && z < 340 && z > -480) return "sunrise-manor";
    if (Math.abs(x) > EXPANSION_CONFIG.coreHalfExtent || Math.abs(z) > EXPANSION_CONFIG.coreHalfExtent) return "mojave-desert";
    return null;
  }

  function update(delta, elapsed) {
    const safeElapsed = Number.isFinite(elapsed) ? elapsed : 0;
    const safeDelta = Number.isFinite(delta) ? delta : 0;
    ufo.rotation.y += safeDelta * 0.46;
    ufo.position.y = 68 + Math.sin(safeElapsed * 0.72) * 3.4;
    ufoLight.position.copy(ufo.position);
    ufoLight.intensity = 78 + Math.sin(safeElapsed * 2.4) * 18;
    beamMaterial.opacity = 0.09 + (Math.sin(safeElapsed * 1.7) + 1) * 0.035;
    nellisRadar.rotation.y += safeDelta * 0.9;
    crashGlow.intensity = 37 + Math.sin(safeElapsed * 2.1) * 12;
    for (const craft of area51CraftVisuals) {
      craft.object.position.y = craft.baseY + Math.sin(safeElapsed * 0.72 + craft.phase) * 0.08;
    }
  }

  return {
    root: group,
    config: EXPANSION_CONFIG,
    locations,
    vehicleSpawns,
    npcSpawns,
    pickupSpawns,
    area51Manifest,
    zoneAt,
    update,
  };
}

export { EXPANSION_CONFIG };
