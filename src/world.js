import { createVegasExpansion, EXPANSION_CONFIG } from "./vegasExpansion.js";

const WORLD = Object.freeze({
  halfExtent: EXPANSION_CONFIG.halfExtent,
  stripHalfWidth: 15,
  stripMinZ: -385,
  stripMaxZ: 355,
  tunnelFloor: -18,
  tunnelRampStartX: -285,
  tunnelRampEndX: -155,
  tunnelCenterZ: 130,
});

/**
 * Builds the entire Sin City RP map from a performant procedural core plus a
 * data-driven Greater Las Vegas expansion layer.
 */
export function createWorld(THREE, scene, rng) {
  if (!THREE) throw new Error("createWorld requires a Three.js namespace");

  const root = new THREE.Group();
  root.name = "SinCityRPWorld";
  scene?.add?.(root);

  if (scene && !scene.background) scene.background = new THREE.Color(0x050714);
  if (scene && !scene.fog) scene.fog = new THREE.FogExp2(0x07091b, 0.00145);

  const collisionBoxes = [];
  const animated = [];
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const unitPlane = new THREE.PlaneGeometry(1, 1);
  const unitCylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
  const dummy = new THREE.Object3D();

  const materials = {
    desert: new THREE.MeshStandardMaterial({ color: 0x574230, roughness: 0.96 }),
    dune: new THREE.MeshStandardMaterial({ color: 0x725538, roughness: 1 }),
    asphalt: new THREE.MeshStandardMaterial({ color: 0x10131b, roughness: 0.88, metalness: 0.08 }),
    runway: new THREE.MeshStandardMaterial({ color: 0x171b22, roughness: 0.9 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x737782, roughness: 0.86 }),
    paleConcrete: new THREE.MeshStandardMaterial({ color: 0xa4a2a0, roughness: 0.82 }),
    tunnel: new THREE.MeshStandardMaterial({ color: 0x505862, roughness: 0.91, metalness: 0.03, side: THREE.DoubleSide }),
    tunnelDark: new THREE.MeshStandardMaterial({ color: 0x252b31, roughness: 0.97 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xa87516, emissive: 0x5d3500, emissiveIntensity: 0.55, metalness: 0.72, roughness: 0.25 }),
    goldGlass: new THREE.MeshStandardMaterial({ color: 0x5f451d, emissive: 0x9a5300, emissiveIntensity: 0.34, metalness: 0.62, roughness: 0.18 }),
    glassBlue: new THREE.MeshStandardMaterial({ color: 0x142d46, emissive: 0x0b66a5, emissiveIntensity: 0.28, metalness: 0.45, roughness: 0.2 }),
    glassDark: new THREE.MeshStandardMaterial({ color: 0x171b29, emissive: 0x171a38, emissiveIntensity: 0.28, metalness: 0.38, roughness: 0.26 }),
    whitePaint: new THREE.MeshBasicMaterial({ color: 0xe8edf7 }),
    yellowPaint: new THREE.MeshBasicMaterial({ color: 0xffc928 }),
    red: new THREE.MeshStandardMaterial({ color: 0x6f111b, emissive: 0x8a0717, emissiveIntensity: 0.38, roughness: 0.48 }),
    police: new THREE.MeshStandardMaterial({ color: 0x15223b, emissive: 0x0b2a68, emissiveIntensity: 0.33, metalness: 0.35, roughness: 0.36 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x4d5662, metalness: 0.78, roughness: 0.36 }),
    black: new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 0.62 }),
    cactus: new THREE.MeshStandardMaterial({ color: 0x31563b, roughness: 0.94 }),
    water: new THREE.MeshStandardMaterial({ color: 0x243b43, emissive: 0x0b2631, emissiveIntensity: 0.2, roughness: 0.28, metalness: 0.18, transparent: true, opacity: 0.74 }),
  };

  const neonMaterials = [
    [0xff2ca8, 0xff007f],
    [0x21d9ff, 0x0088ff],
    [0xffa51f, 0xff4d00],
    [0x9f66ff, 0x5c19d8],
    [0x57ff8a, 0x00a743],
  ].map(([color, emissive]) => new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 2.1,
    metalness: 0.18,
    roughness: 0.28,
  }));

  let fallbackState = 0x51c17a5;
  const fallbackRandom = () => {
    fallbackState = (Math.imul(fallbackState, 1664525) + 1013904223) >>> 0;
    return fallbackState / 4294967296;
  };
  const sourceRandom = typeof rng === "function"
    ? rng
    : rng && typeof rng.random === "function"
      ? () => rng.random()
      : rng && typeof rng.next === "function"
        ? () => rng.next()
        : fallbackRandom;
  const random = () => {
    const value = Number(sourceRandom());
    return Number.isFinite(value) ? Math.abs(value % 1) : fallbackRandom();
  };
  const randomBetween = (min, max) => min + (max - min) * random();
  const choose = (values) => values[Math.min(values.length - 1, Math.floor(random() * values.length))];

  function pushCollision(center, size, type, name) {
    const box = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(center[0], center[1], center[2]),
      new THREE.Vector3(size[0], size[1], size[2]),
    );
    box.userData = { type, name };
    collisionBoxes.push(box);
    return box;
  }

  function addBox(name, size, position, material, options = {}) {
    const mesh = new THREE.Mesh(unitBox, material);
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(size[0], size[1], size[2]);
    if (options.rotation) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
    mesh.castShadow = options.castShadow ?? false;
    mesh.receiveShadow = options.receiveShadow ?? true;
    (options.parent || root).add(mesh);
    if (options.collidable) {
      // All collidable boxes in this map are axis aligned; sloped surfaces use groundHeightAt.
      pushCollision(position, size, options.collisionType || "solid", name);
    }
    return mesh;
  }

  function addInstances(name, geometry, material, transforms, options = {}) {
    if (!transforms.length) return null;
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
    mesh.name = name;
    mesh.castShadow = options.castShadow ?? false;
    mesh.receiveShadow = options.receiveShadow ?? true;
    transforms.forEach((transform, index) => {
      dummy.position.set(transform.position[0], transform.position[1], transform.position[2]);
      dummy.rotation.set(...(transform.rotation || [0, 0, 0]));
      dummy.scale.set(...(transform.scale || [1, 1, 1]));
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    (options.parent || root).add(mesh);
    return mesh;
  }

  function makeSign(text, position, width, height, color, rotationY = 0, options = {}) {
    const group = new THREE.Group();
    group.name = `Sign_${text.replace(/\s+/g, "_")}`;
    group.position.set(position[0], position[1], position[2]);
    group.rotation.y = rotationY;
    root.add(group);

    const backing = new THREE.Mesh(unitBox, materials.black);
    backing.scale.set(width + 0.8, height + 0.8, 0.35);
    backing.position.z = -0.18;
    group.add(backing);

    let signMaterial;
    if (typeof document !== "undefined") {
      const canvas = document.createElement("canvas");
      canvas.width = 1024;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      if (context) {
        context.clearRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "rgba(3, 5, 14, 0.94)";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.strokeStyle = `#${new THREE.Color(color).getHexString()}`;
        context.lineWidth = 18;
        context.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.font = options.font || "900 118px Arial, sans-serif";
        context.shadowBlur = 30;
        context.shadowColor = context.strokeStyle;
        context.strokeStyle = "rgba(255,255,255,0.9)";
        context.lineWidth = 8;
        context.strokeText(text, canvas.width / 2, canvas.height / 2 + 3, canvas.width - 75);
        context.fillStyle = `#${new THREE.Color(color).getHexString()}`;
        context.fillText(text, canvas.width / 2, canvas.height / 2 + 3, canvas.width - 75);
      }
      const texture = new THREE.CanvasTexture(canvas);
      if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      signMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true, side: THREE.DoubleSide });
    } else {
      signMaterial = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    }

    const face = new THREE.Mesh(unitPlane, signMaterial);
    face.scale.set(width, height, 1);
    face.position.z = 0.02;
    face.renderOrder = 3;
    group.add(face);
    if (options.pulse !== false) {
      animated.push({
        object: face,
        material: signMaterial,
        type: "signPulse",
        speed: options.speed || 2.2,
        phase: random() * Math.PI * 2,
        baseScale: face.scale.clone(),
      });
    }
    return group;
  }

  // Four ground slabs leave a genuine opening for the descending wash ramp.
  addBox("DesertGroundNorth", [900, 1, 569], [0, -0.55, -165.5], materials.desert);
  addBox("DesertGroundSouth", [900, 1, 309], [0, -0.55, 295.5], materials.desert);
  addBox("DesertGroundWashWest", [160, 1, 22], [-370, -0.55, 130], materials.desert);
  addBox("DesertGroundWashEast", [605, 1, 22], [147.5, -0.55, 130], materials.desert);

  // The Strip and its cross streets.
  addBox("LasVegasBoulevard", [30, 0.14, 740], [0, 0.02, -15], materials.asphalt);
  addBox("StripSidewalkWest", [11, 0.28, 740], [-20.5, 0.11, -15], materials.paleConcrete);
  addBox("StripSidewalkEast", [11, 0.28, 740], [20.5, 0.11, -15], materials.paleConcrete);

  const crossStreetZ = [-245, -125, 5, 125, 245];
  crossStreetZ.forEach((z, index) => {
    const length = index === 3 ? 520 : 330;
    const centerX = index === 3 ? 95 : 0;
    addBox(`CrossStreet_${index}`, [length, 0.12, 22], [centerX, 0.025, z], materials.asphalt);
    const sidewalkOffset = 14;
    addBox(`CrossStreet_${index}_WalkA`, [length, 0.22, 5], [centerX, 0.1, z - sidewalkOffset], materials.concrete);
    addBox(`CrossStreet_${index}_WalkB`, [length, 0.22, 5], [centerX, 0.1, z + sidewalkOffset], materials.concrete);
  });

  const laneMarks = [];
  for (let z = -378; z <= 348; z += 14) {
    laneMarks.push({ position: [-7.3, 0.105, z], scale: [0.22, 0.025, 7] });
    laneMarks.push({ position: [7.3, 0.105, z], scale: [0.22, 0.025, 7] });
  }
  addInstances("StripDashedLaneMarks", unitBox, materials.whitePaint, laneMarks);
  addInstances("StripCenterLines", unitBox, materials.yellowPaint, [
    { position: [-0.48, 0.11, -15], scale: [0.16, 0.025, 730] },
    { position: [0.48, 0.11, -15], scale: [0.16, 0.025, 730] },
  ]);

  const crosswalks = [];
  crossStreetZ.forEach((z) => {
    for (let x = -13; x <= 13; x += 3.2) {
      crosswalks.push({ position: [x, 0.13, z - 8.5], scale: [1.7, 0.025, 3.6] });
      crosswalks.push({ position: [x, 0.13, z + 8.5], scale: [1.7, 0.025, 3.6] });
    }
  });
  addInstances("StripCrosswalks", unitBox, materials.whitePaint, crosswalks);

  // Dense procedural hotel and casino blocks, instanced by facade material.
  const buildingMaterials = [materials.glassDark, materials.glassBlue, materials.goldGlass, materials.police, materials.red];
  const buildingBuckets = buildingMaterials.map(() => []);
  const windowBuckets = neonMaterials.map(() => []);
  const trimBuckets = neonMaterials.map(() => []);
  const buildingRecords = [];
  for (let z = -354; z <= 334; z += 30) {
    if (crossStreetZ.some((streetZ) => Math.abs(z - streetZ) < 20)) continue;
    for (const side of [-1, 1]) {
      for (let depth = 0; depth < 2; depth += 1) {
        if (side < 0 && z > -76 && z < 34) continue; // Aurelia block.
        if (side > 0 && z > 30 && z < 103) continue; // Police campus and helipad airspace.
        const width = randomBetween(17, 29);
        const buildingDepth = randomBetween(18, 27);
        const height = randomBetween(depth ? 18 : 32, depth ? 56 : 92);
        const x = side * (43 + depth * 31 + randomBetween(0, 8));
        const position = [x, height / 2, z + randomBetween(-4, 4)];
        const size = [width, height, buildingDepth];
        const materialIndex = Math.floor(random() * buildingMaterials.length);
        const neonIndex = Math.floor(random() * neonMaterials.length);
        buildingBuckets[materialIndex].push({ position, scale: size });
        buildingRecords.push({ position, size, side, neonIndex });
        pushCollision(position, size, "building", `NeonBlock_${buildingRecords.length}`);

        const facadeX = x - side * (width / 2 + 0.08);
        const facadeBandCount = Math.max(2, Math.min(6, Math.floor(height / 13)));
        for (let band = 1; band <= facadeBandCount; band += 1) {
          windowBuckets[neonIndex].push({
            position: [facadeX, (height * band) / (facadeBandCount + 1), position[2]],
            scale: [0.13, 0.52, buildingDepth * 0.72],
          });
        }
        trimBuckets[neonIndex].push({
          position: [facadeX - side * 0.03, height * 0.54, position[2] - buildingDepth * 0.38],
          scale: [0.2, height * 0.82, 0.2],
        });
        if (random() > 0.58) {
          trimBuckets[neonIndex].push({
            position: [facadeX - side * 0.03, height * 0.54, position[2] + buildingDepth * 0.38],
            scale: [0.2, height * 0.82, 0.2],
          });
        }
      }
    }
  }
  buildingBuckets.forEach((transforms, index) => addInstances(`ProceduralBuildings_${index}`, unitBox, buildingMaterials[index], transforms));
  windowBuckets.forEach((transforms, index) => addInstances(`WindowBands_${index}`, unitBox, neonMaterials[index], transforms));
  trimBuckets.forEach((transforms, index) => addInstances(`NeonTrims_${index}`, unitBox, neonMaterials[index], transforms));

  // Streetlights use two instanced meshes; only a few real lights are needed.
  const streetPoles = [];
  const streetLamps = [];
  for (let z = -360; z <= 340; z += 38) {
    for (const x of [-27.2, 27.2]) {
      streetPoles.push({ position: [x, 4.2, z], scale: [0.28, 8.4, 0.28] });
      streetLamps.push({ position: [x, 8.35, z], scale: [0.85, 0.32, 0.85] });
    }
  }
  addInstances("StreetlightPoles", unitCylinder, materials.steel, streetPoles);
  addInstances("StreetlightLamps", unitBox, neonMaterials[2], streetLamps);
  for (let z = -310; z <= 290; z += 100) {
    const lamp = new THREE.PointLight(z % 200 === 0 ? 0xff56bd : 0x51b9ff, 12, 58, 2);
    lamp.position.set(z % 200 === 0 ? -25 : 25, 9, z);
    root.add(lamp);
  }

  // Aurelia: the main casino landmark and gambling destination.
  const aurelia = new THREE.Group();
  aurelia.name = "AureliaCasino";
  root.add(aurelia);
  addBox("AureliaPodium", [72, 16, 82], [-72, 8, -22], materials.gold, { parent: aurelia, collidable: true, collisionType: "casino" });
  addBox("AureliaTower", [43, 106, 50], [-81, 53, -22], materials.goldGlass, { parent: aurelia, collidable: true, collisionType: "casino" });
  addBox("AureliaCrown", [49, 5, 56], [-81, 108.5, -22], materials.gold, { parent: aurelia });
  addBox("AureliaEntryCanopy", [18, 2, 30], [-31.5, 6.8, -22], materials.gold, { parent: aurelia });
  for (const z of [-33, -22, -11]) {
    addBox(`AureliaColumn_${z}`, [1.5, 12, 1.5], [-35.5, 6, z], materials.gold, { parent: aurelia, collidable: true, collisionType: "column" });
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(10, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), materials.goldGlass);
  dome.name = "AureliaDome";
  dome.position.set(-81, 121, -22);
  dome.scale.set(1.5, 1, 1.5);
  aurelia.add(dome);
  const crownRing = new THREE.Mesh(new THREE.TorusGeometry(15, 0.75, 8, 36), neonMaterials[2]);
  crownRing.name = "AureliaCrownRing";
  crownRing.position.set(-81, 119, -22);
  crownRing.rotation.x = Math.PI / 2;
  aurelia.add(crownRing);
  animated.push({ object: crownRing, type: "spin", speed: 0.2, phase: 0 });
  const casinoBeacon = new THREE.PointLight(0xff9f28, 42, 180, 2);
  casinoBeacon.position.set(-81, 122, -22);
  aurelia.add(casinoBeacon);
  animated.push({ object: casinoBeacon, type: "lightPulse", speed: 1.65, phase: 0.4, baseIntensity: 42 });
  makeSign("AURELIA", [-34.7, 19, -22], 24, 6.2, 0xffb12b, Math.PI / 2, { speed: 1.45 });

  // Fremont-inspired neon canopy and downtown stage.
  const canopyPanels = [];
  const canopySupports = [];
  for (let z = -374; z <= -274; z += 10) {
    canopyPanels.push({ position: [0, 21.5, z], scale: [48, 0.45, 8.6] });
  }
  for (let z = -374; z <= -274; z += 20) {
    canopySupports.push({ position: [-25, 10.5, z], scale: [1, 21, 1] });
    canopySupports.push({ position: [25, 10.5, z], scale: [1, 21, 1] });
    pushCollision([-25, 10.5, z], [1.2, 21, 1.2], "canopy_support", `FremontSupportWest_${z}`);
    pushCollision([25, 10.5, z], [1.2, 21, 1.2], "canopy_support", `FremontSupportEast_${z}`);
  }
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x7636ff,
    emissive: 0x3010a8,
    emissiveIntensity: 2.4,
    transparent: true,
    opacity: 0.72,
    metalness: 0.28,
    roughness: 0.22,
  });
  const canopy = addInstances("FremontCanopy", unitBox, canopyMaterial, canopyPanels);
  addInstances("FremontCanopySupports", unitBox, materials.steel, canopySupports);
  animated.push({ object: canopy, material: canopyMaterial, type: "canopyWave", speed: 1.15, phase: 0.2 });
  addBox("FremontStage", [24, 2.2, 11], [0, 1.1, -368], materials.black, { collidable: true, collisionType: "stage" });
  makeSign("FREMONT AFTER DARK", [0, 15, -376], 38, 5.2, 0xff2aa6, 0, { speed: 3.2 });

  // Police station, helipad, and animated emergency lights.
  addBox("MetroPoliceStation", [44, 23, 54], [72, 11.5, 66], materials.police, { collidable: true, collisionType: "police_station" });
  addBox("PoliceStationLobby", [12, 8, 20], [47, 4, 66], materials.glassBlue, { collidable: true, collisionType: "police_station" });
  addBox("PoliceHelipad", [29, 1.1, 29], [72, 23.55, 66], materials.concrete);
  const helipadRing = new THREE.Mesh(new THREE.TorusGeometry(10, 0.45, 8, 32), materials.whitePaint);
  helipadRing.name = "PoliceHelipadRing";
  helipadRing.position.set(72, 24.2, 66);
  helipadRing.rotation.x = Math.PI / 2;
  root.add(helipadRing);
  makeSign("LV METRO", [49.7, 15, 66], 17, 4.2, 0x3fa8ff, -Math.PI / 2, { speed: 4.4 });
  const policeRed = new THREE.PointLight(0xff1838, 24, 70, 2);
  const policeBlue = new THREE.PointLight(0x157dff, 24, 70, 2);
  policeRed.position.set(70, 26.5, 62);
  policeBlue.position.set(74, 26.5, 70);
  root.add(policeRed, policeBlue);
  animated.push({ object: policeRed, type: "strobe", speed: 8, phase: 0, baseIntensity: 24 });
  animated.push({ object: policeBlue, type: "strobe", speed: 8, phase: Math.PI, baseIntensity: 24 });

  // Airport district, runway, terminal, control tower, and primitive aircraft.
  addBox("AirportRunway", [44, 0.14, 336], [285, 0.03, 175], materials.runway);
  addBox("AirportTaxiway", [83, 0.12, 25], [231.5, 0.04, 93], materials.runway);
  addBox("AirportTerminal", [69, 20, 112], [201, 10, 191], materials.glassBlue, { collidable: true, collisionType: "airport_terminal" });
  addBox("AirportConcourse", [31, 11, 178], [242, 5.5, 190], materials.paleConcrete, { collidable: true, collisionType: "airport_terminal" });
  addBox("ControlTowerShaft", [9, 36, 9], [187, 18, 117], materials.concrete, { collidable: true, collisionType: "tower" });
  addBox("ControlTowerCab", [17, 7, 17], [187, 38, 117], materials.glassBlue, { collidable: true, collisionType: "tower" });
  makeSign("SIN CITY AIR", [236, 17, 87.3], 27, 5, 0x4dcfff, 0, { speed: 1.7 });

  const runwayLines = [];
  for (let z = 22; z <= 328; z += 22) runwayLines.push({ position: [285, 0.13, z], scale: [1.2, 0.025, 11] });
  for (const x of [270, 300]) {
    runwayLines.push({ position: [x, 0.13, 175], scale: [0.45, 0.025, 322] });
  }
  addInstances("RunwayMarkings", unitBox, materials.whitePaint, runwayLines);

  function addAircraft(name, position, rotationY, colorMaterial) {
    const aircraft = new THREE.Group();
    aircraft.name = name;
    aircraft.position.set(position[0], position[1], position[2]);
    aircraft.rotation.y = rotationY;
    root.add(aircraft);
    const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.5, 17, 12), colorMaterial);
    fuselage.rotation.x = Math.PI / 2;
    aircraft.add(fuselage);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(1.25, 4, 12), colorMaterial);
    nose.rotation.x = -Math.PI / 2;
    nose.position.z = -10.5;
    aircraft.add(nose);
    const wing = new THREE.Mesh(unitBox, colorMaterial);
    wing.scale.set(15, 0.28, 4.4);
    aircraft.add(wing);
    const tail = new THREE.Mesh(unitBox, colorMaterial);
    tail.scale.set(5.2, 0.24, 2.4);
    tail.position.z = 7;
    aircraft.add(tail);
    const fin = new THREE.Mesh(unitBox, materials.red);
    fin.scale.set(0.35, 3.2, 2.7);
    fin.position.set(0, 2, 7);
    aircraft.add(fin);
    return aircraft;
  }
  addAircraft("ParkedJet_A", [270, 2.1, 154], 0, materials.paleConcrete);
  addAircraft("ParkedJet_B", [270, 2.1, 224], Math.PI, materials.goldGlass);

  // The storm-drain wash: open ramp, readable portal, and underground cross network.
  const rampDeltaX = WORLD.tunnelRampEndX - WORLD.tunnelRampStartX;
  const rampDeltaY = WORLD.tunnelFloor;
  const rampLength = Math.hypot(rampDeltaX, rampDeltaY);
  const rampAngle = Math.atan2(rampDeltaY, rampDeltaX);
  addBox("WashRamp", [rampLength, 0.7, 18], [(WORLD.tunnelRampStartX + WORLD.tunnelRampEndX) / 2, WORLD.tunnelFloor / 2, WORLD.tunnelCenterZ], materials.tunnelDark, {
    rotation: [0, 0, rampAngle],
  });
  addBox("WashRampWater", [rampLength, 0.08, 5.2], [(WORLD.tunnelRampStartX + WORLD.tunnelRampEndX) / 2, WORLD.tunnelFloor / 2 + 0.42, WORLD.tunnelCenterZ], materials.water, {
    rotation: [0, 0, rampAngle],
  });
  for (const z of [WORLD.tunnelCenterZ - 9.5, WORLD.tunnelCenterZ + 9.5]) {
    addBox(`WashRetainingWall_${z}`, [rampLength, 3.6, 1.2], [-220, -7.3, z], materials.concrete, {
      rotation: [0, 0, rampAngle],
    });
  }
  for (let segment = 0; segment < 8; segment += 1) {
    const progress = (segment + 0.5) / 8;
    const x = THREE.MathUtils.lerp(WORLD.tunnelRampStartX, WORLD.tunnelRampEndX, progress);
    const floorY = THREE.MathUtils.lerp(0, WORLD.tunnelFloor, progress);
    for (const z of [WORLD.tunnelCenterZ - 9.5, WORLD.tunnelCenterZ + 9.5]) {
      pushCollision(
        [x, floorY + 2, z],
        [Math.abs(rampDeltaX) / 8 + 1, 4.4, 1.5],
        "tunnel_wall",
        `WashRampBarrier_${segment}_${z}`,
      );
    }
  }
  // Portal is built from three pieces so the center remains traversable.
  addBox("DrainPortalNorthPillar", [4, 12, 3.2], [-153, -12, 120], materials.concrete, { collidable: true, collisionType: "tunnel_wall" });
  addBox("DrainPortalSouthPillar", [4, 12, 3.2], [-153, -12, 140], materials.concrete, { collidable: true, collisionType: "tunnel_wall" });
  addBox("DrainPortalHeader", [4, 2.5, 23.2], [-153, -5.3, 130], materials.concrete, { collidable: true, collisionType: "tunnel_wall" });
  makeSign("FLOOD CHANNEL 17", [-155.2, -5.1, 130], 18, 2.7, 0xffb22d, -Math.PI / 2, { speed: 4.8 });
  makeSign("WASH TUNNELS", [-277, 5.2, 142], 22, 4.2, 0xff5c22, 0, { speed: 2.6 });

  // Main east-west tunnel.
  addBox("TunnelMainFloor", [385, 0.7, 21], [37.5, -18.35, 130], materials.tunnel);
  addBox("TunnelMainCeiling", [385, 1.1, 21], [37.5, -5.55, 130], materials.tunnel);
  for (const z of [119.5, 140.5]) {
    addBox(`TunnelMainWallA_${z}`, [177, 12.6, 1], [-65.5, -11.7, z], materials.tunnel, { collidable: true, collisionType: "tunnel_wall" });
    addBox(`TunnelMainWallB_${z}`, [180, 12.6, 1], [140, -11.7, z], materials.tunnel, { collidable: true, collisionType: "tunnel_wall" });
  }
  addBox("TunnelMainEndWall", [1, 12.6, 22], [230.5, -11.7, 130], materials.tunnel, { collidable: true, collisionType: "tunnel_wall" });
  addBox("TunnelMainGuideNorth", [383, 0.11, 0.11], [37.5, -16.55, 119.05], neonMaterials[1], { receiveShadow: false });
  addBox("TunnelMainGuideSouth", [383, 0.11, 0.11], [37.5, -16.55, 140.95], neonMaterials[1], { receiveShadow: false });

  // North-south branch with a wide, unobstructed junction.
  addBox("TunnelBranchFloor", [21, 0.7, 480], [35, -18.35, 70], materials.tunnel);
  addBox("TunnelBranchCeiling", [21, 1.1, 480], [35, -5.55, 70], materials.tunnel);
  for (const x of [24.5, 45.5]) {
    addBox(`TunnelBranchWallNorth_${x}`, [1, 12.6, 280], [x, -11.7, -30], materials.tunnel, { collidable: true, collisionType: "tunnel_wall" });
    addBox(`TunnelBranchWallSouth_${x}`, [1, 12.6, 160], [x, -11.7, 230], materials.tunnel, { collidable: true, collisionType: "tunnel_wall" });
  }
  addBox("TunnelBranchEndNorth", [22, 12.6, 1], [35, -11.7, -170.5], materials.tunnel, { collidable: true, collisionType: "tunnel_wall" });
  addBox("TunnelBranchEndSouth", [22, 12.6, 1], [35, -11.7, 310.5], materials.tunnel, { collidable: true, collisionType: "tunnel_wall" });
  addBox("TunnelBranchGuideWest", [0.11, 0.11, 478], [24.05, -16.55, 70], neonMaterials[4], { receiveShadow: false });
  addBox("TunnelBranchGuideEast", [0.11, 0.11, 478], [45.95, -16.55, 70], neonMaterials[4], { receiveShadow: false });

  const tunnelBulbs = [];
  for (let x = -135; x <= 215; x += 28) tunnelBulbs.push({ position: [x, -7.2, 130], scale: [1.4, 0.22, 0.6] });
  for (let z = -152; z <= 292; z += 28) tunnelBulbs.push({ position: [35, -7.2, z], scale: [0.6, 0.22, 1.4] });
  addInstances("TunnelUtilityLights", unitBox, neonMaterials[1], tunnelBulbs);
  for (const [x, z] of [[-110, 130], [-20, 130], [85, 130], [190, 130], [35, -120], [35, 10], [35, 230]]) {
    const tunnelLight = new THREE.PointLight(0x39c9ff, 13, 52, 2.1);
    tunnelLight.position.set(x, -7.5, z);
    root.add(tunnelLight);
    animated.push({ object: tunnelLight, type: "tunnelFlicker", speed: 7 + random() * 3, phase: random() * 8, baseIntensity: 13 });
  }

  // Desert perimeter silhouettes, rocks, cacti, and the classic roadside sign.
  const mesaTransforms = [];
  for (let i = 0; i < 30; i += 1) {
    const edge = i % 4;
    const along = randomBetween(-410, 410);
    const inset = randomBetween(370, 435);
    const x = edge < 2 ? (edge === 0 ? -inset : inset) : along;
    const z = edge >= 2 ? (edge === 2 ? -inset : inset) : along;
    const height = randomBetween(10, 32);
    mesaTransforms.push({ position: [x, height / 2 - 0.5, z], scale: [randomBetween(15, 42), height, randomBetween(14, 38)], rotation: [0, random() * Math.PI, 0] });
  }
  addInstances("DesertMesas", unitBox, materials.dune, mesaTransforms);

  const cactusTrunks = [];
  const cactusArms = [];
  const rocks = [];
  for (let i = 0; i < 48; i += 1) {
    let x = randomBetween(-420, 420);
    let z = randomBetween(-420, 420);
    if (Math.abs(x) < 175 && z > -390 && z < 365) x = Math.sign(x || 1) * randomBetween(185, 400);
    const height = randomBetween(3, 7.5);
    cactusTrunks.push({ position: [x, height / 2, z], scale: [1, height, 1], rotation: [0, random() * Math.PI, 0] });
    if (i % 2 === 0) cactusArms.push({ position: [x + 0.65, height * 0.55, z], scale: [1.7, 0.55, 0.55], rotation: [0, 0, randomBetween(-0.3, 0.3)] });
  }
  for (let i = 0; i < 75; i += 1) {
    const x = randomBetween(-435, 435);
    const z = randomBetween(-435, 435);
    if (Math.abs(x) < 160 && z > -390 && z < 355) continue;
    rocks.push({ position: [x, randomBetween(0.25, 0.85), z], scale: [randomBetween(0.7, 2.8), randomBetween(0.5, 1.5), randomBetween(0.7, 2.8)], rotation: [random(), random() * Math.PI, random()] });
  }
  addInstances("CactusTrunks", unitCylinder, materials.cactus, cactusTrunks);
  addInstances("CactusArms", unitCylinder, materials.cactus, cactusArms);
  addInstances("DesertRocks", new THREE.DodecahedronGeometry(1, 0), materials.dune, rocks);

  addBox("WelcomeSignPostA", [1, 11, 1], [-158, 5.5, 307], materials.steel);
  addBox("WelcomeSignPostB", [1, 11, 1], [-142, 5.5, 307], materials.steel);
  makeSign("WELCOME TO SIN CITY RP", [-150, 14, 307], 31, 7, 0xff3cab, Math.PI, { speed: 2.1, font: "900 88px Arial, sans-serif" });

  // Sky glow and stars are geometry, not an external environment map.
  const hemisphere = new THREE.HemisphereLight(0x4458a8, 0x20150f, 1.25);
  hemisphere.name = "NightHemisphere";
  root.add(hemisphere);
  const moonlight = new THREE.DirectionalLight(0xb5c7ff, 1.7);
  moonlight.name = "Moonlight";
  moonlight.position.set(-140, 260, 90);
  root.add(moonlight);
  const starPositions = new Float32Array(750 * 3);
  for (let i = 0; i < 750; i += 1) {
    const radius = randomBetween(430, 690);
    const angle = random() * Math.PI * 2;
    starPositions[i * 3] = Math.cos(angle) * radius;
    starPositions[i * 3 + 1] = randomBetween(150, 430);
    starPositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xdbe5ff, size: 1.1, sizeAttenuation: true }));
  stars.name = "DesertStars";
  root.add(stars);

  const expansion = createVegasExpansion(THREE, {
    root,
    collisionBoxes,
    random,
  });

  const locations = {
    spawn: { name: "Strip Arrival", position: new THREE.Vector3(-7, 0.6, 192), radius: 12, zone: "strip" },
    casino: { name: "Aurelia Casino", position: new THREE.Vector3(-28, 0.6, -22), radius: 18, zone: "aurelia-casino" },
    tunnelEntrance: { name: "Flood Channel 17", position: new THREE.Vector3(-278, 0.6, 130), radius: 20, zone: "storm-drains" },
    tunnelInterior: { name: "Wash Junction", position: new THREE.Vector3(-125, -17.5, 130), radius: 18, zone: "storm-drains" },
    airport: { name: "Sin City Air", position: new THREE.Vector3(237, 0.6, 93), radius: 26, zone: "airport" },
    policeStation: { name: "LV Metro", position: new THREE.Vector3(38, 0.6, 66), radius: 16, zone: "police-station" },
    fremont: { name: "Fremont After Dark", position: new THREE.Vector3(0, 0.6, -330), radius: 36, zone: "fremont" },
  };
  Object.assign(locations, expansion.locations);

  const rotation = (y = 0) => ({ x: 0, y, z: 0 });
  const position = (x, y, z) => ({ x, y, z });
  const vehicleSpawns = [
    { type: "sedan", position: position(-27, 0.55, 174), rotation: rotation(0), variant: "civilian" },
    { type: "sports_car", position: position(27, 0.55, 138), rotation: rotation(Math.PI), variant: "neon" },
    { type: "taxi", position: position(-27, 0.55, 52), rotation: rotation(0), variant: "yellow" },
    { type: "limousine", position: position(-29, 0.55, -54), rotation: rotation(0), variant: "casino" },
    { type: "streetMotorcycle", position: position(27, 0.45, -180), rotation: rotation(Math.PI), variant: "street" },
    { type: "bicycle", position: position(22, 0.38, 202), rotation: rotation(-Math.PI / 2), variant: "strip_cruiser" },
    { type: "police_cruiser", position: position(47, 0.55, 83), rotation: rotation(Math.PI / 2), variant: "metro" },
    { type: "policeSuv", position: position(49, 0.65, 48), rotation: rotation(Math.PI / 2), variant: "metro" },
    { type: "utilityVan", position: position(-246, -4.4, 130), rotation: rotation(-Math.PI / 2), variant: "drain_crew" },
    { type: "airportShuttle", position: position(225, 0.65, 93), rotation: rotation(Math.PI / 2), variant: "airport" },
    { type: "private_jet", position: position(285, 2.1, 48), rotation: rotation(0), variant: "flyable" },
    { type: "helicopter", position: position(72, 25.2, 66), rotation: rotation(Math.PI / 2), variant: "police" },
  ];
  vehicleSpawns.push(...expansion.vehicleSpawns);

  const npcSpawns = [
    { type: "cop", position: position(38, 0.4, 60), rotation: rotation(-Math.PI / 2), role: "patrol" },
    { type: "cop", position: position(23, 0.4, 18), rotation: rotation(Math.PI), role: "traffic" },
    { type: "cop", position: position(-8, 0.4, -314), rotation: rotation(0), role: "downtown" },
    { type: "casino_security", position: position(-29, 0.4, -29), rotation: rotation(-Math.PI / 2), role: "security" },
    { type: "dealer", position: position(-30, 0.4, -16), rotation: rotation(-Math.PI / 2), role: "blackjack" },
    { type: "high_roller", position: position(-23, 0.4, -8), rotation: rotation(Math.PI), role: "casino_guest" },
    { type: "civilian", position: position(-21, 0.4, 151), rotation: rotation(0), role: "tourist" },
    { type: "civilian", position: position(22, 0.4, -206), rotation: rotation(Math.PI), role: "local" },
    { type: "street_performer", position: position(8, 0.4, -350), rotation: rotation(0), role: "performer" },
    { type: "pilot", position: position(225, 0.4, 92), rotation: rotation(Math.PI), role: "pilot" },
    { type: "mechanic", position: position(260, 0.4, 178), rotation: rotation(Math.PI / 2), role: "airport" },
    { type: "drain_scout", position: position(-112, -17.4, 130), rotation: rotation(Math.PI / 2), role: "informant" },
    { type: "tunnel_squatter", position: position(35, -17.4, 20), rotation: rotation(Math.PI), role: "underground" },
    { type: "smuggler", position: position(35, -17.4, 260), rotation: rotation(0), role: "underground" },
  ];
  // Keep a meaningful subset of the visible crowds fully interactive while the
  // crowd renderer handles the much denser non-colliding background population.
  for (let index = 0; index < 12; index += 1) {
    const side = index % 2 ? -1 : 1;
    npcSpawns.push({
      type: "civilian",
      position: position(side * randomBetween(24, 29), 0.4, randomBetween(-255, 255)),
      rotation: rotation(side > 0 ? -Math.PI / 2 : Math.PI / 2),
      role: "tourist",
      variant: `strip_visitor_${index}`,
    });
  }
  for (let index = 0; index < 6; index += 1) {
    npcSpawns.push({
      type: "civilian",
      position: position(randomBetween(-22, 22), 0.4, randomBetween(-375, -320)),
      rotation: rotation(random() * Math.PI * 2),
      role: "tourist",
      variant: `fremont_visitor_${index}`,
    });
  }
  for (let index = 0; index < 4; index += 1) {
    npcSpawns.push({
      type: "civilian",
      position: position(randomBetween(-42, -27), 0.4, randomBetween(-42, 16)),
      rotation: rotation(random() * Math.PI * 2),
      role: "tourist",
      variant: `casino_guest_${index}`,
    });
  }
  for (let index = 0; index < 4; index += 1) {
    npcSpawns.push({
      type: "civilian",
      position: position(randomBetween(214, 274), 0.4, randomBetween(84, 176)),
      rotation: rotation(random() * Math.PI * 2),
      role: "tourist",
      variant: `airport_visitor_${index}`,
    });
  }
  npcSpawns.push(...expansion.npcSpawns);

  const pickupSpawns = [
    { type: "casinoChips", position: position(-25, 0.45, -25), rotation: rotation(random() * Math.PI * 2), rarity: "uncommon", variant: "aurelia" },
    { type: "cash", position: position(-8, 0.3, -342), rotation: rotation(random() * Math.PI * 2), rarity: "common", variant: "cash_roll" },
    { type: "medkit", position: position(38, 0.35, 74), rotation: rotation(0), rarity: "common" },
    { type: "ammo", position: position(98, 0.35, 42), rotation: rotation(0.2), rarity: "common" },
    { type: "lockpick", position: position(-132, -17.15, 137), rotation: rotation(1.1), rarity: "uncommon" },
    { type: "armor", position: position(-80, -17.1, 126), rotation: rotation(-0.7), rarity: "uncommon", variant: "tunnel_stash" },
    { type: "collectible", position: position(35, -17.2, -138), rotation: rotation(2.4), rarity: "legendary", variant: "storm_key" },
    { type: "contraband", position: position(44, -17.2, 278), rotation: rotation(0.6), rarity: "rare", variant: "sealed_package" },
    { type: "fuel", position: position(260, 0.35, 249), rotation: rotation(0), rarity: "common", variant: "aviation" },
    { type: "collectible", position: position(225, 0.4, 96), rotation: rotation(1.8), rarity: "legendary", variant: "flight_manifest" },
    { type: "cash", position: position(377, 0.4, -38), rotation: rotation(0.4), rarity: "common", variant: "salvage" },
    { type: "weaponCrate", position: position(-392, 0.4, -206), rotation: rotation(2), rarity: "rare", variant: "desert_cache" },
  ];
  pickupSpawns.push(...expansion.pickupSpawns);

  // Scatter extra discoverables deterministically while keeping every entry serializable.
  const itemTypes = ["cash", "cash", "casinoChips", "medkit", "ammo", "lockpick", "fuel", "contraband"];
  for (let i = 0; i < 22; i += 1) {
    const side = random() > 0.5 ? 1 : -1;
    pickupSpawns.push({
      type: choose(itemTypes),
      position: position(side * randomBetween(25, 32), 0.35, randomBetween(-350, 335)),
      rotation: rotation(random() * Math.PI * 2),
      rarity: "common",
    });
  }

  function unpackPosition(value, zValue, yHint) {
    if (value && typeof value === "object") {
      return {
        x: Number(value.x ?? value.position?.x ?? 0),
        y: Number(value.y ?? value.position?.y ?? yHint ?? 0),
        z: Number(value.z ?? value.position?.z ?? 0),
      };
    }
    return { x: Number(value || 0), y: Number(yHint || 0), z: Number(zValue || 0) };
  }

  function insideTunnelPlan(x, z) {
    const main = x >= -155 && x <= 231 && Math.abs(z - 130) <= 10.5;
    const branch = Math.abs(x - 35) <= 10.5 && z >= -171 && z <= 311;
    return main || branch;
  }

  function zoneAt(value, zValue, yHint) {
    const point = unpackPosition(value, zValue, yHint);
    const onRamp = point.x >= -292 && point.x <= -145 && Math.abs(point.z - WORLD.tunnelCenterZ) < 17;
    if ((point.y < -4 && insideTunnelPlan(point.x, point.z)) || onRamp) return "storm-drains";
    if (point.x > 165 && point.z > 10 && point.z < 355) return "airport";
    if (point.x > 39 && point.x < 101 && point.z > 32 && point.z < 100) return "police-station";
    if (point.x < -25 && point.x > -115 && point.z > -72 && point.z < 30) return "aurelia-casino";
    if (Math.abs(point.x) < 44 && point.z < -265 && point.z > -390) return "fremont";
    if (Math.abs(point.x) <= 34 && point.z >= WORLD.stripMinZ && point.z <= WORLD.stripMaxZ) return "strip";
    const expansionZone = expansion.zoneAt(point);
    if (expansionZone) return expansionZone;
    if (Math.abs(point.x) > 340 || Math.abs(point.z) > 365) return "desert";
    return "greater-vegas";
  }

  function groundHeightAt(value, zValue, yHint) {
    const point = unpackPosition(value, zValue, yHint);
    if (Math.abs(point.z - WORLD.tunnelCenterZ) <= 10.5 && point.x >= WORLD.tunnelRampStartX && point.x <= WORLD.tunnelRampEndX) {
      const progress = (point.x - WORLD.tunnelRampStartX) / (WORLD.tunnelRampEndX - WORLD.tunnelRampStartX);
      return THREE.MathUtils.lerp(0, WORLD.tunnelFloor, progress);
    }
    if (point.y < -4 && insideTunnelPlan(point.x, point.z)) return WORLD.tunnelFloor;
    return 0;
  }

  let elapsedTime = 0;
  function update(delta = 0, elapsed, camera) {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    elapsedTime = Number.isFinite(elapsed) ? elapsed : elapsedTime + safeDelta;
    for (const entry of animated) {
      if (!entry?.object) continue;
      const wave = Math.sin(elapsedTime * entry.speed + entry.phase);
      switch (entry.type) {
        case "spin":
          entry.object.rotation.z += safeDelta * entry.speed;
          break;
        case "lightPulse":
          entry.object.intensity = entry.baseIntensity * (0.76 + wave * 0.24);
          break;
        case "strobe":
          entry.object.intensity = wave > 0.28 ? entry.baseIntensity : 1.25;
          break;
        case "tunnelFlicker":
          entry.object.intensity = entry.baseIntensity * (0.72 + Math.max(-0.2, wave) * 0.28);
          break;
        case "canopyWave":
          entry.material.emissiveIntensity = 2.15 + wave * 0.72;
          break;
        case "signPulse":
          entry.object.scale.copy(entry.baseScale).multiplyScalar(1 + wave * 0.012);
          break;
        default:
          break;
      }
    }
    if (camera && stars) stars.position.x = camera.position.x * 0.08;
    expansion.update(safeDelta, elapsedTime, camera);
  }

  root.userData.worldBounds = new THREE.Box3(
    new THREE.Vector3(-WORLD.halfExtent, WORLD.tunnelFloor - 2, -WORLD.halfExtent),
    new THREE.Vector3(WORLD.halfExtent, 180, WORLD.halfExtent),
  );
  root.userData.config = WORLD;

  return {
    root,
    collisionBoxes,
    locations,
    vehicleSpawns,
    npcSpawns,
    pickupSpawns,
    animated,
    zoneAt,
    groundHeightAt,
    update,
    expansion,
  };
}
