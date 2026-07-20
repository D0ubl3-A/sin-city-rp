import * as THREE from "three";

const QUALITY = (() => {
  const requested = new URLSearchParams(window.location.search).get("quality");
  if (["low", "balanced", "high", "ultra"].includes(requested)) return requested;
  const mobile = matchMedia("(pointer: coarse)").matches || innerWidth < 720;
  const memory = Number(navigator.deviceMemory) || 8;
  return mobile || memory <= 4 ? "low" : "balanced";
})();

const PROFILE = {
  low: { windows: 700, props: 150, palms: 42, signs: 24, roof: 65 },
  balanced: { windows: 1800, props: 340, palms: 90, signs: 55, roof: 150 },
  high: { windows: 3200, props: 620, palms: 150, signs: 90, roof: 260 },
  ultra: { windows: 5000, props: 900, palms: 220, signs: 135, roof: 420 },
}[QUALITY];

const BUILDING_PATTERN = /(Building|Tower|Hotel|Casino|Resort|Terminal|Concourse|Station|Hangar|Bunker|Research|Office|Commercial|Residential)/i;
const ROAD_PATTERN = /(Boulevard|CrossStreet|Interstate|Highway|US95|Road|ScenicDrive|Runway|Taxiway)/i;

function seeded(seed = 0x51cc17) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function makeInstanced(name, geometry, material, records, parent) {
  if (!records.length) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, records.length);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const dummy = new THREE.Object3D();
  records.forEach((record, index) => {
    dummy.position.copy(record.position);
    dummy.rotation.set(record.rx || 0, record.ry || 0, record.rz || 0);
    dummy.scale.copy(record.scale);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);
  return mesh;
}

function worldFrame(object) {
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  object.getWorldPosition(position);
  object.getWorldScale(scale);
  object.getWorldQuaternion(quaternion);
  return { object, position, scale, quaternion };
}

function install(root) {
  if (!root || root.userData.fullMapGraphicsInstalled) return;
  root.userData.fullMapGraphicsInstalled = true;

  const graphics = new THREE.Group();
  graphics.name = "FullMapGraphicsRuntime";
  root.add(graphics);

  const random = seeded();
  const buildings = [];
  const roads = [];
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh || object === graphics || object.name.startsWith("FullMap")) return;
    if (BUILDING_PATTERN.test(object.name || "")) buildings.push(worldFrame(object));
    if (!object.isInstancedMesh && ROAD_PATTERN.test(object.name || "")) roads.push(worldFrame(object));
  });

  const box = new THREE.BoxGeometry(1, 1, 1);
  const plane = new THREE.PlaneGeometry(1, 1);
  const cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
  const cone = new THREE.ConeGeometry(0.5, 1, 7);

  const windowMaterials = [
    new THREE.MeshBasicMaterial({ color: 0xffd36b, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: 0x74cfff, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: 0xff5db1, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: 0xb994ff, toneMapped: false }),
  ];
  const windows = windowMaterials.map(() => []);
  const roofs = [];
  const signs = [];

  for (const frame of buildings) {
    if (windows.reduce((sum, list) => sum + list.length, 0) >= PROFILE.windows) break;
    const width = Math.max(3, frame.scale.x);
    const height = Math.max(4, frame.scale.y);
    const depth = Math.max(3, frame.scale.z);
    const tall = height > 12;
    if (!tall) continue;

    const rows = Math.max(2, Math.min(14, Math.floor(height / 6)));
    const cols = Math.max(2, Math.min(9, Math.floor(width / 5)));
    const faceZ = frame.position.z + depth * 0.505;
    for (let row = 1; row <= rows; row += 1) {
      for (let col = 1; col <= cols; col += 1) {
        if (random() < 0.36) continue;
        const x = frame.position.x - width / 2 + (width * col) / (cols + 1);
        const y = frame.position.y - height / 2 + (height * row) / (rows + 1);
        windows[Math.floor(random() * windows.length)].push({
          position: new THREE.Vector3(x, y, faceZ),
          scale: new THREE.Vector3(Math.max(0.45, width / cols * 0.32), Math.max(0.5, height / rows * 0.32), 1),
        });
      }
    }

    if (roofs.length < PROFILE.roof && random() > 0.28) {
      roofs.push({
        position: new THREE.Vector3(frame.position.x, frame.position.y + height / 2 + 0.75, frame.position.z),
        scale: new THREE.Vector3(Math.min(5, width * 0.22), 1.5, Math.min(5, depth * 0.22)),
      });
    }

    if (signs.length < PROFILE.signs && height > 20 && random() > 0.7) {
      signs.push({
        position: new THREE.Vector3(frame.position.x, frame.position.y + Math.min(height * 0.18, 10), faceZ + 0.08),
        scale: new THREE.Vector3(Math.min(9, width * 0.55), Math.min(2.3, height * 0.07), 1),
      });
    }
  }

  windowMaterials.forEach((material, index) => makeInstanced(`FullMapWindows_${index}`, plane, material, windows[index], graphics));
  makeInstanced("FullMapRoofEquipment", box, new THREE.MeshStandardMaterial({ color: 0x303742, roughness: 0.72, metalness: 0.45 }), roofs, graphics);
  makeInstanced("FullMapNeonBillboards", plane, new THREE.MeshBasicMaterial({ color: 0xff39ad, toneMapped: false }), signs, graphics);

  const palms = [];
  const palmCrowns = [];
  const barriers = [];
  for (const road of roads) {
    if (palms.length >= PROFILE.palms && barriers.length >= PROFILE.props) break;
    const alongX = road.scale.x >= road.scale.z;
    const length = Math.max(road.scale.x, road.scale.z);
    const width = Math.min(road.scale.x, road.scale.z);
    const step = QUALITY === "low" ? 54 : 34;
    for (let offset = -length / 2 + step; offset < length / 2 - step; offset += step) {
      const center = road.position.clone();
      if (alongX) center.x += offset;
      else center.z += offset;
      if (barriers.length < PROFILE.props) {
        for (const side of [-1, 1]) {
          const p = center.clone();
          if (alongX) p.z += side * (width / 2 + 4.2);
          else p.x += side * (width / 2 + 4.2);
          p.y = 0.34;
          barriers.push({ position: p, scale: new THREE.Vector3(1.5, 0.68, 0.34), ry: alongX ? 0 : Math.PI / 2 });
        }
      }
      if (palms.length < PROFILE.palms && random() > 0.48) {
        const p = center.clone();
        if (alongX) p.z += (random() > 0.5 ? 1 : -1) * (width / 2 + 5.5);
        else p.x += (random() > 0.5 ? 1 : -1) * (width / 2 + 5.5);
        p.y = 3.4;
        palms.push({ position: p, scale: new THREE.Vector3(0.65, 6.8, 0.65) });
        palmCrowns.push({ position: p.clone().add(new THREE.Vector3(0, 4.0, 0)), scale: new THREE.Vector3(4.4, 2.1, 4.4) });
      }
    }
  }

  makeInstanced("FullMapRoadsideBarriers", box, new THREE.MeshStandardMaterial({ color: 0xd7d1c5, roughness: 0.88 }), barriers, graphics);
  makeInstanced("FullMapPalmTrunks", cylinder, new THREE.MeshStandardMaterial({ color: 0x6f4b2d, roughness: 0.96 }), palms, graphics);
  makeInstanced("FullMapPalmCrowns", cone, new THREE.MeshStandardMaterial({ color: 0x1f633c, roughness: 0.9 }), palmCrowns, graphics);

  const skylineGlow = new THREE.HemisphereLight(0x5368a8, 0x2d1725, QUALITY === "low" ? 0.16 : 0.28);
  skylineGlow.name = "FullMapSkylineFill";
  graphics.add(skylineGlow);

  root.userData.fullMapGraphics = {
    quality: QUALITY,
    buildingsDressed: buildings.length,
    windowInstances: windows.reduce((sum, list) => sum + list.length, 0),
    roadsideProps: barriers.length,
    palms: palms.length,
  };
  window.dispatchEvent(new CustomEvent("sin-city:full-map-graphics-ready", { detail: root.userData.fullMapGraphics }));
}

const originalAdd = THREE.Object3D.prototype.add;
if (!THREE.Object3D.prototype.__sinCityFullMapGraphicsPatched) {
  Object.defineProperty(THREE.Object3D.prototype, "__sinCityFullMapGraphicsPatched", { value: true });
  THREE.Object3D.prototype.add = function patchedAdd(...objects) {
    const result = originalAdd.apply(this, objects);
    for (const object of objects) {
      if (object?.name === "SinCityRPWorld") queueMicrotask(() => install(object));
    }
    return result;
  };
}
