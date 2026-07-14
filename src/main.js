import * as THREE from "three";
import { createWorld } from "./world.js";
import {
  createPlayer,
  createNpc,
  createVehicle,
  createPlane,
  createPickup,
  createBulletTracer,
} from "./entities.js";
import {
  GAME_CONFIG,
  ROLE_CONFIG,
  WEAPONS,
  PICKUP_TYPES,
  NPC_PROFILES,
  VEHICLE_TYPES,
  MISSIONS,
  createSeededRng,
} from "./gameData.js";
import { AudioBus } from "./audio.js";
import { createCrowdAudioSystem } from "./crowdAudio.js";
import {
  createDirectionalSprite,
  updateDirectionalSprite,
} from "./spriteSystem.js";
import { createPersistentMemoryStore } from "./persistentMemory.js";
import { installRealismVisuals } from "./realismVisuals.js";
import { createRealisticEntityVisuals } from "./realisticEntityVisuals.js";
import {
  createImageVoxelAtlasModel,
  hideRenderableMeshes,
} from "./imageVoxelModel.js";
import { createTouristCrowd } from "./touristCrowd.js";
import { installCinematicEnvironment } from "./cinematicEnvironment.js";
import {
  npcLanguageActions,
  DEFAULT_APPROVED_ITEM_SPECS,
} from "./npcLanguageActions.js";
import {
  advanceNpcRelationship,
  createNpcRelationship,
  getNpcLoyaltyMeter,
  sanitizeNpcRelationship,
} from "./npcRelationship.js";
import {
  createBufferedVehicleDynamicsRuntime,
  createVehicleDynamicsState,
  evaluateVehicleNpcImpact,
  serializeVehicleDynamicsState,
} from "./vehicleDynamics.js";
import {
  createEasterEggGameplaySystem,
  DIVINE_INFERNAL_CATALOG,
} from "./easterEggSystems.js";

const byId = (id) => document.getElementById(id);
const dom = {
  canvas: byId("game-canvas"),
  loading: byId("loading-screen"),
  loadProgress: byId("load-progress"),
  loadStatus: byId("load-status"),
  start: byId("start-screen"),
  startButton: byId("start-button"),
  hud: byId("hud"),
  pause: byId("pause-menu"),
  resume: byId("resume-button"),
  restart: byId("restart-button"),
  dialogue: byId("dialogue-panel"),
  casino: byId("casino-panel"),
  zoneName: byId("zone-name"),
  worldTime: byId("world-time"),
  bufferStatus: byId("buffer-status"),
  wanted: byId("wanted"),
  wantedLabel: byId("wanted-label"),
  cash: byId("cash"),
  reputation: byId("reputation"),
  missionTitle: byId("mission-title"),
  missionText: byId("mission-text"),
  missionProgress: byId("mission-progress"),
  minimap: byId("minimap"),
  interactionPrompt: byId("interaction-prompt"),
  promptKey: byId("prompt-key"),
  promptText: byId("prompt-text"),
  crosshair: byId("crosshair"),
  vehicleHud: byId("vehicle-hud"),
  speedValue: byId("speed-value"),
  gearValue: byId("gear-value"),
  vehicleHealth: byId("vehicle-health-fill"),
  healthFill: byId("health-fill"),
  healthValue: byId("health-value"),
  armorFill: byId("armor-fill"),
  armorValue: byId("armor-value"),
  staminaFill: byId("stamina-fill"),
  staminaValue: byId("stamina-value"),
  weaponIcon: byId("weapon-icon"),
  weaponName: byId("weapon-name"),
  ammoCount: byId("ammo-count"),
  inventory: byId("inventory-strip"),
  toastStack: byId("toast-stack"),
  speakerAvatar: byId("speaker-avatar"),
  speakerName: byId("speaker-name"),
  speakerLine: byId("speaker-line"),
  loyaltyMeter: byId("loyalty-meter"),
  loyaltyFill: byId("loyalty-fill"),
  loyaltyTier: byId("loyalty-tier"),
  loyaltyValue: byId("loyalty-value"),
  dialogueHistory: byId("dialogue-history"),
  dialogueOptions: byId("dialogue-options"),
  dialogueComposer: byId("dialogue-composer"),
  dialogueInput: byId("dialogue-input"),
  dialogueMic: byId("dialogue-mic-button"),
  dialogueSend: byId("dialogue-send-button"),
  dialogueVoiceStatus: byId("dialogue-voice-status"),
  chanceNote: byId("chance-note"),
  slotsResult: byId("slots-result"),
  reel1: byId("reel-1"),
  reel2: byId("reel-2"),
  reel3: byId("reel-3"),
  spin: byId("spin-button"),
  slotsGame: byId("slots-game"),
  blackjackGame: byId("blackjack-game"),
  dealerCards: byId("dealer-cards"),
  playerCards: byId("player-cards"),
  dealerTotal: byId("dealer-total"),
  playerTotal: byId("player-total"),
  blackjackResult: byId("blackjack-result"),
  deal: byId("deal-button"),
  hit: byId("hit-button"),
  stand: byId("stand-button"),
};

const params = new URLSearchParams(window.location.search);
const TEST_MODE = params.has("test");
const TEST_PERSISTENCE = TEST_MODE && params.has("persist");
const PERSISTENCE_ENABLED = !TEST_MODE || TEST_PERSISTENCE;
const FRESH_RUN = params.has("fresh") || (TEST_MODE && !TEST_PERSISTENCE);
const MOBILE_QUALITY = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 720;
const REQUESTED_RENDER_QUALITY = String(params.get("quality") || "").toLowerCase();
const DEVICE_MEMORY_GB = Number(navigator.deviceMemory) || 8;
const DEVICE_CORES = Number(navigator.hardwareConcurrency) || 8;
const ADAPTIVE_LOW_POWER = MOBILE_QUALITY || DEVICE_MEMORY_GB <= 4 || DEVICE_CORES <= 4;
const RENDER_QUALITY = ["low", "balanced", "high", "ultra"].includes(REQUESTED_RENDER_QUALITY)
  ? REQUESTED_RENDER_QUALITY
  : ADAPTIVE_LOW_POWER ? "low" : "balanced";
const RENDER_PROFILES = Object.freeze({
  low: Object.freeze({ pixelRatio: 1, antialias: false, shadows: false, shadowMapSize: 512 }),
  balanced: Object.freeze({ pixelRatio: 1.25, antialias: true, shadows: true, shadowMapSize: 1024 }),
  high: Object.freeze({ pixelRatio: 1.5, antialias: true, shadows: true, shadowMapSize: 1536 }),
  ultra: Object.freeze({ pixelRatio: 1.75, antialias: true, shadows: true, shadowMapSize: 2048 }),
});
const RENDER_PROFILE = TEST_MODE ? RENDER_PROFILES.low : RENDER_PROFILES[RENDER_QUALITY];
const SAVE_KEY = "sin-city-rp-memory";
const ACTIVE_SAVE_KEY = TEST_MODE ? `${SAVE_KEY}:test` : SAVE_KEY;
const RECOVERY_SAVE_KEY = `${ACTIVE_SAVE_KEY}:corrupt-backup`;
const LEGACY_SAVE_KEYS = TEST_MODE ? [] : [`sin-city-rp-save-v${GAME_CONFIG.version}`];
const persistence = createPersistentMemoryStore({
  key: ACTIVE_SAVE_KEY,
  legacyKeys: LEGACY_SAVE_KEYS,
  gameVersion: String(GAME_CONFIG.version),
  debounceMs: 320,
  migrate: migrateSavePayload,
  mergeOnSave: false,
});
if (FRESH_RUN) persistence.reset([ACTIVE_SAVE_KEY, ...LEGACY_SAVE_KEYS]);
let bootMemoryLoad = FRESH_RUN ? null : persistence.load(null);
if (bootMemoryLoad?.error) {
  try {
    const damagedSave = localStorage.getItem(ACTIVE_SAVE_KEY);
    if (damagedSave) localStorage.setItem(RECOVERY_SAVE_KEY, damagedSave);
    localStorage.removeItem(ACTIVE_SAVE_KEY);
  } catch {
    // Recovery diagnostics remain available even if browser storage is locked.
  }
}

const rng = createSeededRng(params.get("seed") || GAME_CONFIG.seed);
const audio = new AudioBus();
const FIXED_STEP = GAME_CONFIG.physics.fixedStep;
const tmp = {
  a: new THREE.Vector3(),
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  box: new THREE.Box3(),
  ray: new THREE.Raycaster(),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05050d);
scene.fog = new THREE.FogExp2(0x080817, 0.00062);

const camera = new THREE.PerspectiveCamera(62, 1, 0.08, 4200);
camera.position.set(8, 7, 205);

const renderer = new THREE.WebGLRenderer({
  canvas: dom.canvas,
  antialias: RENDER_PROFILE.antialias,
  powerPreference: "default",
  failIfMajorPerformanceCaveat: false,
  stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, RENDER_PROFILE.pixelRatio));
renderer.shadowMap.enabled = !TEST_MODE && RENDER_PROFILE.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.documentElement.dataset.renderQuality = TEST_MODE ? "test" : RENDER_QUALITY;
let contextRecoveryTimer = null;
dom.canvas.addEventListener("webglcontextlost", (event) => {
  event.preventDefault();
  flushSave("webgl-context-loss");
  input.keys.clear();
  input.fireHeld = false;
  if (state.phase === "playing") state.phase = "paused";
  toast("Graphics context paused. Restoring the city…", "warning");
  window.clearTimeout(contextRecoveryTimer);
  contextRecoveryTimer = window.setTimeout(() => {
    const context = renderer.getContext();
    if (context?.isContextLost?.()) window.location.reload();
  }, 2500);
});
dom.canvas.addEventListener("webglcontextrestored", () => {
  window.clearTimeout(contextRecoveryTimer);
  window.location.reload();
});

scene.add(new THREE.HemisphereLight(0x6f71b7, 0x17101f, 1.12));
const moonLight = new THREE.DirectionalLight(0xb7c8ff, 2.1);
moonLight.position.set(-90, 150, 45);
moonLight.castShadow = true;
moonLight.shadow.mapSize.set(RENDER_PROFILE.shadowMapSize, RENDER_PROFILE.shadowMapSize);
moonLight.shadow.camera.left = -170;
moonLight.shadow.camera.right = 170;
moonLight.shadow.camera.top = 170;
moonLight.shadow.camera.bottom = -170;
scene.add(moonLight);

const tunnelFillLight = new THREE.PointLight(0x54cfff, 0, 34, 1.45);
const tunnelHeadlampTarget = new THREE.Object3D();
const tunnelHeadlamp = new THREE.SpotLight(0xd8edff, 0, 58, Math.PI / 5.2, 0.48, 1.25);
tunnelHeadlamp.target = tunnelHeadlampTarget;
scene.add(tunnelFillLight, tunnelHeadlamp, tunnelHeadlampTarget);

function createStarfield() {
  const count = 850;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = rng.range(300, 760);
    const angle = rng.range(0, Math.PI * 2);
    const elevation = rng.range(0.18, 0.92);
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = 100 + elevation * 390;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xdde9ff, size: 1.25, sizeAttenuation: true, transparent: true, opacity: 0.78 });
  const stars = new THREE.Points(geometry, material);
  stars.name = "NevadaNightSky";
  scene.add(stars);
}

createStarfield();
const world = createWorld(THREE, scene, rng);
const realismWorldPromise = installRealismVisuals(THREE, {
  root: world.root,
  renderer,
  useBump: !TEST_MODE && (RENDER_QUALITY === "high" || RENDER_QUALITY === "ultra"),
}).catch((error) => {
  console.warn("[visuals] Realism material layer retained procedural fallbacks.", error);
  return null;
});
installCinematicEnvironment(THREE, {
  scene,
  world,
  camera,
  quality: RENDER_QUALITY,
  mobile: MOBILE_QUALITY,
  testMode: TEST_MODE,
});
const FORCE_IMAGE_VOXEL_3D_MODE = false;
const realisticVisuals = createRealisticEntityVisuals(THREE, { renderer });
const touristCrowd = createTouristCrowd(THREE, {
  parent: scene,
  camera,
  quality: MOBILE_QUALITY ? "low" : "high",
  renderMode: FORCE_IMAGE_VOXEL_3D_MODE ? "image-voxel-3d" : "sprite-billboard",
  atlasUrl: "/assets/sprites/characters/tourists-complete-4x4-v2-runtime.png",
  anisotropy: MOBILE_QUALITY ? 2 : 8,
});
const crowdAudio = createCrowdAudioSystem({
  zoneResolver: (position) => world.zoneAt(position),
  volume: 0.58,
});
crowdAudio.installGestureUnlock(window);
let crowdAudioUpdateTimer = 0;
const WORLD_TRAVEL_LIMIT = Math.max(438, (world.root.userData.config?.halfExtent || 450) - 18);
const AIR_TRAVEL_LIMIT = WORLD_TRAVEL_LIMIT + 120;
const playerObject = createPlayer(THREE);

// Preserve the original articulated rig as the gameplay/collision proxy while
// replacing its construction-mannequin render with production image-derived bodies.
hideRenderableMeshes(playerObject);
const playerSprite = createDirectionalSprite(THREE, {
  name: "PlayerGeneratedVisual",
  url: "/assets/sprites/characters/player-idle-8dir-v1-runtime.png",
  width: 1.92,
  height: 2.56,
  feetOffset: -0.49,
  forwardAxis: "-Z",
  atlas: {
    columns: 4,
    rows: 2,
    directionTiles: [0, 1, 2, 3, 4, 5, 6, 7],
    uvInset: 0.002,
  },
  alphaTest: 0.16,
  walkDeform: true,
  anisotropy: MOBILE_QUALITY ? 2 : 8,
  depthWrite: true,
  toneMapped: true,
  fallbackColor: 0xff2ca8,
});
playerSprite.userData.weaponRaycastIgnore = true;
playerSprite.visible = !FORCE_IMAGE_VOXEL_3D_MODE;
playerObject.add(playerSprite);
playerObject.userData.generatedVisual = playerSprite;

const PLAYER_DIRECTION_TILES = Object.freeze({
  firstFrame: [0, 2, 4, 6, 8, 10, 12, 14],
  secondFrame: [1, 3, 5, 7, 9, 11, 13, 15],
});

const playerWalkSprite = createDirectionalSprite(THREE, {
  name: "PlayerWalkGeneratedVisual",
  url: "/assets/sprites/characters/player-walk-8dir-2frame-v1-runtime.png",
  width: 1.92,
  height: 2.56,
  feetOffset: -0.49,
  forwardAxis: "-Z",
  atlas: { columns: 4, rows: 4, uvInset: 0.002 },
  animations: {
    walk: {
      tiles: [PLAYER_DIRECTION_TILES.firstFrame, PLAYER_DIRECTION_TILES.secondFrame],
      fps: 8,
      loop: true,
    },
  },
  defaultAnimation: "walk",
  alphaTest: 0.1,
  anisotropy: MOBILE_QUALITY ? 2 : 8,
  depthWrite: true,
  toneMapped: true,
  fallbackColor: 0xff2ca8,
});
playerWalkSprite.visible = false;
playerWalkSprite.userData.weaponRaycastIgnore = true;
playerObject.add(playerWalkSprite);

const playerCombatSprite = createDirectionalSprite(THREE, {
  name: "PlayerCombatGeneratedVisual",
  url: "/assets/sprites/characters/player-combat-8dir-2state-v1.png",
  width: 2.08,
  height: 2.72,
  feetOffset: -0.54,
  forwardAxis: "-Z",
  atlas: { columns: 4, rows: 4, uvInset: 0.002 },
  animations: {
    combat: {
      tiles: [PLAYER_DIRECTION_TILES.firstFrame, PLAYER_DIRECTION_TILES.secondFrame],
      fps: 0,
      loop: false,
    },
  },
  defaultAnimation: "combat",
  playing: false,
  alphaTest: 0.1,
  anisotropy: MOBILE_QUALITY ? 2 : 8,
  depthWrite: true,
  toneMapped: true,
  fallbackColor: 0xff2ca8,
});
playerCombatSprite.visible = false;
playerCombatSprite.userData.weaponRaycastIgnore = true;
playerObject.add(playerCombatSprite);

const playerHeavyCombatSprite = createDirectionalSprite(THREE, {
  name: "PlayerHeavyCombatGeneratedVisual",
  url: "/assets/sprites/characters/player-heavy-combat-8dir-v1-runtime.png",
  width: 2.12,
  height: 2.72,
  feetOffset: -0.54,
  forwardAxis: "-Z",
  atlas: { columns: 4, rows: 4, uvInset: 0.002 },
  animations: {
    smg: { startTile: 0, frames: 1, fps: 0, loop: true },
    shotgun: { startTile: 8, frames: 1, fps: 0, loop: true },
  },
  defaultAnimation: "smg",
  playing: false,
  alphaTest: 0.1,
  anisotropy: MOBILE_QUALITY ? 2 : 8,
  depthWrite: true,
  toneMapped: true,
  fallbackColor: 0xff2ca8,
});
playerHeavyCombatSprite.visible = false;
playerHeavyCombatSprite.userData.weaponRaycastIgnore = true;
playerObject.add(playerHeavyCombatSprite);

const PLAYER_IMAGE_VOXEL_COMMON = Object.freeze({
  width: 1.92,
  height: 2.56,
  feetOffset: -0.49,
  anisotropy: MOBILE_QUALITY ? 2 : 8,
  sampleWidth: MOBILE_QUALITY ? 18 : 24,
  sampleHeight: MOBILE_QUALITY ? 30 : 38,
});
const createPlayerImageVoxel = (name, options) => {
  const visual = createImageVoxelAtlasModel(THREE, {
    ...PLAYER_IMAGE_VOXEL_COMMON,
    ...options,
    name,
    depth: options.depth ?? 0.24,
    visible: false,
  });
  playerObject.add(visual);
  return visual;
};
const playerImageVoxelIdle = createPlayerImageVoxel("PlayerIdle", {
  url: "/assets/sprites/characters/player-idle-8dir-v1-runtime.png",
  columns: 4,
  rows: 2,
});
const playerImageVoxelWalk = createPlayerImageVoxel("PlayerWalk", {
  url: "/assets/sprites/characters/player-walk-8dir-2frame-v1-runtime.png",
  columns: 4,
  rows: 4,
});
const playerImageVoxelCombat = createPlayerImageVoxel("PlayerCombat", {
  url: "/assets/sprites/characters/player-combat-8dir-2state-v1.png",
  columns: 4,
  rows: 4,
  width: 2.08,
  height: 2.72,
  feetOffset: -0.54,
  depth: 0.26,
});
const playerImageVoxelHeavyCombat = createPlayerImageVoxel("PlayerHeavyCombat", {
  url: "/assets/sprites/characters/player-heavy-combat-8dir-v1-runtime.png",
  columns: 4,
  rows: 4,
  width: 2.12,
  height: 2.72,
  feetOffset: -0.54,
  depth: 0.28,
});
const playerActionVisual = createPlayerImageVoxel("PlayerReloadAction", {
  url: "/assets/sprites/characters/player-actions-realistic-4x4-v2-runtime.png",
  columns: 4,
  rows: 4,
  tile: 6,
  depth: 0.24,
});
scene.add(playerObject);

const vehicles = [];
const npcs = [];
const pickups = [];
const effects = [];
const input = { keys: new Set(), fireHeld: false, pointerLocked: false, touchX: 0, touchY: 0, touchAscend: false, touchDescend: false };

const STORY_STEPS = Object.freeze([
  { title: "BORROWED WHEELS", text: "Find a vehicle and press F to take the wheel.", event: "enterVehicle" },
  { title: "WELCOME TO THE AURELIA", text: "Drive to the gold casino marker and step onto the floor.", event: "enterCasino" },
  { title: "SILVER TONGUE", text: "Talk to a local. Persuade them or make a discreet offer.", event: "socialSuccess" },
  { title: "BELOW THE NEON", text: "Follow the west wash ramp into the storm-drain tunnels.", event: "enterTunnel" },
  { title: "WHAT VEGAS HIDES", text: "Recover three random items in the tunnels.", event: "tunnelPickup", target: 3 },
  { title: "DESERT SKIES", text: "Reach Sin City Air and fly the Desert Skipper.", event: "flyPlane" },
  { title: "THE OCCUPATION", text: "Follow Las Vegas Boulevard north and break through the takeover checkpoint.", event: "enterOccupation" },
  { title: "NELLIS BLACKOUT", text: "Reach Nellis Air Force Base and contact the remaining flight-line resistance.", event: "enterNellis" },
  { title: "GROOM LAKE SIGNAL", text: "Cross the Mojave and infiltrate Area 51 beneath the hovering craft.", event: "enterArea51" },
  { title: "THE CITY IS YOURS", text: "Free roam unlocked. Build reputation, gamble, or test the law.", event: "freeRoam" },
]);

const state = {
  phase: "loading",
  role: "drifter",
  elapsed: 0,
  accumulator: 0,
  frame: 0,
  buffer: 100,
  cameraYaw: 0,
  cameraPitch: 0.28,
  player: {
    health: GAME_CONFIG.player.startHealth,
    armor: GAME_CONFIG.player.startArmor,
    stamina: 100,
    cash: GAME_CONFIG.player.startCash,
    chips: GAME_CONFIG.player.startCasinoChips,
    reputation: 0,
    heat: 0,
    wanted: 0,
    weapon: "pistol",
    unlockedWeapons: new Set(["unarmed", "pistol"]),
    ammo: { pistol: { magazine: WEAPONS.pistol.magazineSize, reserve: WEAPONS.pistol.reserveAmmo }, smg: { magazine: 0, reserve: 0 }, shotgun: { magazine: 0, reserve: 0 }, taser: { magazine: 0, reserve: 0 }, goldenPistol: { magazine: 0, reserve: 0 } },
    inventory: { lockpicks: 0, collectibles: 0, contraband: 0, fuel: 0, dynamicItems: [] },
    inVehicle: null,
    fireCooldown: 0,
    reloadTimer: 0,
    lastCrimeTime: -999,
    arrestProgress: 0,
    arrested: false,
    arrestPhase: "free",
    arrestTimer: 0,
    arrestCopId: null,
    zone: "strip",
  },
  mission: { index: 0, progress: 0 },
  nearby: null,
  dialogueNpc: null,
  lockedTarget: null,
  casinoBet: 25,
  blackjack: null,
  lastToast: "",
  lastToastTime: 0,
  lastCrimeToastTime: -999,
  lastArrestToastTime: -999,
  screenShake: 0,
  gunFeel: { pitchKick: 0, yawKick: 0, hitConfirm: 0 },
  sfx: { nextFootstepAt: 0, nextSirenAt: 0, nextTireAt: 0 },
  memory: {
    sessionStarted: false,
    hydrated: false,
    dirty: false,
    lastReason: "boot",
    loadDiagnostics: null,
    discoveredZones: new Set(["strip"]),
    conversations: Object.create(null),
    npcMinds: Object.create(null),
  },
};
let lastModalFocus = null;
const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition || null;
const dialogueRuntime = {
  recognition: null,
  listening: false,
  submittedFinalTranscript: false,
  lastInput: "",
  lastIntent: null,
  lastSource: null,
  lastVoiceError: null,
  pendingPlayerText: null,
  pendingLanguageResult: null,
  pendingLanguageNpcId: null,
  activeDealNpcId: null,
  lastLanguageError: null,
};

const APPROVED_ITEM_SPEC_BY_ID = new Map(DEFAULT_APPROVED_ITEM_SPECS.map((spec) => [spec.id, spec]));

persistence.subscribe((event) => {
  if (event.type === "saved") state.memory.dirty = false;
});

const SPAWN_TYPE_MAP = Object.freeze({
  sedan: "sedan",
  sports_car: "sports",
  taxi: "taxi",
  limousine: "limousine",
  motorcycle: "streetMotorcycle",
  streetMotorcycle: "streetMotorcycle",
  dirtBike: "dirtBike",
  bicycle: "bicycle",
  atv: "atv",
  duneBuggy: "duneBuggy",
  offroadPickup: "offroadPickup",
  offroadSuv: "offroadSuv",
  police_cruiser: "policeCruiser",
  police_suv: "policeSuv",
  utility_van: "utilityVan",
  airport_shuttle: "airportShuttle",
});

const NPC_TYPE_MAP = Object.freeze({
  cop: "patrolOfficer",
  casino_security: "security",
  dealer: "casinoDealer",
  high_roller: "highRoller",
  street_performer: "tourist",
  pilot: "local",
  mechanic: "mechanic",
  drain_scout: "tunnelRunner",
  tunnel_squatter: "tunnelRunner",
  smuggler: "local",
  reptilian_pig_cop: "pigEnforcer",
  reptilian_marshal: "reptilianMarshal",
  nellis_guard: "nellisGuard",
  alien_infiltrator: "alienObserver",
  area51_scientist: "area51Scientist",
});

const PICKUP_TYPE_MAP = Object.freeze({
  casino_chip: "casinoChips",
  cash_roll: "cash",
  first_aid: "medkit",
  ammo_box: "ammo",
  armor_vest: "armor",
  weapon_case: "weaponCrate",
  lockpick_set: "lockpick",
  fuel_can: "fuel",
  neon_token: "collectible",
  contraband: "contraband",
});

function applySpawn(object, spawn) {
  object.position.set(spawn.position.x, spawn.position.y, spawn.position.z);
  object.rotation.set(spawn.rotation?.x || 0, spawn.rotation?.y || 0, spawn.rotation?.z || 0);
  return object;
}

function applyVehicleDamageVisual(object, visuals) {
  object.userData.damageVisuals = { ...visuals };
  const material = object.userData.realisticVisual?.userData?.material;
  if (material?.color) {
    const wear = THREE.MathUtils.clamp(visuals.dentStrength || 0, 0, 1);
    material.color.setRGB(1, 1 - wear * 0.24, 1 - wear * 0.3);
  }
  if (material) material.needsUpdate = true;
}

function createRoadVehicleDynamics(object, initialState = null) {
  const type = object.userData.vehicleType;
  const runtime = createBufferedVehicleDynamicsRuntime({
    wheelRadiusM: VEHICLE_TYPES[type]?.wheel?.radius ?? 0.34,
    initialState,
  });
  runtime.applyToObject(object, { onDamageVisual: applyVehicleDamageVisual });
  return runtime;
}

function restorePersistedRoadVehicle(entry) {
  const type = SPAWN_TYPE_MAP[entry.vehicleType] || (VEHICLE_TYPES[entry.vehicleType] ? entry.vehicleType : null);
  if (!type) return null;
  const object = createVehicle(THREE, type, Number.isFinite(entry.paintColor) ? entry.paintColor : undefined);
  object.userData.memoryId = String(entry.id || `vehicle:owned:${type}:${vehicles.length}`);
  realisticVisuals.attachVehicle(object, type);
  scene.add(object);
  const spawn = {
    type,
    variant: "persistent_npc_delivery",
    position: cleanMemoryPosition(entry.position, { x: 0, y: 0.55, z: 0 }),
    rotation: entry.rotation || { x: 0, y: 0, z: 0 },
  };
  const record = {
    object,
    kind: "car",
    spawn,
    basePosition: new THREE.Vector3(spawn.position.x, spawn.position.y, spawn.position.z),
    memoryId: object.userData.memoryId,
    index: vehicles.length,
    dynamic: true,
    dynamics: createRoadVehicleDynamics(object, entry.dynamics),
    npcImpactCooldowns: new Map(),
    previousPositionForImpact: object.position.clone(),
    doorCloseAt: 0,
    damageFxAt: 0,
  };
  vehicles.push(record);
  return record;
}

function restorePersistedPickup(entry) {
  const kind = PICKUP_TYPES[entry?.kind] ? entry.kind : "collectible";
  const object = createPickup(THREE, kind);
  const memoryId = String(entry?.id || `pickup:persistent:${kind}:${pickups.length}`);
  object.userData.memoryId = memoryId;
  if (entry?.label) object.userData.label = String(entry.label).slice(0, 60);
  const position = cleanMemoryPosition(entry?.position, { x: 0, y: 0.25, z: 0 });
  object.position.set(position.x, position.y, position.z);
  object.rotation.y = finiteMemoryNumber(entry?.rotationY, 0);
  realisticVisuals.attachPickup(object, kind);
  scene.add(object);
  const record = {
    id: object.userData.entityId,
    object,
    kind,
    sourceItemId: String(entry?.sourceItemId || kind),
    requestedLabel: entry?.requestedLabel ? String(entry.requestedLabel).slice(0, 60) : null,
    memoryId,
    index: pickups.length,
    collected: false,
    baseY: finiteMemoryNumber(entry?.baseY, position.y),
    respawnAt: 0,
    dynamic: true,
    persistentDynamic: true,
    oneShot: true,
  };
  pickups.push(record);
  return record;
}

function restorePersistedNpc(entry) {
  if (!entry?.dynamic || !entry?.persistentDynamic || entry?.specialKind) return null;
  const fallback = NPC_PROFILES[entry.profileId] || NPC_PROFILES.local;
  const profile = {
    ...fallback,
    id: String(entry.profileId || `companion-${npcs.length}`).slice(0, 80),
    label: String(entry.profileLabel || fallback.label || "Strip companion").slice(0, 80),
    occupation: String(entry.occupation || fallback.occupation || "Strip local").slice(0, 80),
  };
  const object = createNpc(THREE, profile, Boolean(entry.isCop));
  const memoryId = String(entry.id || `npc:persistent:${profile.id}:${npcs.length}`);
  object.userData.memoryId = memoryId;
  const position = cleanMemoryPosition(entry.position, { x: 0, y: 0.42, z: 0 });
  object.position.set(position.x, position.y, position.z);
  object.rotation.y = finiteMemoryNumber(entry.rotationY, 0);
  realisticVisuals.attachNpc(object, profile.id);
  scene.add(object);
  const record = {
    id: object.userData.entityId,
    object,
    profile,
    isCop: Boolean(entry.isCop),
    home: object.position.clone(),
    baseRotation: object.rotation.clone(),
    goal: object.position.clone(),
    thinkTimer: 1,
    shotTimer: 0,
    interacted: false,
    talkRewarded: false,
    persuasionResolved: false,
    bribeResolved: false,
    dead: false,
    dynamic: true,
    persistentDynamic: true,
    dynamicKind: String(entry.dynamicKind || "companion"),
    index: npcs.length,
    memoryId,
  };
  npcs.push(record);
  return record;
}

function spawnEntities() {
  for (const [index, spawn] of world.vehicleSpawns.entries()) {
    const memoryId = `vehicle:${spawn.type}:${spawn.variant || "default"}:${index}`;
    if (spawn.type === "private_jet" || spawn.type === "plane" || spawn.type === "helicopter") {
      const object = applySpawn(createPlane(THREE), spawn);
      if (spawn.type === "helicopter") {
        object.name = "Helicopter_MetroAir";
        object.userData.type = "helicopter";
        object.userData.vehicleType = "helicopter";
      }
      realisticVisuals.attachVehicle(object, spawn.type);
      object.userData.memoryId = memoryId;
      scene.add(object);
      vehicles.push({ object, kind: "plane", spawn, basePosition: object.position.clone(), memoryId, index });
      continue;
    }
    const type = SPAWN_TYPE_MAP[spawn.type] || (VEHICLE_TYPES[spawn.type] ? spawn.type : "sedan");
    const config = VEHICLE_TYPES[type] || VEHICLE_TYPES.sedan;
    const color = rng.pick(config.colors || [0x525865]);
    const object = applySpawn(createVehicle(THREE, type, color), spawn);
    realisticVisuals.attachVehicle(object, spawn.type || type);
    object.userData.heading = object.rotation.y;
    object.userData.memoryId = memoryId;
    scene.add(object);
    const record = {
      object,
      kind: "car",
      spawn,
      basePosition: object.position.clone(),
      memoryId,
      index,
      dynamics: createRoadVehicleDynamics(object),
      npcImpactCooldowns: new Map(),
      previousPositionForImpact: object.position.clone(),
      doorCloseAt: 0,
      damageFxAt: 0,
    };
    vehicles.push(record);
  }

  for (const [index, spawn] of world.npcSpawns.entries()) {
    let profileId = NPC_TYPE_MAP[spawn.type] || (NPC_PROFILES[spawn.type] ? spawn.type : null);
    if (spawn.type === "civilian") profileId = spawn.role === "local" ? "local" : "tourist";
    const profile = NPC_PROFILES[profileId] || NPC_PROFILES.local;
    const isCop = Boolean(profile.isCop || spawn.type === "cop");
    const object = applySpawn(createNpc(THREE, profile, isCop), spawn);
    realisticVisuals.attachNpc(object, profile.id, spawn.type);
    const legacyMemoryId = `npc:${spawn.type}:${spawn.role || profile.id}:${index}`;
    const memoryId = spawn.memoryId
      || (spawn.variant ? `npc:${spawn.type}:${spawn.variant}` : legacyMemoryId);
    const memoryAliases = [...new Set([
      legacyMemoryId,
      ...(Array.isArray(spawn.legacyMemoryIds) ? spawn.legacyMemoryIds : []),
    ])].filter((id) => id && id !== memoryId);
    object.userData.memoryId = memoryId;
    scene.add(object);
    npcs.push({
      id: object.userData.entityId,
      memoryId,
      memoryAliases,
      object,
      profile,
      isCop,
      home: object.position.clone(),
      baseRotation: object.rotation.clone(),
      goal: object.position.clone().add(new THREE.Vector3(rng.range(-8, 8), 0, rng.range(-8, 8))),
      thinkTimer: rng.range(1, 4),
      shotTimer: rng.range(0.2, 1),
      interacted: false,
      talkRewarded: false,
      persuasionResolved: false,
      bribeResolved: false,
      dead: false,
      index,
      relationship: createNpcRelationship({
        loyalty: 0,
        trust: object.userData.trust ?? profile.trust ?? 0,
        fear: object.userData.fear ?? 0,
        reputation: 0,
      }),
    });
  }

  for (const [index, spawn] of world.pickupSpawns.entries()) {
    const kind = PICKUP_TYPE_MAP[spawn.type] || (PICKUP_TYPES[spawn.type] ? spawn.type : "cash");
    const object = applySpawn(createPickup(THREE, kind), spawn);
    if (spawn.variant === "golden_pistol_relic") {
      object.userData.label = "Golden Pistol Relic";
      object.userData.lootTable = ["goldenPistol"];
      object.userData.respawnSeconds = 21_600;
    }
    realisticVisuals.attachPickup(object, kind);
    const memoryId = `pickup:${spawn.type}:${spawn.variant || kind}:${index}`;
    object.userData.baseY = object.position.y;
    object.userData.memoryId = memoryId;
    scene.add(object);
    pickups.push({ object, kind, collected: false, baseY: object.position.y, respawnAt: 0, memoryId, index });
  }
}

spawnEntities();

function addEasterEggAura(object, kind) {
  if (kind === "jesus") {
    const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xffe79c, transparent: true, opacity: 0.92, toneMapped: false });
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.055, 10, 36), haloMaterial);
    halo.name = "JesusHalo";
    halo.position.y = 2.55;
    halo.rotation.x = Math.PI / 2;
    object.add(halo);
    const light = new THREE.PointLight(0xffdd94, 8, 16, 2);
    light.position.y = 2.1;
    object.add(light);
    object.userData.aura = { halo, light, baseIntensity: 8 };
  } else {
    const auraColor = kind === "devil" ? 0xff283f : 0xb323ff;
    const light = new THREE.PointLight(auraColor, kind === "devil" ? 10 : 5, 18, 2);
    light.position.y = 1.4;
    object.add(light);
    object.userData.aura = { light, baseIntensity: kind === "devil" ? 10 : 5 };
  }
}

const SUPERNATURAL_SPRITES = Object.freeze({
  jesus: "/assets/sprites/easter-eggs/jesus-healer-8dir-v1-runtime.png",
  devil: "/assets/sprites/easter-eggs/devil-antagonist-8dir-v1-runtime.png",
  demon: "/assets/sprites/easter-eggs/demon-minion-8dir-v1-runtime.png",
});
const supernaturalTextureLoader = new THREE.TextureLoader();
const SUPERNATURAL_PROJECTILE_URLS = Object.freeze({
  divineLight: "/assets/sprites/easter-eggs/divine-light-projectile-v1-runtime.png",
  soulTaker: "/assets/sprites/easter-eggs/soul-taker-projectile-v1-runtime.png",
  goldenPistol: "/assets/sprites/easter-eggs/golden-pistol-v1-runtime.png",
});
const SUPERNATURAL_PROJECTILE_TEXTURES = Object.fromEntries(Object.entries(SUPERNATURAL_PROJECTILE_URLS).map(([id, url]) => [id, supernaturalTextureLoader.load(url, (texture) => {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
})]));

function attachSupernaturalSprite(object, kind) {
  hideRenderableMeshes(object);
  const sprite = createDirectionalSprite(THREE, {
    name: `Supernatural_${kind}`,
    url: SUPERNATURAL_SPRITES[kind],
    width: kind === "demon" ? 1.82 : 1.98,
    height: kind === "demon" ? 2.62 : 2.78,
    feetOffset: -0.08,
    forwardAxis: "-Z",
    atlas: { columns: 4, rows: 2, directionTiles: [0, 1, 2, 3, 4, 5, 6, 7], uvInset: 0.002 },
    alphaTest: 0.08,
    anisotropy: MOBILE_QUALITY ? 2 : 8,
    depthWrite: true,
    toneMapped: true,
    fallbackColor: kind === "jesus" ? 0xffdf8b : kind === "devil" ? 0xff2747 : 0xb33cff,
  });
  sprite.visible = !FORCE_IMAGE_VOXEL_3D_MODE;
  object.add(sprite);
  object.userData.supernaturalSprite = sprite;
  if (FORCE_IMAGE_VOXEL_3D_MODE) {
    const voxel = createImageVoxelAtlasModel(THREE, {
      name: `Supernatural_${kind}`,
      url: SUPERNATURAL_SPRITES[kind],
      columns: 4,
      rows: 2,
      width: kind === "demon" ? 1.82 : 1.98,
      height: kind === "demon" ? 2.62 : 2.78,
      depth: kind === "demon" ? 0.24 : 0.28,
      feetOffset: -0.08,
      sampleWidth: MOBILE_QUALITY ? 18 : 24,
      sampleHeight: MOBILE_QUALITY ? 32 : 40,
      anisotropy: MOBILE_QUALITY ? 2 : 8,
    });
    object.add(voxel);
    object.userData.supernaturalImageVoxel = voxel;
    return voxel;
  }
  return sprite;
}

function spawnEasterEggNpc(kind, position, suffix = "1") {
  const catalog = DIVINE_INFERNAL_CATALOG.characters[kind];
  const base = NPC_PROFILES.local;
  const profile = {
    ...base,
    id: `${kind}-${suffix}`,
    label: catalog.label,
    occupation: kind === "jesus" ? "Divine wanderer" : kind === "devil" ? "Infernal dealmaker" : "Released entity",
    faction: catalog.faction,
    trust: kind === "jesus" ? 70 : -80,
    dialogue: kind === "jesus"
      ? ["Light exposes what Vegas hides.", "The golden pistol answers only to a worthy hand."]
      : kind === "devil"
        ? ["Every neon promise has a price.", "The tunnels remember every bargain."]
        : ["The light tore me loose.", "I can still hear the fire below."],
  };
  const object = createNpc(THREE, profile, false);
  object.position.copy(position);
  object.userData.health = catalog.maxHealth;
  object.userData.maxHealth = catalog.maxHealth;
  object.userData.specialKind = kind;
  object.userData.aiState = kind === "jesus" ? "divine_guardian" : kind === "devil" ? "infernal_mastermind" : "demon_hunter";
  const memoryId = `easter:${kind}:${suffix}`;
  object.userData.memoryId = memoryId;
  attachSupernaturalSprite(object, kind);
  addEasterEggAura(object, kind);
  scene.add(object);
  const record = {
    id: memoryId,
    memoryId,
    memoryAliases: [],
    object,
    profile,
    isCop: false,
    specialKind: kind,
    home: object.position.clone(),
    baseRotation: object.rotation.clone(),
    goal: object.position.clone(),
    thinkTimer: 0,
    shotTimer: kind === "devil" ? 2.5 : 1.2,
    interacted: false,
    talkRewarded: false,
    persuasionResolved: false,
    bribeResolved: false,
    dead: false,
    index: npcs.length,
    relationship: createNpcRelationship({ loyalty: 0, trust: profile.trust, fear: 0, reputation: 0 }),
  };
  npcs.push(record);
  return record;
}

const jesusNpc = spawnEasterEggNpc("jesus", new THREE.Vector3(-46, 0.42, -354), "fremont");
const devilNpc = spawnEasterEggNpc("devil", new THREE.Vector3(36, -17.4, 248), "wash");
spawnEasterEggNpc("demon", new THREE.Vector3(25, -17.4, 235), "wash-guard");
spawnEasterEggNpc("demon", new THREE.Vector3(-31, 0.42, -350), "fremont-shadow");

function createLiveEasterEggSystem() {
  return createEasterEggGameplaySystem({
    seed: `${params.get("seed") || GAME_CONFIG.seed}:divine-infernal`,
    approvedDivineWielderIds: [playerObject.userData.entityId],
    entities: [
      { id: playerObject.userData.entityId, kind: "npc", ageBand: "adult", health: state.player.health, maxHealth: GAME_CONFIG.player.maxHealth },
      ...npcs.map((npc) => ({
        id: npc.memoryId || npc.id,
        kind: npc.specialKind || "npc",
        ageBand: npc.specialKind ? "ageless" : "adult",
        health: npc.object.userData.health,
        maxHealth: npc.object.userData.maxHealth,
        corruption: npc.object.userData.corruption || 0,
        possessedByDemon: Boolean(npc.object.userData.possessedByDemon),
        alignment: npc.object.userData.alignment,
        alive: !npc.dead,
      })),
    ],
  });
}
let easterEggs = createLiveEasterEggSystem();
const easterEggRuntime = { lastUiEventId: null, releasedDemons: 0 };

const waypointGroup = new THREE.Group();
waypointGroup.name = "ActiveLeadWaypoint";
const waypointMaterial = new THREE.MeshBasicMaterial({ color: 0xffcf4a, transparent: true, opacity: 0.9, depthTest: false, depthWrite: false });
const waypointBeamMaterial = new THREE.MeshBasicMaterial({ color: 0xffcf4a, transparent: true, opacity: 0.13, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const waypointRing = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.09, 8, 28), waypointMaterial);
waypointRing.rotation.x = Math.PI / 2;
waypointRing.position.y = 2.8;
waypointRing.renderOrder = 20;
const waypointArrow = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 8), waypointMaterial);
waypointArrow.rotation.x = Math.PI;
waypointArrow.position.y = 4.1;
waypointArrow.renderOrder = 20;
const waypointBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.75, 12, 12, 1, true), waypointBeamMaterial);
waypointBeam.position.y = 6;
waypointBeam.renderOrder = 19;
waypointGroup.add(waypointRing, waypointArrow, waypointBeam);
scene.add(waypointGroup);

function resize() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

function roleIdFromUi(value) {
  if (value === "highroller") return "highRoller";
  return ROLE_CONFIG[value] ? value : "drifter";
}

function resetPlayer(roleId = "drifter", keepProgress = false) {
  const role = ROLE_CONFIG[roleId] || ROLE_CONFIG.drifter;
  state.role = role.id;
  state.player.health = GAME_CONFIG.player.startHealth;
  state.player.armor = GAME_CONFIG.player.startArmor;
  state.player.stamina = 100;
  state.player.cash = role.starting.cash;
  state.player.chips = role.starting.chips;
  state.player.reputation = keepProgress ? state.player.reputation : 0;
  state.player.heat = 0;
  state.player.wanted = 0;
  state.player.inVehicle = null;
  state.player.fireCooldown = 0;
  state.player.reloadTimer = 0;
  state.player.lastCrimeTime = -999;
  state.player.arrestProgress = 0;
  state.player.arrested = false;
  state.player.arrestPhase = "free";
  state.player.arrestTimer = 0;
  state.player.arrestCopId = null;
  playerObject.rotation.z = 0;
  playerObject.userData.arrested = false;
  if (playerObject.userData.arrestCuffs) playerObject.userData.arrestCuffs.visible = false;
  state.lastArrestToastTime = -999;
  state.player.weapon = role.starting.weapon;
  state.player.unlockedWeapons = new Set(["unarmed", "pistol", role.starting.weapon]);
  state.player.ammo = {
    pistol: { magazine: WEAPONS.pistol.magazineSize, reserve: WEAPONS.pistol.reserveAmmo },
    smg: { magazine: role.starting.weapon === "smg" ? WEAPONS.smg.magazineSize : 0, reserve: role.starting.weapon === "smg" ? WEAPONS.smg.reserveAmmo : 0 },
    shotgun: { magazine: 0, reserve: 0 },
    taser: { magazine: 0, reserve: 0 },
    goldenPistol: { magazine: 0, reserve: 0 },
  };
  state.player.inventory = { lockpicks: 0, collectibles: 0, contraband: 0, fuel: 0, dynamicItems: [] };
  state.mission = { index: 0, progress: 0 };
  playerObject.position.copy(world.locations.spawn.position);
  playerObject.position.y = 0.42;
  playerObject.rotation.set(0, 0, 0);
  playerObject.userData.velocity?.set(0, 0, 0);
  playerObject.userData.movementMode = "onFoot";
  playerObject.userData.activeVehicleId = null;
  state.player.zone = world.zoneAt(playerObject.position) || "strip";
  state.cameraYaw = 0;
  playerObject.visible = true;
  playerObject.userData.walking = false;
  if (playerActionVisual) playerActionVisual.visible = false;
  playerImageVoxelIdle.visible = FORCE_IMAGE_VOXEL_3D_MODE;
  playerImageVoxelWalk.visible = false;
  playerImageVoxelCombat.visible = false;
  playerImageVoxelHeavyCombat.visible = false;
  playerWalkSprite.visible = false;
  playerCombatSprite.visible = false;
  playerHeavyCombatSprite.visible = false;
  playerSprite.visible = !FORCE_IMAGE_VOXEL_3D_MODE;
  playerSprite.spriteController?.setLocomotion({ stride: 0, movement: 0 });
  for (const vehicle of vehicles) {
    vehicle.object.position.copy(vehicle.basePosition);
    vehicle.object.rotation.set(vehicle.spawn.rotation?.x || 0, vehicle.spawn.rotation?.y || 0, vehicle.spawn.rotation?.z || 0);
    vehicle.object.visible = true;
    vehicle.object.userData.occupied = false;
    vehicle.object.userData.driverEntityId = null;
    vehicle.object.userData.speed = 0;
    vehicle.object.userData.speedKph = 0;
    vehicle.object.userData.health = vehicle.object.userData.maxHealth;
    vehicle.object.userData.fuel = vehicle.object.userData.maxFuel;
    vehicle.object.userData.airborne = false;
    vehicle.object.userData.grounded = true;
    vehicle.object.userData.throttle = 0;
    vehicle.object.userData.engineOn = false;
    if (vehicle.dynamics) {
      const wheelRadiusM = VEHICLE_TYPES[vehicle.object.userData.vehicleType]?.wheel?.radius ?? 0.34;
      vehicle.dynamics.setState(createVehicleDynamicsState({ wheelRadiusM }));
      vehicle.dynamics.applyToObject(vehicle.object, { onDamageVisual: applyVehicleDamageVisual });
      vehicle.npcImpactCooldowns?.clear();
      vehicle.previousPositionForImpact?.copy(vehicle.object.position);
      vehicle.doorCloseAt = 0;
    }
  }
}

function resetSimulationEntities() {
  for (let index = vehicles.length - 1; index >= 0; index -= 1) {
    const vehicle = vehicles[index];
    if (!vehicle.dynamic) continue;
    realisticVisuals.detach(vehicle.object, { restoreProcedural: false });
    scene.remove(vehicle.object);
    vehicles.splice(index, 1);
  }
  for (let index = npcs.length - 1; index >= 0; index -= 1) {
    const npc = npcs[index];
    if (npc.dynamic) {
      realisticVisuals.detach(npc.object, { restoreProcedural: false });
      scene.remove(npc.object);
      npcs.splice(index, 1);
      continue;
    }
    npc.dead = false;
    npc.interacted = false;
    npc.talkRewarded = false;
    npc.persuasionResolved = false;
    npc.bribeResolved = false;
    npc.errand = null;
    npc.lastDeal = null;
    npc.vehicleImpact = null;
    npc.object.visible = true;
    npc.object.position.copy(npc.home);
    npc.object.rotation.copy(npc.baseRotation);
    npc.object.userData.health = npc.object.userData.maxHealth;
    npc.object.userData.armor = npc.profile.armor || 0;
    npc.object.userData.trust = npc.profile.trust ?? 35;
    syncNpcRelationship(npc, createNpcRelationship({
      loyalty: 0,
      trust: npc.profile.trust ?? 35,
      fear: 0,
      reputation: 0,
    }));
    npc.object.userData.aiState = npc.isCop ? "patrol" : "wander";
    npc.object.userData.lastBondReason = "";
    npc.object.userData.corruption = 0;
    npc.object.userData.possessedByDemon = false;
    npc.object.userData.alignment = npc.specialKind === "jesus" ? 100 : npc.specialKind ? -100 : 0;
    npc.object.userData.state = npc.object.userData.aiState;
    npc.goal.copy(npc.home);
    npc.thinkTimer = rng.range(1, 4);
  }
  for (let index = pickups.length - 1; index >= 0; index -= 1) {
    const pickup = pickups[index];
    if (pickup.dynamic) {
      scene.remove(pickup.object);
      pickups.splice(index, 1);
      continue;
    }
    pickup.collected = false;
    pickup.respawnAt = 0;
    pickup.object.visible = true;
    pickup.object.position.y = pickup.baseY;
    pickup.object.userData.collected = false;
  }
  while (effects.length) {
    const effect = effects.pop();
    scene.remove(effect);
    if (!effect.isSprite) effect.geometry?.dispose?.();
    effect.material?.dispose();
  }
  state.blackjack = null;
  state.dialogueNpc = null;
  dialogueRuntime.activeDealNpcId = null;
  clearTargetLock();
  state.nearby = null;
  state.screenShake = 0;
  easterEggs = createLiveEasterEggSystem();
  easterEggRuntime.lastUiEventId = null;
  easterEggRuntime.releasedDemons = 0;
  dom.toastStack.replaceChildren();
}

function finiteMemoryNumber(value, fallback = 0, minimum = -Infinity, maximum = Infinity) {
  const number = Number(value);
  return Number.isFinite(number) ? THREE.MathUtils.clamp(number, minimum, maximum) : fallback;
}

function cleanMemoryPosition(value, fallback = null) {
  if (!value || typeof value !== "object") return fallback;
  const x = Number(value.x);
  const y = Number(value.y);
  const z = Number(value.z);
  if (![x, y, z].every(Number.isFinite)) return fallback;
  return {
    x: THREE.MathUtils.clamp(x, -AIR_TRAVEL_LIMIT, AIR_TRAVEL_LIMIT),
    y: THREE.MathUtils.clamp(y, -20, 900),
    z: THREE.MathUtils.clamp(z, -AIR_TRAVEL_LIMIT, AIR_TRAVEL_LIMIT),
  };
}

function sanitizeConversationMemory(value) {
  const output = Object.create(null);
  if (!value || typeof value !== "object") return output;
  for (const [memoryId, turns] of Object.entries(value)) {
    if (!Array.isArray(turns) || typeof memoryId !== "string") continue;
    output[memoryId.slice(0, 120)] = turns.slice(-10).map((turn) => ({
      speaker: turn?.speaker === "player" ? "player" : "npc",
      text: String(turn?.text || "").slice(0, 240),
      intent: String(turn?.intent || "talk").slice(0, 40),
      at: Math.max(0, finiteMemoryNumber(turn?.at, 0)),
    })).filter((turn) => turn.text);
  }
  return output;
}

function relationshipForNpc(npc) {
  if (!npc?.object?.userData) return createNpcRelationship();
  if (!npc.relationship) {
    npc.relationship = createNpcRelationship({
      loyalty: Number.isFinite(npc.object.userData.loyalty) ? npc.object.userData.loyalty : 0,
      trust: finiteMemoryNumber(npc.object.userData.trust, npc.profile?.trust ?? 0, -100, 100),
      fear: finiteMemoryNumber(npc.object.userData.fear, 0, 0, 100),
      reputation: finiteMemoryNumber(state.player.reputation, 0, -100, 100),
      bondedMinutes: finiteMemoryNumber(npc.object.userData.bondSeconds, 0, 0) / 60,
    });
  } else {
    npc.relationship = sanitizeNpcRelationship({
      ...npc.relationship,
      trust: finiteMemoryNumber(npc.object.userData.trust, npc.relationship.trust, -100, 100),
      fear: finiteMemoryNumber(npc.object.userData.fear, npc.relationship.fear, 0, 100),
      reputation: finiteMemoryNumber(state.player.reputation, npc.relationship.reputation, -100, 100),
    });
  }
  return npc.relationship;
}

function syncNpcRelationship(npc, relationship) {
  npc.relationship = sanitizeNpcRelationship(relationship);
  npc.object.userData.loyalty = npc.relationship.loyalty;
  npc.object.userData.trust = npc.relationship.trust;
  npc.object.userData.fear = npc.relationship.fear;
  npc.object.userData.bondSeconds = npc.relationship.bondedMinutes * 60;
  return npc.relationship;
}

function npcLoyaltyValue(npc) {
  return relationshipForNpc(npc).loyalty;
}

function npcLoyaltyTier(value) {
  return getNpcLoyaltyMeter(value).tierLabel.toUpperCase();
}

function updateDialogueLoyaltyMeter(npc = state.dialogueNpc) {
  if (!npc || !dom.loyaltyFill) return;
  const value = npcLoyaltyValue(npc);
  dom.loyaltyFill.style.width = `${(value + 100) * 0.5}%`;
  dom.loyaltyTier.textContent = npcLoyaltyTier(value);
  dom.loyaltyValue.textContent = String(Math.round(value));
  dom.loyaltyMeter.dataset.tier = npcLoyaltyTier(value).toLowerCase().replace(/\s+/g, "-");
}

function growNpcBond(npc, amount, reason = "shared time") {
  if (!npc?.object?.userData || !Number.isFinite(amount) || amount === 0) return;
  const loweredReason = String(reason).toLowerCase();
  const event = loweredReason.includes("violence") ? "violence"
    : loweredReason.includes("betray") || loweredReason.includes("stole") ? "betrayal"
      : loweredReason.includes("failed") ? "failed_promise"
        : loweredReason.includes("rescue") || loweredReason.includes("save") ? "rescue"
          : loweredReason.includes("completed") ? "completed_favor"
            : loweredReason.includes("promise") || amount >= 6 ? "kept_promise"
              : loweredReason.includes("money") || loweredReason.includes("gift") ? "gift"
                : amount >= 2 ? "shared_activity"
                  : amount < -5 ? "threat"
                    : amount < 0 ? "bribe"
                      : "conversation";
  const next = advanceNpcRelationship(relationshipForNpc(npc), {
    event,
    interactionQuality: THREE.MathUtils.clamp(amount / 10, -1, 1),
    trustDelta: THREE.MathUtils.clamp(amount * 0.12, -12, 8),
    reputationDelta: THREE.MathUtils.clamp(state.player.reputation - relationshipForNpc(npc).reputation, -4, 4),
    elapsedMinutes: 0,
  }, { nowMs: Math.floor(state.elapsed * 1000) });
  syncNpcRelationship(npc, next);
  npc.object.userData.lastBondReason = String(reason).slice(0, 80);
  state.memory.dirty = true;
  updateDialogueLoyaltyMeter(npc);
}

let relationshipTickAccumulator = 0;
function updateNpcRelationships(dt) {
  relationshipTickAccumulator += dt;
  if (relationshipTickAccumulator < 30) return;
  const elapsedSeconds = relationshipTickAccumulator;
  relationshipTickAccumulator = 0;
  const playerPosition = getControlledObject().position;
  for (const npc of npcs) {
    if (npc.dead || !npc.interacted || npc.object.userData.aiState === "flee") continue;
    if (npc.object.position.distanceTo(playerPosition) > 14) continue;
    const previous = relationshipForNpc(npc);
    const next = advanceNpcRelationship(previous, {
      event: "neutral",
      elapsedMinutes: elapsedSeconds / 60,
      reputationDelta: THREE.MathUtils.clamp(state.player.reputation - previous.reputation, -1, 1),
    }, { nowMs: Math.floor(state.elapsed * 1000) });
    if (next.loyalty !== previous.loyalty) {
      syncNpcRelationship(npc, next);
      npc.object.userData.lastBondReason = "time spent together";
      state.memory.dirty = true;
      if (npc === state.dialogueNpc) updateDialogueLoyaltyMeter(npc);
    }
  }
}

function sanitizeNpcMindMemory(value) {
  const output = Object.create(null);
  if (!value || typeof value !== "object") return output;
  for (const [memoryId, mind] of Object.entries(value)) {
    if (!mind || typeof mind !== "object" || typeof memoryId !== "string") continue;
    output[memoryId.slice(0, 120)] = {
      identity: String(mind.identity || "").slice(0, 180),
      traits: Array.isArray(mind.traits) ? mind.traits.map((trait) => String(trait || "").slice(0, 60)).filter(Boolean).slice(0, 4) : [],
      currentGoal: String(mind.currentGoal || "").slice(0, 140),
      relationship: String(mind.relationship || "Strangers with unfinished business.").slice(0, 180),
      summary: String(mind.summary || "").slice(0, 280),
      facts: Array.isArray(mind.facts) ? mind.facts.map((fact) => String(fact || "").slice(0, 180)).filter(Boolean).slice(-12) : [],
      updatedAt: Math.max(0, finiteMemoryNumber(mind.updatedAt, 0)),
    };
  }
  return output;
}

function npcMindFor(npc) {
  if (!npc?.memoryId) return null;
  const existing = state.memory.npcMinds[npc.memoryId];
  if (existing) return existing;
  const traitSets = npc.isCop
    ? [["observant", "procedural", "guarded"], ["tired", "disciplined", "watchful"], ["ambitious", "suspicious", "controlled"]]
    : [["streetwise", "guarded", "curious"], ["practical", "warm", "cautious"], ["restless", "observant", "private"]];
  const signature = [...npc.memoryId].reduce((total, character) => total + character.charCodeAt(0), 0);
  const mind = {
    identity: `${npc.profile.label}, a ${npc.object.userData.occupation || "local"} trying to survive neon Las Vegas.`,
    traits: traitSets[signature % traitSets.length],
    currentGoal: npc.isCop ? "Keep the immediate block stable and assess threats." : "Get through tonight without losing what matters.",
    relationship: "The player is a stranger; trust has not been earned.",
    summary: "No meaningful shared history yet.",
    facts: [],
    updatedAt: state.elapsed,
  };
  state.memory.npcMinds[npc.memoryId] = mind;
  state.memory.dirty = true;
  return mind;
}

function rememberNpcMind(npc, update) {
  const mind = npcMindFor(npc);
  if (!mind || !update) return;
  if (update.summary) mind.summary = String(update.summary).slice(0, 280);
  if (update.currentGoal) mind.currentGoal = String(update.currentGoal).slice(0, 140);
  if (update.relationship) mind.relationship = String(update.relationship).slice(0, 180);
  if (Array.isArray(update.facts)) {
    const newFacts = update.facts.map((fact) => String(fact || "").trim().slice(0, 180)).filter(Boolean);
    mind.facts = [...mind.facts, ...newFacts].filter((fact, index, all) => all.indexOf(fact) === index).slice(-12);
  }
  mind.updatedAt = state.elapsed;
  state.memory.dirty = true;
}

function migrateSavePayload(saved) {
  const source = saved && typeof saved === "object" ? saved : {};
  if (source.format === "sin-city-rp-memory-v2" && source.player) return source;
  if (source.player && source.world) return { ...source, format: "sin-city-rp-memory-v2" };
  return {
    format: "sin-city-rp-memory-v2",
    role: source.role || "drifter",
    elapsed: source.elapsed || 0,
    player: {
      cash: source.cash,
      chips: source.chips,
      reputation: source.reputation,
      health: source.health,
      armor: source.armor,
      stamina: 100,
      heat: source.heat,
      position: source.position,
      zone: source.zone,
      inventory: source.inventory,
      unlockedWeapons: source.unlockedWeapons,
      weapon: source.weapon,
      ammo: source.ammo,
    },
    mission: source.mission,
    world: {
      vehicles: Array.isArray(source.vehicles) ? source.vehicles.map((entry, index) => ({ ...entry, index })) : [],
      pickups: Array.isArray(source.collectedPickups)
        ? source.collectedPickups.map((index) => ({ index: Number(index), collected: true, respawnRemaining: 15 }))
        : [],
      npcs: [],
      discoveredZones: source.zone ? [source.zone] : ["strip"],
    },
    conversations: {},
  };
}

function cloneCasinoMemory(value) {
  if (!value) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return null;
  }
}

function sanitizeDynamicInventoryItems(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const items = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const label = String(entry.label || "Custom item").trim().slice(0, 60);
    const id = String(entry.id || `${label}:${items.length}`).trim().slice(0, 120);
    if (!label || !id || seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      label,
      sourceItemId: String(entry.sourceItemId || "collectible").slice(0, 40),
      acquiredAt: Math.max(0, finiteMemoryNumber(entry.acquiredAt, 0)),
    });
    if (items.length >= 32) break;
  }
  return items;
}

function captureSavePayload() {
  const controlled = getControlledObject();
  const position = cleanMemoryPosition(controlled.position, { x: 0, y: 0.42, z: 0 });
  return {
    format: "sin-city-rp-memory-v2",
    role: state.role,
    elapsed: finiteMemoryNumber(state.elapsed, 0, 0),
    rngState: typeof rng.getState === "function" ? rng.getState() : null,
    player: {
      cash: Math.floor(finiteMemoryNumber(state.player.cash, 0, 0)),
      chips: Math.floor(finiteMemoryNumber(state.player.chips, 0, 0)),
      reputation: Math.floor(finiteMemoryNumber(state.player.reputation, 0)),
      health: finiteMemoryNumber(state.player.health, GAME_CONFIG.player.startHealth, 0, GAME_CONFIG.player.maxHealth),
      armor: finiteMemoryNumber(state.player.armor, 0, 0, GAME_CONFIG.player.maxArmor),
      stamina: finiteMemoryNumber(state.player.stamina, 100, 0, 100),
      heat: finiteMemoryNumber(state.player.heat, 0, 0, GAME_CONFIG.crime.maxHeat),
      lastCrimeTime: finiteMemoryNumber(state.player.lastCrimeTime, -999),
      position,
      rotationY: finiteMemoryNumber(controlled.rotation.y, 0),
      zone: state.player.zone,
      cameraYaw: finiteMemoryNumber(state.cameraYaw, 0),
      cameraPitch: finiteMemoryNumber(state.cameraPitch, 0.28),
      inventory: {
        ...state.player.inventory,
        dynamicItems: sanitizeDynamicInventoryItems(state.player.inventory.dynamicItems),
      },
      unlockedWeapons: [...state.player.unlockedWeapons],
      weapon: state.player.weapon,
      ammo: Object.fromEntries(Object.entries(state.player.ammo).map(([id, ammo]) => [id, {
        magazine: Math.max(0, Math.floor(finiteMemoryNumber(ammo?.magazine, 0))),
        reserve: Math.max(0, Math.floor(finiteMemoryNumber(ammo?.reserve, 0))),
      }])),
      activeVehicleId: state.player.inVehicle?.memoryId || null,
    },
    mission: {
      index: Math.floor(finiteMemoryNumber(state.mission.index, 0, 0, STORY_STEPS.length - 1)),
      progress: finiteMemoryNumber(state.mission.progress, 0, 0),
    },
    world: {
      discoveredZones: [...state.memory.discoveredZones],
      vehicles: vehicles.map((vehicle) => ({
        id: vehicle.memoryId,
        index: vehicle.index,
        dynamic: Boolean(vehicle.dynamic),
        vehicleType: vehicle.object.userData.vehicleType,
        paintColor: Number.isFinite(vehicle.object.userData.paintColor) ? vehicle.object.userData.paintColor : null,
        position: cleanMemoryPosition(vehicle.object.position),
        rotation: {
          x: finiteMemoryNumber(vehicle.object.rotation.x, 0),
          y: finiteMemoryNumber(vehicle.object.rotation.y, 0),
          z: finiteMemoryNumber(vehicle.object.rotation.z, 0),
        },
        health: finiteMemoryNumber(vehicle.object.userData.health, vehicle.object.userData.maxHealth, 0, vehicle.object.userData.maxHealth || 100),
        fuel: finiteMemoryNumber(vehicle.object.userData.fuel, vehicle.object.userData.maxFuel, 0, vehicle.object.userData.maxFuel || 100),
        speed: finiteMemoryNumber(vehicle.object.userData.speed, 0),
        speedKph: finiteMemoryNumber(vehicle.object.userData.speedKph, 0),
        throttle: finiteMemoryNumber(vehicle.object.userData.throttle, 0, -1, 1),
        airborne: Boolean(vehicle.object.userData.airborne),
        grounded: vehicle.object.userData.grounded !== false,
        engineOn: Boolean(vehicle.object.userData.engineOn),
        dynamics: vehicle.dynamics ? serializeVehicleDynamicsState(vehicle.dynamics.getState()) : null,
      })),
      pickups: pickups.filter((pickup) => !pickup.dynamic || (pickup.persistentDynamic && !pickup.collected)).map((pickup) => ({
        id: pickup.memoryId,
        index: pickup.index,
        dynamic: Boolean(pickup.dynamic),
        persistentDynamic: Boolean(pickup.persistentDynamic),
        kind: pickup.kind,
        sourceItemId: pickup.sourceItemId || pickup.kind,
        requestedLabel: pickup.requestedLabel || null,
        label: String(pickup.object.userData.label || npcItemLabel(pickup.kind)).slice(0, 60),
        position: cleanMemoryPosition(pickup.object.position),
        rotationY: finiteMemoryNumber(pickup.object.rotation.y, 0),
        baseY: finiteMemoryNumber(pickup.baseY, pickup.object.position.y),
        collected: Boolean(pickup.collected),
        respawnRemaining: Math.max(0, finiteMemoryNumber(pickup.respawnAt, 0) - state.elapsed),
      })),
      npcs: npcs.filter((npc) => !npc.dynamic || npc.specialKind || npc.persistentDynamic).map((npc) => ({
        id: npc.memoryId,
        index: npc.index,
        profileId: npc.profile.id,
        profileLabel: npc.profile.label,
        occupation: npc.profile.occupation,
        isCop: Boolean(npc.isCop),
        dynamic: Boolean(npc.dynamic),
        persistentDynamic: Boolean(npc.persistentDynamic),
        dynamicKind: npc.dynamicKind || null,
        specialKind: npc.specialKind || null,
        position: cleanMemoryPosition(npc.object.position),
        rotationY: finiteMemoryNumber(npc.object.rotation.y, 0),
        health: finiteMemoryNumber(npc.object.userData.health, npc.object.userData.maxHealth, 0, npc.object.userData.maxHealth || 100),
        armor: finiteMemoryNumber(npc.object.userData.armor, 0, 0),
        trust: finiteMemoryNumber(npc.object.userData.trust, npc.profile.trust ?? 35, -100, 100),
        fear: finiteMemoryNumber(npc.object.userData.fear, 0, 0, 100),
        corruption: finiteMemoryNumber(npc.object.userData.corruption, 0, 0, 100),
        possessedByDemon: Boolean(npc.object.userData.possessedByDemon),
        alignment: finiteMemoryNumber(npc.object.userData.alignment, npc.specialKind === "jesus" ? 100 : npc.specialKind ? -100 : 0, -100, 100),
        loyalty: npcLoyaltyValue(npc),
        bondSeconds: finiteMemoryNumber(npc.object.userData.bondSeconds, 0, 0),
        lastBondReason: String(npc.object.userData.lastBondReason || "").slice(0, 80),
        relationship: sanitizeNpcRelationship(relationshipForNpc(npc)),
        interacted: Boolean(npc.interacted),
        talkRewarded: Boolean(npc.talkRewarded),
        persuasionResolved: Boolean(npc.persuasionResolved),
        bribeResolved: Boolean(npc.bribeResolved),
        dead: Boolean(npc.dead),
        aiState: String(npc.object.userData.aiState || (npc.isCop ? "patrol" : "wander")),
        errand: npc.errand ? JSON.parse(JSON.stringify(npc.errand)) : null,
        lastDeal: npc.lastDeal ? JSON.parse(JSON.stringify(npc.lastDeal)) : null,
      })),
    },
    conversations: sanitizeConversationMemory(state.memory.conversations),
    npcMinds: sanitizeNpcMindMemory(state.memory.npcMinds),
    easterEggs: easterEggs.snapshot(),
    casino: {
      bet: finiteMemoryNumber(state.casinoBet, 25, 1, 10000),
      blackjack: cloneCasinoMemory(state.blackjack),
    },
  };
}

function restoreSavePayload(rawData) {
  const saved = migrateSavePayload(rawData);
  const player = saved.player && typeof saved.player === "object" ? saved.player : {};
  resetPlayer(saved.role || "drifter", true);
  state.elapsed = finiteMemoryNumber(saved.elapsed, 0, 0);
  state.player.cash = finiteMemoryNumber(player.cash, state.player.cash, 0);
  state.player.chips = finiteMemoryNumber(player.chips, state.player.chips, 0);
  state.player.reputation = finiteMemoryNumber(player.reputation, 0);
  state.player.health = finiteMemoryNumber(player.health, state.player.health, 1, GAME_CONFIG.player.maxHealth);
  state.player.armor = finiteMemoryNumber(player.armor, state.player.armor, 0, GAME_CONFIG.player.maxArmor);
  state.player.stamina = finiteMemoryNumber(player.stamina, 100, 0, 100);
  state.player.heat = finiteMemoryNumber(player.heat, 0, 0, GAME_CONFIG.crime.maxHeat);
  state.player.wanted = wantedFromHeat(state.player.heat);
  state.player.lastCrimeTime = finiteMemoryNumber(player.lastCrimeTime, state.player.heat > 0 ? state.elapsed : -999);
  const savedInventory = player.inventory && typeof player.inventory === "object" ? player.inventory : {};
  state.player.inventory = {
    ...state.player.inventory,
    ...savedInventory,
    dynamicItems: sanitizeDynamicInventoryItems(savedInventory.dynamicItems),
  };
  const unlocked = Array.isArray(player.unlockedWeapons) ? player.unlockedWeapons.filter((id) => WEAPONS[id]) : ["unarmed", "pistol"];
  state.player.unlockedWeapons = new Set(["unarmed", "pistol", ...unlocked]);
  if (player.ammo && typeof player.ammo === "object") {
    for (const [weaponId, amount] of Object.entries(player.ammo)) {
      if (!WEAPONS[weaponId] || !amount) continue;
      state.player.ammo[weaponId] = {
        magazine: Math.max(0, Math.floor(finiteMemoryNumber(amount.magazine, 0))),
        reserve: Math.max(0, Math.floor(finiteMemoryNumber(amount.reserve, 0))),
      };
    }
  }
  if (state.player.unlockedWeapons.has(player.weapon) && WEAPONS[player.weapon]) state.player.weapon = player.weapon;
  state.cameraYaw = finiteMemoryNumber(player.cameraYaw, finiteMemoryNumber(player.rotationY, 0));
  state.cameraPitch = finiteMemoryNumber(player.cameraPitch, 0.28, GAME_CONFIG.camera.minPitch, GAME_CONFIG.camera.maxPitch);
  const mission = saved.mission && typeof saved.mission === "object" ? saved.mission : {};
  state.mission = {
    index: Math.floor(finiteMemoryNumber(mission.index, 0, 0, STORY_STEPS.length - 1)),
    progress: finiteMemoryNumber(mission.progress, 0, 0),
  };

  const worldMemory = saved.world && typeof saved.world === "object" ? saved.world : {};
  for (const entry of Array.isArray(worldMemory.vehicles) ? worldMemory.vehicles : []) {
    let vehicle = vehicles.find((candidate) => candidate.memoryId === entry?.id)
      || (!entry?.dynamic ? vehicles[Number(entry?.index)] : null);
    if (!vehicle && entry?.dynamic) vehicle = restorePersistedRoadVehicle(entry);
    if (!vehicle || !entry) continue;
    const position = cleanMemoryPosition(entry.position || entry);
    if (position) vehicle.object.position.set(position.x, position.y, position.z);
    const rotation = entry.rotation || { y: entry.rotationY };
    vehicle.object.rotation.set(
      finiteMemoryNumber(rotation?.x, 0),
      finiteMemoryNumber(rotation?.y, vehicle.object.rotation.y),
      finiteMemoryNumber(rotation?.z, 0),
    );
    vehicle.object.userData.heading = vehicle.object.rotation.y;
    vehicle.object.userData.health = finiteMemoryNumber(entry.health, vehicle.object.userData.health, 0, vehicle.object.userData.maxHealth || 100);
    vehicle.object.userData.fuel = finiteMemoryNumber(entry.fuel, vehicle.object.userData.fuel, 0, vehicle.object.userData.maxFuel || 100);
    vehicle.object.userData.speed = finiteMemoryNumber(entry.speed, 0);
    vehicle.object.userData.speedKph = finiteMemoryNumber(entry.speedKph, 0);
    vehicle.object.userData.throttle = finiteMemoryNumber(entry.throttle, 0, -1, 1);
    vehicle.object.userData.airborne = Boolean(entry.airborne);
    vehicle.object.userData.grounded = entry.grounded !== false;
    vehicle.object.userData.engineOn = Boolean(entry.engineOn);
    if (vehicle.dynamics && entry.dynamics) {
      vehicle.dynamics.setState(entry.dynamics);
      vehicle.dynamics.applyToObject(vehicle.object, { onDamageVisual: applyVehicleDamageVisual });
    }
  }

  for (const entry of Array.isArray(worldMemory.pickups) ? worldMemory.pickups : []) {
    let pickup = pickups.find((candidate) => candidate.memoryId === entry?.id)
      || (!entry?.dynamic ? pickups[Number(entry?.index)] : null);
    if (!pickup && entry?.dynamic && entry?.persistentDynamic) pickup = restorePersistedPickup(entry);
    if (!pickup || !entry) continue;
    const position = cleanMemoryPosition(entry.position);
    if (position) pickup.object.position.set(position.x, position.y, position.z);
    pickup.object.rotation.y = finiteMemoryNumber(entry.rotationY, pickup.object.rotation.y);
    pickup.baseY = finiteMemoryNumber(entry.baseY, pickup.object.position.y);
    pickup.collected = Boolean(entry.collected);
    pickup.object.userData.collected = pickup.collected;
    pickup.object.visible = !pickup.collected;
    pickup.respawnAt = pickup.collected ? state.elapsed + Math.max(0, finiteMemoryNumber(entry.respawnRemaining, 15)) : 0;
  }

  for (const entry of Array.isArray(worldMemory.npcs) ? worldMemory.npcs : []) {
    const exactNpc = npcs.find((candidate) => candidate.memoryId === entry?.id || candidate.memoryAliases?.includes(entry?.id));
    const indexedNpc = npcs[Number(entry?.index)];
    let npc = exactNpc
      || (!entry?.id ? indexedNpc : null)
      || (entry?.profileId && indexedNpc?.profile?.id === entry.profileId ? indexedNpc : null);
    if (!npc && entry?.specialKind && ["jesus", "devil", "demon"].includes(entry.specialKind)) {
      const savedSpecialPosition = cleanMemoryPosition(entry.position, { x: -31, y: 0.42, z: -350 });
      npc = spawnEasterEggNpc(entry.specialKind, new THREE.Vector3(savedSpecialPosition.x, savedSpecialPosition.y, savedSpecialPosition.z), String(entry.id || "restored").split(":").at(-1));
      npc.id = String(entry.id || npc.id);
      npc.memoryId = npc.id;
      npc.object.userData.memoryId = npc.id;
      npc.dynamic = Boolean(entry.dynamic);
    }
    if (!npc && entry?.dynamic && entry?.persistentDynamic) npc = restorePersistedNpc(entry);
    if (!npc || !entry) continue;
    const position = cleanMemoryPosition(entry.position);
    if (position) npc.object.position.set(position.x, position.y, position.z);
    npc.object.rotation.y = finiteMemoryNumber(entry.rotationY, npc.object.rotation.y);
    npc.object.userData.health = finiteMemoryNumber(entry.health, npc.object.userData.health, 0, npc.object.userData.maxHealth || 100);
    npc.object.userData.armor = finiteMemoryNumber(entry.armor, npc.object.userData.armor, 0);
    npc.object.userData.trust = finiteMemoryNumber(entry.trust, npc.profile.trust ?? 35, -100, 100);
    npc.object.userData.fear = finiteMemoryNumber(entry.fear, 0, 0, 100);
    npc.specialKind = entry.specialKind || npc.specialKind || null;
    npc.persistentDynamic = Boolean(entry.persistentDynamic || npc.persistentDynamic);
    npc.dynamicKind = entry.dynamicKind || npc.dynamicKind || null;
    npc.object.userData.specialKind = npc.specialKind;
    npc.object.userData.corruption = finiteMemoryNumber(entry.corruption, 0, 0, 100);
    npc.object.userData.possessedByDemon = Boolean(entry.possessedByDemon);
    npc.object.userData.alignment = finiteMemoryNumber(entry.alignment, npc.specialKind === "jesus" ? 100 : npc.specialKind ? -100 : 0, -100, 100);
    syncNpcRelationship(npc, entry.relationship || {
      loyalty: finiteMemoryNumber(entry.loyalty, 0, -100, 100),
      trust: npc.object.userData.trust,
      fear: npc.object.userData.fear,
      reputation: state.player.reputation,
      bondedMinutes: finiteMemoryNumber(entry.bondSeconds, 0, 0) / 60,
    });
    npc.object.userData.lastBondReason = String(entry.lastBondReason || "").slice(0, 80);
    npc.interacted = Boolean(entry.interacted);
    npc.talkRewarded = Boolean(entry.talkRewarded);
    npc.persuasionResolved = Boolean(entry.persuasionResolved);
    npc.bribeResolved = Boolean(entry.bribeResolved);
    npc.dead = Boolean(entry.dead || npc.object.userData.health <= 0);
    npc.object.visible = !npc.dead;
    npc.object.userData.aiState = npc.dead ? "dead" : String(entry.aiState || (npc.isCop ? "patrol" : "wander"));
    npc.object.userData.state = npc.object.userData.aiState;
    npc.errand = entry.errand && typeof entry.errand === "object" ? { ...entry.errand } : null;
    npc.lastDeal = entry.lastDeal && typeof entry.lastDeal === "object" ? { ...entry.lastDeal } : null;
    easterEggs.registerEntity(easterEntityRecord(npc));
  }

  const savedPosition = cleanMemoryPosition(player.position, {
    x: world.locations.spawn.position.x,
    y: world.locations.spawn.position.y,
    z: world.locations.spawn.position.z,
  });
  const activeVehicle = vehicles.find((vehicle) => vehicle.memoryId === player.activeVehicleId && vehicle.object.userData.health > 0);
  if (activeVehicle) {
    state.player.inVehicle = activeVehicle;
    activeVehicle.object.userData.occupied = true;
    activeVehicle.object.userData.driverEntityId = playerObject.userData.entityId;
    activeVehicle.object.userData.engineOn = true;
    playerObject.visible = false;
  } else {
    playerObject.position.set(savedPosition.x, savedPosition.y, savedPosition.z);
    playerObject.position.x = THREE.MathUtils.clamp(playerObject.position.x, -WORLD_TRAVEL_LIMIT, WORLD_TRAVEL_LIMIT);
    playerObject.position.z = THREE.MathUtils.clamp(playerObject.position.z, -WORLD_TRAVEL_LIMIT, WORLD_TRAVEL_LIMIT);
    if (world.zoneAt(playerObject.position) !== "storm-drains") playerObject.position.y = getGroundHeight(playerObject.position) + 0.42;
    playerObject.rotation.y = finiteMemoryNumber(player.rotationY, 0);
    playerObject.visible = true;
  }
  const controlled = activeVehicle?.object || playerObject;
  state.player.zone = String(player.zone || world.zoneAt(controlled.position) || "strip");
  state.memory.discoveredZones = new Set(Array.isArray(worldMemory.discoveredZones) ? worldMemory.discoveredZones.map(String) : [state.player.zone]);
  state.memory.discoveredZones.add(state.player.zone);
  state.memory.conversations = sanitizeConversationMemory(saved.conversations);
  state.memory.npcMinds = sanitizeNpcMindMemory(saved.npcMinds);
  for (const npc of npcs) {
    if (state.memory.conversations[npc.memoryId]) continue;
    const legacyConversationId = npc.memoryAliases?.find((id) => state.memory.conversations[id]);
    if (!legacyConversationId) continue;
    state.memory.conversations[npc.memoryId] = state.memory.conversations[legacyConversationId];
    delete state.memory.conversations[legacyConversationId];
  }
  state.casinoBet = finiteMemoryNumber(saved.casino?.bet, 25, 1, 10000);
  state.blackjack = cloneCasinoMemory(saved.casino?.blackjack);
  if (Number.isFinite(Number(saved.rngState)) && typeof rng.setState === "function") rng.setState(Number(saved.rngState));
  state.memory.sessionStarted = true;
  state.memory.hydrated = true;
  state.memory.dirty = false;
  return true;
}

function captureJsonSafeSavePayload() {
  return JSON.parse(JSON.stringify(captureSavePayload(), (_key, value) => {
    if (value === undefined) return null;
    if (typeof value === "number" && !Number.isFinite(value)) return null;
    return value;
  }));
}

function loadSave() {
  if (FRESH_RUN || !PERSISTENCE_ENABLED) return false;
  const loaded = bootMemoryLoad || persistence.load(null);
  bootMemoryLoad = null;
  const diagnostics = persistence.getDiagnostics();
  state.memory.loadDiagnostics = {
    ...diagnostics,
    recovered: Boolean(loaded?.recovered || loaded?.error || diagnostics.recovered),
    error: loaded?.error || diagnostics.error || null,
  };
  if (!loaded?.found || !loaded.data) return false;
  try {
    return restoreSavePayload(loaded.data);
  } catch (error) {
    state.memory.loadDiagnostics = {
      ...state.memory.loadDiagnostics,
      status: "error",
      recovered: true,
      error: { code: "restore-failure", message: String(error?.message || error) },
    };
    return false;
  }
}

function canWriteMemory() {
  return PERSISTENCE_ENABLED
    && state.memory.sessionStarted
    && state.memory.hydrated
    && !["loading", "menu", "restarting"].includes(state.phase);
}

function scheduleSave(reason = "autosave") {
  if (!canWriteMemory()) return false;
  state.memory.dirty = true;
  state.memory.lastReason = reason;
  const result = persistence.schedule(captureJsonSafeSavePayload(), { merge: false });
  return Boolean(result?.ok);
}

function flushSave(reason = "checkpoint") {
  if (!canWriteMemory()) return false;
  state.memory.lastReason = reason;
  const result = persistence.flush(captureJsonSafeSavePayload(), { merge: false });
  if (result?.ok) state.memory.dirty = false;
  return Boolean(result?.ok);
}

function saveGame(reason = "checkpoint") {
  return flushSave(reason);
}

function startGame() {
  audio.unlock();
  void crowdAudio.unlock().catch(() => {});
  const selected = document.querySelector(".role-card.selected")?.dataset.role || "drifter";
  const roleId = roleIdFromUi(selected);
  const resumed = loadSave();
  if (!resumed) {
    resetPlayer(roleId);
    state.memory.discoveredZones = new Set([state.player.zone]);
    state.memory.conversations = Object.create(null);
    state.memory.sessionStarted = true;
    state.memory.hydrated = true;
    state.memory.dirty = true;
  }
  state.phase = "playing";
  crowdAudio.update(getControlledObject().position, state.player.zone);
  crowdAudioUpdateTimer = 0.2;
  if (resumed && state.player.wanted > 0) ensurePoliceResponse();
  dom.start.classList.remove("active");
  dom.start.classList.add("hidden");
  dom.hud.classList.remove("hidden");
  dom.pause.classList.add("hidden");
  const recovered = Boolean(state.memory.loadDiagnostics?.recovered);
  toast(
    resumed
      ? recovered ? "City memory recovered and restored." : "Save restored. Welcome back to Sin City."
      : recovered ? "Damaged save isolated. A safe new memory is active." : "Night shift online. The whole city is open.",
    recovered ? "warning" : "success",
  );
  updateCamera(0, true);
  updateDirectionalSprite(playerSprite, 0, camera, { facingObject: playerObject });
  updateHud(true);
  saveGame(resumed ? "resume" : "new-night");
}

function pauseGame(force) {
  if (!["playing", "paused"].includes(state.phase)) return;
  const shouldPause = force ?? state.phase === "playing";
  state.phase = shouldPause ? "paused" : "playing";
  dom.pause.classList.toggle("hidden", !shouldPause);
  if (shouldPause) {
    lastModalFocus = document.activeElement;
    window.requestAnimationFrame(() => dom.resume.focus());
  } else {
    (lastModalFocus instanceof HTMLElement ? lastModalFocus : dom.canvas).focus?.();
  }
  if (document.pointerLockElement) document.exitPointerLock();
  if (shouldPause) flushSave("pause");
}

function toast(message, tone = "info") {
  if (state.lastToast === message && state.elapsed - state.lastToastTime < 0.7) return;
  state.lastToast = message;
  state.lastToastTime = state.elapsed;
  while (dom.toastStack.children.length >= 3) dom.toastStack.firstElementChild?.remove();
  const node = document.createElement("div");
  node.className = `toast ${tone}`;
  node.textContent = message;
  dom.toastStack.append(node);
  window.setTimeout(() => node.classList.add("leaving"), 2800);
  window.setTimeout(() => node.remove(), 3250);
}

function normalizeAngle(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function lerpAngle(from, to, amount) {
  return from + normalizeAngle(to - from) * amount;
}

function getControlledObject() {
  return state.player.inVehicle?.object || playerObject;
}

function getGroundHeight(position) {
  const value = world.groundHeightAt(position);
  return Number.isFinite(value) ? value : 0;
}

function collidesWithWorld(position, radius = GAME_CONFIG.player.radius) {
  const sample = tmp.a.copy(position);
  sample.y += 0.8;
  for (const box of world.collisionBoxes) {
    if (box.userData?.type === "road" || box.userData?.type === "ramp") continue;
    const expanded = tmp.box.copy(box).expandByScalar(radius);
    if (expanded.containsPoint(sample)) return true;
  }
  return false;
}

function playerOverlapsDynamic(position) {
  if (npcs.some((npc) => !npc.dead && npc.object.visible && npc.object.position.distanceToSquared(position) < 0.72 * 0.72)) return true;
  return vehicles.some((vehicle) => {
    const verticalGap = Math.abs(vehicle.object.position.y - position.y);
    const radius = Math.min(2.4, vehicle.object.userData.collisionRadius || 1.4);
    return verticalGap < 2.4 && vehicle.object.position.distanceToSquared(position) < radius * radius;
  });
}

function updateOnFoot(dt) {
  if (state.player.arrested) {
    updateArrestedPlayer(dt);
    return;
  }
  const forwardInput = THREE.MathUtils.clamp((input.keys.has("KeyW") || input.keys.has("ArrowUp") ? 1 : 0) - (input.keys.has("KeyS") || input.keys.has("ArrowDown") ? 1 : 0) - input.touchY, -1, 1);
  const sideInput = THREE.MathUtils.clamp((input.keys.has("KeyD") ? 1 : 0) - (input.keys.has("KeyA") ? 1 : 0) + input.touchX, -1, 1);
  if (input.keys.has("ArrowLeft")) state.cameraYaw += dt * 1.35;
  if (input.keys.has("ArrowRight")) state.cameraYaw -= dt * 1.35;

  const forward = tmp.a.set(-Math.sin(state.cameraYaw), 0, -Math.cos(state.cameraYaw));
  const right = tmp.b.set(Math.cos(state.cameraYaw), 0, -Math.sin(state.cameraYaw));
  const direction = tmp.c.set(0, 0, 0).addScaledVector(forward, forwardInput).addScaledVector(right, sideInput);
  const moving = direction.lengthSq() > 0.01;
  const touchSprint = input.touchAscend || Math.hypot(input.touchX, input.touchY) > 0.88;
  const sprinting = moving && (input.keys.has("ShiftLeft") || input.keys.has("ShiftRight") || touchSprint) && state.player.stamina > 1;
  const roleBonus = ROLE_CONFIG[state.role]?.bonuses?.stamina || 0;
  const speed = sprinting ? GAME_CONFIG.player.runSpeed * (1 + roleBonus * 0.25) : GAME_CONFIG.player.walkSpeed;
  if (moving) {
    direction.normalize();
    const previous = playerObject.position.clone();
    playerObject.position.addScaledVector(direction, speed * dt);
    playerObject.position.x = THREE.MathUtils.clamp(playerObject.position.x, -WORLD_TRAVEL_LIMIT, WORLD_TRAVEL_LIMIT);
    playerObject.position.z = THREE.MathUtils.clamp(playerObject.position.z, -WORLD_TRAVEL_LIMIT, WORLD_TRAVEL_LIMIT);
    playerObject.position.y = getGroundHeight(playerObject.position) + 0.42;
    if (collidesWithWorld(playerObject.position) || playerOverlapsDynamic(playerObject.position)) playerObject.position.copy(previous);
    const heading = Math.atan2(-direction.x, -direction.z);
    playerObject.rotation.y = lerpAngle(playerObject.rotation.y, heading, 1 - Math.exp(-GAME_CONFIG.player.turnSpeed * dt));
    playerObject.userData.velocity.copy(direction).multiplyScalar(speed);
    animateCharacter(playerObject, state.elapsed * (sprinting ? 12 : 8));
    if (state.elapsed >= state.sfx.nextFootstepAt) {
      audio.play("footstep", {
        start: sprinting ? 115 : 92,
        end: sprinting ? 62 : 54,
        duration: sprinting ? 0.07 : 0.09,
        gain: sprinting ? 0.055 : 0.04,
        throttle: 0,
      });
      state.sfx.nextFootstepAt = state.elapsed + (sprinting ? 0.24 : 0.38);
    }
  } else {
    playerObject.userData.velocity.multiplyScalar(Math.exp(-10 * dt));
    animateCharacter(playerObject, 0, true);
  }
  state.player.stamina = THREE.MathUtils.clamp(state.player.stamina + (sprinting ? -22 : 16) * dt, 0, 100);
}

function updateArrestedPlayer(dt) {
  input.keys.clear();
  playerObject.userData.velocity.set(0, 0, 0);
  state.player.arrestTimer += dt;
  const phase = state.player.arrestPhase;
  if (phase === "takedown") {
    playerObject.rotation.z = THREE.MathUtils.damp(playerObject.rotation.z, -Math.PI * 0.48, 9, dt);
    playerObject.position.y = THREE.MathUtils.damp(playerObject.position.y, getGroundHeight(playerObject.position) + 0.2, 8, dt);
    if (state.player.arrestTimer > 0.55) state.player.arrestPhase = "cuffed";
  } else {
    playerObject.rotation.z = THREE.MathUtils.damp(playerObject.rotation.z, -Math.PI * 0.5, 7, dt);
    playerObject.position.y = getGroundHeight(playerObject.position) + 0.2;
  }
  playerObject.userData.arrested = true;
  if (playerObject.userData.arrestCuffs) {
    playerObject.userData.arrestCuffs.visible = true;
    playerObject.userData.arrestCuffs.rotation.z += dt * 1.2;
  }
}

function animateCharacter(object, cycle, idle = false) {
  const swing = idle ? 0 : Math.sin(cycle) * 0.62;
  const movement = idle ? 0 : 1;
  if (object === playerObject) {
    playerObject.userData.walking = !idle;
    playerSprite.spriteController?.setLocomotion({ stride: swing / 0.62, movement });
  }
  if (!object.parts?.leftLeg) return;
  object.parts.leftLeg.rotation.x = THREE.MathUtils.lerp(object.parts.leftLeg.rotation.x, swing, 0.25);
  object.parts.rightLeg.rotation.x = THREE.MathUtils.lerp(object.parts.rightLeg.rotation.x, -swing, 0.25);
  object.parts.leftArm.rotation.x = THREE.MathUtils.lerp(object.parts.leftArm.rotation.x, -swing * 0.72, 0.25);
  object.parts.rightArm.rotation.x = THREE.MathUtils.lerp(object.parts.rightArm.rotation.x, swing * 0.72, 0.25);
}

function updateCar(vehicle, dt) {
  const data = vehicle.object.userData;
  const performance = vehicle.dynamics?.getState().performance || {
    gripMultiplier: 1,
    steeringMultiplier: 1,
    accelerationMultiplier: 1,
    brakingMultiplier: 1,
    maxSpeedMultiplier: 1,
    steeringPull: 0,
    engineCanRun: true,
    fuelLeakLitersPerSecond: 0,
  };
  const forwardInput = THREE.MathUtils.clamp((input.keys.has("KeyW") || input.keys.has("ArrowUp") ? 1 : 0) - (input.keys.has("KeyS") || input.keys.has("ArrowDown") ? 1 : 0) - input.touchY, -1, 1);
  const rawSteeringInput = (input.keys.has("KeyA") ? 1 : 0) - (input.keys.has("KeyD") ? 1 : 0) - input.touchX;
  const steeringInput = THREE.MathUtils.clamp(rawSteeringInput + performance.steeringPull, -1, 1);
  data.steering = steeringInput;
  const braking = input.keys.has("Space") || input.touchAscend;
  const boost = input.keys.has("ShiftLeft") || input.keys.has("ShiftRight");
  const maxSpeed = data.maxSpeed * performance.maxSpeedMultiplier * (boost ? 1.08 : 1);
  if (forwardInput > 0 && performance.engineCanRun) data.speed += data.acceleration * performance.accelerationMultiplier * dt;
  else if (forwardInput < 0) data.speed -= (data.speed > 1 ? data.brake * performance.brakingMultiplier : data.acceleration * performance.accelerationMultiplier * 0.72) * dt;
  else data.speed *= Math.pow(GAME_CONFIG.vehicle.rollingResistance * (0.985 + performance.gripMultiplier * 0.015), dt * 60);
  if (braking) data.speed *= Math.exp(-5.4 * performance.brakingMultiplier * dt);
  data.speed = THREE.MathUtils.clamp(data.speed, -data.reverseSpeed, maxSpeed);
  const handlingBonus = ROLE_CONFIG[state.role]?.bonuses?.vehicleHandling || 0;
  if (Math.abs(data.speed) > 0.4) {
    const steerScale = Math.min(1, Math.abs(data.speed) / 8) * Math.sign(data.speed);
    data.heading += steeringInput * data.handling * performance.steeringMultiplier * performance.gripMultiplier * (1 + handlingBonus) * steerScale * dt;
  }
  vehicle.object.rotation.y = data.heading;
  const forward = tmp.a.set(-Math.sin(data.heading), 0, -Math.cos(data.heading));
  const previous = vehicle.object.position.clone();
  vehicle.previousPositionForImpact?.copy(previous);
  vehicle.object.position.addScaledVector(forward, data.speed * dt);
  vehicle.object.position.x = THREE.MathUtils.clamp(vehicle.object.position.x, -WORLD_TRAVEL_LIMIT, WORLD_TRAVEL_LIMIT);
  vehicle.object.position.z = THREE.MathUtils.clamp(vehicle.object.position.z, -WORLD_TRAVEL_LIMIT, WORLD_TRAVEL_LIMIT);
  vehicle.object.position.y = getGroundHeight(vehicle.object.position) + (vehicle.spawn.position.y > 0 ? vehicle.spawn.position.y : 0.52);
  const vehicleRadius = Math.min(2.7, data.collisionRadius || 1.5);
  const hitVehicle = vehicles.some((other) => {
    if (other === vehicle || !other.object.visible) return false;
    const otherRadius = Math.min(2.7, other.object.userData.collisionRadius || 1.5);
    const contactRadius = (vehicleRadius + otherRadius) * 0.62;
    return Math.abs(other.object.position.y - vehicle.object.position.y) < 2.8
      && other.object.position.distanceToSquared(vehicle.object.position) < contactRadius * contactRadius;
  });
  if (collidesWithWorld(vehicle.object.position, 0.8) || hitVehicle) {
    vehicle.object.position.copy(previous);
    if (Math.abs(data.speed) > 8) {
      const collision = vehicle.dynamics?.collide({
        relativeSpeedMps: Math.abs(data.speed),
        massKg: data.massKg || 1520,
        zone: data.speed >= 0 ? "front" : "rear",
      });
      if (collision) data.health = Math.min(data.health, data.maxHealth * (1 - collision.state.damage.structural));
      else data.health = Math.max(0, data.health - Math.abs(data.speed) * GAME_CONFIG.vehicle.collisionDamageScale);
      state.screenShake = Math.min(1, Math.abs(data.speed) / 35);
      audio.play("crash", { start: 900, end: 90, duration: 0.32, gain: 0.16, throttle: 0.18 });
      if (collision?.event?.stageChanged) toast(`VEHICLE ${collision.state.damage.externalStage >= 4 ? "WRECKED" : "DAMAGED"} · ${collision.event.zone.toUpperCase()} IMPACT`, "danger");
    }
    data.speed *= -0.16;
  }
  data.speedKph = Math.abs(data.speed) * 3.6;
  data.fuel = Math.max(0, data.fuel - (Math.abs(data.speed / Math.max(1, maxSpeed)) * GAME_CONFIG.vehicle.fuelBurnPerSecond + performance.fuelLeakLitersPerSecond) * dt);
  data.engineOn = data.fuel > 0 && performance.engineCanRun;
  if (data.fuel <= 0) data.speed *= Math.exp(-2 * dt);
  if (!performance.engineCanRun) data.speed *= Math.exp(-3.2 * dt);
  if (Math.abs(data.speed) > 1) audio.play("engine", { start: 45 + Math.abs(data.speed) * 1.3, end: 58 + Math.abs(data.speed) * 1.7 });
  if (Math.abs(data.speed) > 8 && Math.abs(rawSteeringInput) > 0.55 && state.elapsed >= state.sfx.nextTireAt) {
    audio.play("tire", { start: 260, end: 85, duration: 0.16, gain: 0.04, throttle: 0 });
    state.sfx.nextTireAt = state.elapsed + 0.32;
  }
}

function updatePlane(vehicle, dt) {
  const object = vehicle.object;
  const data = object.userData;
  const throttleInput = THREE.MathUtils.clamp((input.keys.has("KeyW") || input.keys.has("ArrowUp") ? 1 : 0) - (input.keys.has("KeyS") || input.keys.has("ArrowDown") ? 1 : 0) - input.touchY, -1, 1);
  data.throttle = THREE.MathUtils.clamp(data.throttle + throttleInput * dt * 0.55, 0, 1);
  const targetSpeed = data.throttle * data.maxSpeed;
  data.speed = THREE.MathUtils.damp(data.speed, targetSpeed, throttleInput < 0 ? 2.2 : 1.35, dt);
  const steering = THREE.MathUtils.clamp((input.keys.has("KeyA") ? 1 : 0) - (input.keys.has("KeyD") ? 1 : 0) - input.touchX, -1, 1);
  const pitch = (input.keys.has("Space") || input.touchAscend ? 1 : 0) - (input.keys.has("KeyC") || input.touchDescend ? 1 : 0);
  const controlScale = 0.36 + data.speed / Math.max(1, data.maxSpeed) * 0.8 + (ROLE_CONFIG[state.role]?.bonuses?.planeControl || 0);
  object.rotation.y += steering * GAME_CONFIG.plane.yawRate * controlScale * dt;
  object.rotation.x = THREE.MathUtils.clamp(object.rotation.x + pitch * GAME_CONFIG.plane.pitchRate * controlScale * dt, -0.32, 0.5);
  object.rotation.z = THREE.MathUtils.damp(object.rotation.z, steering * 0.42, 3.5, dt);
  if (!pitch) object.rotation.x = THREE.MathUtils.damp(object.rotation.x, data.airborne ? 0.035 : 0, 0.8, dt);
  const forward = tmp.a.set(0, 0, -1).applyEuler(object.rotation).normalize();
  const previousPosition = object.position.clone();
  object.position.addScaledVector(forward, data.speed * dt);
  const hitVehicle = vehicles.some((other) => {
    if (other === vehicle || !other.object.visible) return false;
    const contactRadius = 3 + Math.min(2.7, other.object.userData.collisionRadius || 1.5);
    return Math.abs(other.object.position.y - object.position.y) < 3.4
      && other.object.position.distanceToSquared(object.position) < contactRadius * contactRadius;
  });
  if (collidesWithWorld(object.position, 1.45) || hitVehicle) {
    object.position.copy(previousPosition);
    const impact = Math.max(8, Math.abs(data.speed) * 1.8);
    data.health = Math.max(0, data.health - impact);
    data.speed *= 0.22;
    state.screenShake = 1;
    audio.play("crash", { start: 980, end: 38, duration: 0.42, gain: 0.17, throttle: 0.2 });
    toast(`Aircraft impact · hull ${Math.ceil(data.health)}`, "danger");
    if (data.health <= 0) {
      data.airborne = false;
      data.grounded = true;
      hospitalRespawn();
      return;
    }
  }
  const ground = getGroundHeight(object.position) + 0.18;
  if (data.speed > GAME_CONFIG.plane.runwayTakeoffSpeed) object.position.y += (data.speed - GAME_CONFIG.plane.runwayTakeoffSpeed) * 0.013 * dt;
  if (object.position.y <= ground + 0.1) {
    if (previousPosition.y > ground + 1 && Math.abs(forward.y * data.speed) > GAME_CONFIG.plane.landingDamageSpeed) {
      data.health = Math.max(0, data.health - Math.abs(forward.y * data.speed) * 2.4);
      state.screenShake = 0.8;
    }
    object.position.y = ground;
    object.rotation.x = Math.max(0, object.rotation.x);
    data.airborne = false;
    data.grounded = true;
  } else {
    data.airborne = true;
    data.grounded = false;
    if (data.speed < data.stallSpeed) object.position.y -= (data.stallSpeed - data.speed) * 0.055 * dt;
  }
  object.position.y = THREE.MathUtils.clamp(object.position.y, ground, 210);
  object.position.x = THREE.MathUtils.clamp(object.position.x, -AIR_TRAVEL_LIMIT, AIR_TRAVEL_LIMIT);
  object.position.z = THREE.MathUtils.clamp(object.position.z, -AIR_TRAVEL_LIMIT, AIR_TRAVEL_LIMIT);
  data.altitude = Math.max(0, object.position.y - ground);
  data.fuel = Math.max(0, data.fuel - data.throttle * 0.055 * dt);
  data.engineOn = data.fuel > 0 && data.throttle > 0.01;
  if (object.parts?.propeller) object.parts.propeller.rotation.z -= (16 + data.speed) * dt;
  if (data.airborne) missionEvent("flyPlane");
  if (data.engineOn) audio.play("engine", { start: 62 + data.throttle * 38, end: 75 + data.throttle * 45 });
}

function updateControlledVehicle(dt) {
  const vehicle = state.player.inVehicle;
  if (!vehicle) return;
  if (vehicle.kind === "plane") updatePlane(vehicle, dt);
  else updateCar(vehicle, dt);
  playerObject.position.copy(vehicle.object.position);
}

function addVehicleSmoke(vehicle, heavy = false) {
  const material = new THREE.MeshBasicMaterial({
    color: heavy ? 0x161820 : 0x59606b,
    transparent: true,
    opacity: heavy ? 0.58 : 0.38,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(heavy ? 0.34 : 0.24, 8, 6), material);
  const heading = vehicle.object.userData.heading || vehicle.object.rotation.y;
  mesh.position.copy(vehicle.object.position).add(new THREE.Vector3(-Math.sin(heading) * 1.1, 1.05, -Math.cos(heading) * 1.1));
  mesh.userData = { ttl: heavy ? 0.9 : 0.65, maxTtl: heavy ? 0.9 : 0.65, effectKind: "vehicle-smoke", baseScale: 1 };
  scene.add(mesh);
  effects.push(mesh);
}

function updateVehicleDynamicsSystems(dt) {
  for (const vehicle of vehicles) {
    if (vehicle.kind !== "car" || !vehicle.dynamics || !vehicle.object.visible) continue;
    const data = vehicle.object.userData;
    if (vehicle.doorCloseAt > 0 && state.elapsed >= vehicle.doorCloseAt) {
      vehicle.dynamics.commandDoor("driver", false, { vehicleSpeedMps: Math.abs(data.speed) });
      vehicle.doorCloseAt = 0;
    }
    const frame = vehicle.dynamics.step({ speedMps: data.speed, steeringInput: data.steering || 0 }, dt);
    vehicle.dynamics.applyToObject(vehicle.object, { onDamageVisual: applyVehicleDamageVisual });
    data.health = Math.min(data.health, data.maxHealth * (1 - frame.state.damage.structural));
    data.engineOn = data.fuel > 0 && frame.state.performance.engineCanRun && Boolean(data.occupied);
    if (vehicle !== state.player.inVehicle && frame.state.fuelLeakLitersPerSecond > 0) {
      data.fuel = Math.max(0, data.fuel - frame.state.fuelLeakLitersPerSecond * dt);
    }
    const visuals = data.damageVisuals;
    if (visuals?.smoke && state.elapsed >= vehicle.damageFxAt) {
      addVehicleSmoke(vehicle, visuals.heavySmoke);
      if (visuals.sparks && rng.chance(0.36)) addImpactBurst(vehicle.object.position.clone().add(new THREE.Vector3(0, 0.5, 0)), 0xffa338, false);
      vehicle.damageFxAt = state.elapsed + (visuals.heavySmoke ? 0.18 : 0.34);
    }
  }
}

function updateNpcVehicleImpact(npc, dt) {
  const impact = npc.vehicleImpact;
  if (!impact || impact.ttl <= 0) return false;
  impact.ttl -= dt;
  npc.object.position.addScaledVector(impact.velocity, dt);
  impact.velocity.multiplyScalar(Math.exp(-4.6 * dt));
  npc.object.position.y = getGroundHeight(npc.object.position) + 0.25;
  npc.object.rotation.z = THREE.MathUtils.damp(npc.object.rotation.z, impact.ttl > 0.16 ? impact.fallAngle : 0, 7, dt);
  if (impact.ttl <= 0) {
    npc.vehicleImpact = null;
    npc.object.rotation.z = 0;
    npc.object.position.y = getGroundHeight(npc.object.position) + 0.42;
    npc.object.userData.aiState = npc.isCop ? "chase" : "flee";
  }
  return true;
}

function handleVehicleNpcImpacts(vehicle) {
  if (!vehicle || vehicle.kind !== "car") return;
  const speedMps = Math.abs(vehicle.object.userData.speed);
  if (speedMps < 1.5) return;
  const start = vehicle.previousPositionForImpact || vehicle.object.position;
  const end = vehicle.object.position;
  const segment = new THREE.Line3(start, end);
  const closest = new THREE.Vector3();
  const forward = new THREE.Vector3().subVectors(end, start);
  if (forward.lengthSq() < 0.001) forward.set(-Math.sin(vehicle.object.rotation.y), 0, -Math.cos(vehicle.object.rotation.y));
  forward.normalize();
  for (const [id, until] of vehicle.npcImpactCooldowns || []) {
    if (until <= state.elapsed) vehicle.npcImpactCooldowns.delete(id);
  }
  for (const npc of npcs) {
    if (npc.dead || !npc.object.visible || vehicle.npcImpactCooldowns?.has(npc.id)) continue;
    segment.closestPointToPoint(npc.object.position, true, closest);
    const contactRadius = Math.min(2.2, (vehicle.object.userData.collisionRadius || 1.5) * 0.48 + 0.42);
    if (closest.distanceToSquared(npc.object.position) > contactRadius * contactRadius) continue;
    const impact = evaluateVehicleNpcImpact({
      speedMps,
      vehicleMassKg: vehicle.object.userData.massKg || 1520,
      npcHealth: npc.object.userData.health,
      armorFraction: npc.isCop ? 0.18 : 0,
      direction: { x: forward.x, z: forward.z },
    });
    vehicle.npcImpactCooldowns?.set(npc.id, state.elapsed + 1.1);
    if (impact.outcome === "none") continue;
    npc.object.userData.health = Math.max(0, npc.object.userData.health - impact.damage);
    growNpcBond(npc, -Math.min(40, impact.damage * 0.45), "player vehicle violence");
    if (impact.lethal || npc.object.userData.health <= 0) {
      npc.dead = true;
      npc.object.userData.health = 0;
      npc.object.userData.aiState = "down";
      npc.object.rotation.z = Math.PI / 2;
      npc.object.position.y = getGroundHeight(npc.object.position) + 0.25;
      toast(`${npc.profile.label.toUpperCase()} · FATAL VEHICLE IMPACT`, "danger");
    } else {
      npc.vehicleImpact = {
        ttl: impact.shouldRagdoll ? 0.86 : 0.34,
        velocity: new THREE.Vector3(impact.impulse.x, impact.impulse.y, impact.impulse.z),
        fallAngle: impact.shouldRagdoll ? Math.PI * 0.48 : Math.PI * 0.12,
      };
      toast(`${npc.profile.label.toUpperCase()} · ${impact.outcome.toUpperCase()}`, "warning");
    }
    if (impact.reportAsVehicleAssault) addHeat(impact.lethal ? 28 : GAME_CONFIG.crime.heatByOffense.assault, "Vehicle assault witnessed");
    state.screenShake = Math.min(0.75, state.screenShake + speedMps / 60);
  }
}

function updateCamera(dt, snap = false) {
  const controlled = getControlledObject();
  const target = tmp.a.copy(controlled.position);
  const mode = state.player.inVehicle?.kind || "onFoot";
  target.y += mode === "plane" ? 2.4 : mode === "car" ? 1.5 : 1.55;
  if (mode !== "onFoot") state.cameraYaw = THREE.MathUtils.damp(state.cameraYaw, controlled.rotation.y, 2.2, dt);
  const distance = mode === "plane" ? GAME_CONFIG.camera.planeDistance : mode === "car" ? GAME_CONFIG.camera.vehicleDistance : GAME_CONFIG.camera.onFootDistance;
  const cameraYaw = state.cameraYaw + state.gunFeel.yawKick;
  const cameraPitch = THREE.MathUtils.clamp(state.cameraPitch + state.gunFeel.pitchKick, -0.42, 0.9);
  const pitchCos = Math.cos(cameraPitch);
  const desired = tmp.b.set(
    target.x + Math.sin(cameraYaw) * distance * pitchCos,
    target.y + 1.25 + Math.sin(cameraPitch) * distance,
    target.z + Math.cos(cameraYaw) * distance * pitchCos,
  );
  const smooth = snap ? 1 : 1 - Math.exp(-GAME_CONFIG.camera.followSharpness * dt);
  camera.position.lerp(desired, smooth);
  if (state.screenShake > 0.001) {
    camera.position.x += rng.range(-1, 1) * state.screenShake * 0.22;
    camera.position.y += rng.range(-1, 1) * state.screenShake * 0.16;
    state.screenShake *= Math.exp(-8 * dt);
  }
  state.gunFeel.pitchKick = THREE.MathUtils.damp(state.gunFeel.pitchKick, 0, 18, dt);
  state.gunFeel.yawKick = THREE.MathUtils.damp(state.gunFeel.yawKick, 0, 14, dt);
  state.gunFeel.hitConfirm = Math.max(0, state.gunFeel.hitConfirm - dt * 4.6);
  const lookTarget = state.lockedTarget && !state.lockedTarget.dead && !state.player.inVehicle
    ? state.lockedTarget.object.position.clone().add(new THREE.Vector3(0, 1.2, 0))
    : target;
  camera.lookAt(lookTarget);
  const inTunnel = world.zoneAt(controlled.position) === "storm-drains";
  tunnelFillLight.intensity = THREE.MathUtils.damp(tunnelFillLight.intensity, inTunnel ? 24 : 0, 7, dt);
  tunnelHeadlamp.intensity = THREE.MathUtils.damp(tunnelHeadlamp.intensity, inTunnel ? 105 : 0, 7, dt);
  tunnelFillLight.position.copy(controlled.position);
  tunnelFillLight.position.y += 3.2;
  tunnelHeadlamp.position.copy(camera.position);
  camera.getWorldDirection(tmp.c);
  tunnelHeadlampTarget.position.copy(camera.position).addScaledVector(tmp.c, 34);
  tunnelHeadlampTarget.updateMatrixWorld();
}

function missionEvent(type, amount = 1) {
  const step = STORY_STEPS[state.mission.index];
  if (!step || step.event !== type) return;
  if (type === "freeRoam") return;
  state.mission.progress += Number(amount) || 1;
  if (state.mission.progress < (step.target || 1)) {
    toast(`${step.title}: ${state.mission.progress}/${step.target}`, "info");
    return;
  }
  state.player.reputation += 3;
  state.mission.index = Math.min(STORY_STEPS.length - 1, state.mission.index + 1);
  state.mission.progress = 0;
  const next = STORY_STEPS[state.mission.index];
  audio.play("success");
  toast(`New lead — ${next.title}`, "success");
  saveGame();
}

function activeLeadTarget() {
  const index = state.mission.index;
  if (index === 0) {
    return vehicles
      .filter((vehicle) => !vehicle.object.userData.occupied && vehicle.object.userData.health > 0)
      .sort((a, b) => a.object.position.distanceToSquared(playerObject.position) - b.object.position.distanceToSquared(playerObject.position))[0]?.object.position;
  }
  if (index === 1) return world.locations.casino.position;
  if (index === 2) {
    return npcs
      .filter((npc) => !npc.dead && !npc.isCop)
      .sort((a, b) => a.object.position.distanceToSquared(playerObject.position) - b.object.position.distanceToSquared(playerObject.position))[0]?.object.position;
  }
  if (index === 3) return world.locations.tunnelEntrance.position;
  if (index === 4) {
    return pickups
      .filter((pickup) => !pickup.collected && pickup.object.position.y < -4)
      .sort((a, b) => a.object.position.distanceToSquared(playerObject.position) - b.object.position.distanceToSquared(playerObject.position))[0]?.object.position;
  }
  if (index === 5) return vehicles.find((vehicle) => vehicle.kind === "plane")?.object.position || world.locations.airport.position;
  return null;
}

function updateWaypoint() {
  const target = activeLeadTarget();
  waypointGroup.visible = Boolean(target) && !state.player.inVehicle?.object.position.equals(target);
  if (!target || !waypointGroup.visible) return;
  waypointGroup.position.copy(target);
  const floor = getGroundHeight(target);
  waypointGroup.position.y = Math.max(target.y, floor);
  const tunnelLead = state.mission.index === 3 || state.mission.index === 4;
  const color = tunnelLead ? 0x49d9ff : state.mission.index === 5 ? 0xb69cff : 0xffcf4a;
  waypointMaterial.color.setHex(color);
  waypointBeamMaterial.color.setHex(color);
  waypointRing.rotation.z += FIXED_STEP * 0.9;
  waypointArrow.position.y = 4.1 + Math.sin(state.elapsed * 2.4) * 0.3;
}

function findNearestVehicle() {
  let best = null;
  let bestDistance = Infinity;
  for (const vehicle of vehicles) {
    if (vehicle.object.userData.occupied || vehicle.object.userData.health <= 0) continue;
    const distance = playerObject.position.distanceTo(vehicle.object.position);
    const limit = vehicle.kind === "plane" ? 8.5 : GAME_CONFIG.interaction.vehicleEnterDistance;
    if (distance < limit && distance < bestDistance) {
      best = vehicle;
      bestDistance = distance;
    }
  }
  return best;
}

function findSafeVehicleExit(vehicle) {
  const dimensions = vehicle.object.userData.dimensions || { width: 2, length: 4 };
  const playerRadius = GAME_CONFIG.player.radius || 0.42;
  const vehicleRadius = Math.min(2.4, vehicle.object.userData.collisionRadius || 1.4);
  const collisionClearance = vehicleRadius + playerRadius + 0.28;
  const side = Math.max(dimensions.width / 2 + 1.15, collisionClearance);
  const end = Math.max(dimensions.length / 2 + 1.1, collisionClearance);
  const offsets = [
    new THREE.Vector3(side, 0, 0),
    new THREE.Vector3(-side, 0, 0),
    new THREE.Vector3(0, 0, end),
    new THREE.Vector3(0, 0, -end),
  ];
  for (const offset of offsets) {
    const candidate = vehicle.object.position.clone().add(offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), vehicle.object.rotation.y));
    candidate.y = getGroundHeight(candidate) + 0.42;
    const npcBlocked = npcs.some((npc) => !npc.dead && npc.object.position.distanceToSquared(candidate) < 1.1 * 1.1);
    const vehicleBlocked = vehicles.some((other) => {
      if (other === vehicle) return false;
      const otherRadius = Math.min(2.4, other.object.userData.collisionRadius || 1.4);
      return other.object.position.distanceToSquared(candidate) < (otherRadius + playerRadius + 0.18) ** 2;
    });
    if (!collidesWithWorld(candidate) && !npcBlocked && !vehicleBlocked) return candidate;
  }
  return null;
}

function releasePlayerVehicle(vehicle = state.player.inVehicle, position = null) {
  if (vehicle?.object?.userData) {
    vehicle.object.userData.occupied = false;
    vehicle.object.userData.driverEntityId = null;
    vehicle.object.userData.engineOn = false;
    vehicle.object.userData.throttle = 0;
    vehicle.object.userData.steering = 0;
  }
  state.player.inVehicle = null;
  playerObject.visible = true;
  if (position) playerObject.position.copy(position);
  playerObject.userData.velocity?.set(0, 0, 0);
  playerObject.userData.movementMode = "onFoot";
  playerObject.userData.activeVehicleId = null;
  input.touchX = 0;
  input.touchY = 0;
  input.touchAscend = false;
  input.touchDescend = false;
  playerObject.userData.walking = false;
  if (playerActionVisual) playerActionVisual.visible = false;
  playerImageVoxelIdle.visible = FORCE_IMAGE_VOXEL_3D_MODE;
  playerImageVoxelWalk.visible = false;
  playerImageVoxelCombat.visible = false;
  playerImageVoxelHeavyCombat.visible = false;
  playerWalkSprite.visible = false;
  playerCombatSprite.visible = false;
  playerHeavyCombatSprite.visible = false;
  playerSprite.visible = !FORCE_IMAGE_VOXEL_3D_MODE;
  playerSprite.spriteController?.setLocomotion({ stride: 0, movement: 0 });
}

function enterOrExitVehicle() {
  if (state.phase !== "playing") return;
  if (state.player.inVehicle) {
    const vehicle = state.player.inVehicle;
    if (vehicle.kind === "plane" && vehicle.object.userData.airborne && vehicle.object.userData.altitude > 3) {
      toast("Land the aircraft before exiting.", "warning");
      return;
    }
    if (vehicle.kind === "car" && Math.abs(vehicle.object.userData.speed) > GAME_CONFIG.vehicle.exitSpeedLimit) {
      toast("Slow down before exiting.", "warning");
      return;
    }
    const exitPosition = findSafeVehicleExit(vehicle);
    if (!exitPosition) {
      toast("No safe space to exit this vehicle.", "warning");
      return;
    }
    if (vehicle.dynamics) {
      vehicle.dynamics.commandDoor("driver", true, { vehicleSpeedMps: Math.abs(vehicle.object.userData.speed) });
      vehicle.doorCloseAt = state.elapsed + 0.72;
    }
    releasePlayerVehicle(vehicle, exitPosition);
    toast("Back on foot.", "info");
    audio.play("door");
    return;
  }

  const vehicle = findNearestVehicle();
  if (!vehicle) {
    toast("No vehicle within reach.", "warning");
    return;
  }
  if (vehicle.dynamics) {
    vehicle.dynamics.commandDoor("driver", true, { vehicleSpeedMps: Math.abs(vehicle.object.userData.speed) });
    vehicle.doorCloseAt = state.elapsed + 0.5;
  }
  state.player.inVehicle = vehicle;
  vehicle.object.userData.occupied = true;
  vehicle.object.userData.driverEntityId = playerObject.userData.entityId;
  vehicle.object.userData.engineOn = true;
  const storedFuel = state.player.inventory.fuel || 0;
  if (storedFuel > 0) {
    const before = vehicle.object.userData.fuel;
    vehicle.object.userData.fuel = Math.min(vehicle.object.userData.maxFuel, before + storedFuel);
    const used = Math.ceil(vehicle.object.userData.fuel - before);
    state.player.inventory.fuel = Math.max(0, storedFuel - used);
    if (used > 0) toast(`Fuel reserve applied · +${used}`, "success");
  }
  vehicle.object.userData.heading = vehicle.object.rotation.y;
  playerObject.visible = false;
  missionEvent("enterVehicle");
  if (vehicle.kind === "plane") {
    const aircraftLabel = vehicle.object.userData.vehicleType === "helicopter" ? "Metro Air helicopter" : "Desert Skipper";
    toast(`${aircraftLabel}: W/S throttle · A/D steer · SPACE/C pitch`, "success");
  }
  else toast(`${VEHICLE_TYPES[vehicle.object.userData.vehicleType]?.label || "Vehicle"}: engine started`, "success");
  if (vehicle.object.userData.policeVehicle) addHeat(GAME_CONFIG.crime.heatByOffense.vehicleTheft + 9, "Police vehicle theft");
  else if (npcs.some((npc) => !npc.dead && !npc.isCop && npc.object.position.distanceTo(vehicle.object.position) < GAME_CONFIG.crime.witnessRadius * 0.45)) {
    addHeat(GAME_CONFIG.crime.heatByOffense.vehicleTheft * 0.58, "Vehicle theft reported");
  }
  audio.play("door");
  window.setTimeout(() => audio.play("engineStart"), 120);
}

function findNearbyInteraction() {
  const actor = getControlledObject();
  if (state.player.inVehicle) return null;

  if (state.player.zone === "storm-drains") {
    const exitDistance = actor.position.distanceTo(world.locations.tunnelInterior.position);
    if (exitDistance < world.locations.tunnelInterior.radius) return { kind: "tunnelExit", distance: exitDistance, label: "Climb to street level" };
  }

  const casinoDistance = actor.position.distanceTo(world.locations.casino.position);
  if (casinoDistance < 10) return { kind: "casino", distance: casinoDistance, label: "Enter Aurelia Casino" };

  const tunnelDistance = actor.position.distanceTo(world.locations.tunnelEntrance.position);
  if (tunnelDistance < world.locations.tunnelEntrance.radius) return { kind: "tunnel", distance: tunnelDistance, label: "Enter Flood Channel 17" };

  let closestNpc = null;
  let npcDistance = Infinity;
  for (const npc of npcs) {
    if (npc.dead) continue;
    const distance = actor.position.distanceTo(npc.object.position);
    if (distance < GAME_CONFIG.interaction.distance && distance < npcDistance) {
      closestNpc = npc;
      npcDistance = distance;
    }
  }
  if (closestNpc) return { kind: "npc", entity: closestNpc, distance: npcDistance, label: `Talk to ${closestNpc.profile.label}` };

  return null;
}

function interact() {
  if (state.player.arrested) return;
  if (state.phase !== "playing") return;
  const nearby = state.nearby || findNearbyInteraction();
  if (!nearby) {
    toast("Nothing nearby to interact with.", "warning");
    return;
  }
  audio.play("ui");
  if (nearby.kind === "casino") {
    openCasino();
  } else if (nearby.kind === "tunnel") {
    playerObject.position.copy(world.locations.tunnelInterior.position);
    playerObject.position.y = getGroundHeight(playerObject.position) + 0.42;
    state.cameraYaw = -Math.PI / 2;
    playerObject.rotation.y = -Math.PI / 2;
    updateCamera(0, true);
    state.player.zone = "storm-drains";
    missionEvent("enterTunnel");
    toast("Flood Channel 17 — flash-flood risk after storms", "warning");
  } else if (nearby.kind === "tunnelExit") {
    playerObject.position.copy(world.locations.tunnelEntrance.position).add(new THREE.Vector3(12, 0, 0));
    playerObject.position.y = getGroundHeight(playerObject.position) + 0.42;
    state.player.zone = "greater-vegas";
    updateCamera(0, true);
    toast("Street level restored.", "success");
  } else if (nearby.kind === "npc") {
    openDialogue(nearby.entity);
  }
}

function conversationTurnsFor(npc) {
  if (!npc?.memoryId) return [];
  if (!Array.isArray(state.memory.conversations[npc.memoryId])) state.memory.conversations[npc.memoryId] = [];
  return state.memory.conversations[npc.memoryId];
}

function rememberConversation(npc, speaker, text, intent = "talk") {
  const cleanText = String(text || "").trim().slice(0, 240);
  if (!npc?.memoryId || !cleanText) return;
  const turns = conversationTurnsFor(npc);
  turns.push({ speaker: speaker === "player" ? "player" : "npc", text: cleanText, intent, at: Number(state.elapsed.toFixed(2)) });
  if (turns.length > 10) turns.splice(0, turns.length - 10);
  state.memory.dirty = true;
}

function renderConversationMemory(npc) {
  dom.dialogueHistory.replaceChildren();
  for (const turn of conversationTurnsFor(npc).slice(-8)) {
    const row = document.createElement("div");
    row.className = `dialogue-turn ${turn.speaker}`;
    const label = document.createElement("span");
    label.textContent = turn.speaker === "player" ? "YOU" : "THEM";
    const copy = document.createElement("p");
    copy.textContent = turn.text;
    row.append(label, copy);
    dom.dialogueHistory.append(row);
  }
  dom.dialogueHistory.scrollTop = dom.dialogueHistory.scrollHeight;
}

function npcItemLabel(itemId) {
  const approved = APPROVED_ITEM_SPEC_BY_ID.get(itemId);
  return PICKUP_TYPES[itemId]?.label
    || VEHICLE_TYPES[itemId]?.label
    || approved?.aliases?.[0]
    || String(itemId || "item").replace(/([a-z])([A-Z])/g, "$1 $2");
}

function npcTaskItemLabel(task) {
  return String(task?.requestedLabel || npcItemLabel(task?.itemId || task?.itemType)).slice(0, 60);
}

function quotedDealPrice(npc, itemId) {
  const spec = APPROVED_ITEM_SPEC_BY_ID.get(itemId);
  const base = Math.max(50, Math.round(((spec?.maxCashOffer || 1_000) * 0.1) / 25) * 25);
  const trust = finiteMemoryNumber(npc?.object?.userData?.trust, 0, -100, 100);
  const fear = finiteMemoryNumber(npc?.object?.userData?.fear, 0, 0, 100);
  const leverage = THREE.MathUtils.clamp((trust + state.player.reputation * 2 + fear * 0.25) * 0.0025, -0.2, 0.28);
  const wantedRisk = state.player.wanted * 0.08;
  return Math.max(25, Math.round((base * (1 - leverage + wantedRisk)) / 25) * 25);
}

function dealOutcomeFor(npc) {
  const trust = finiteMemoryNumber(npc?.object?.userData?.trust, 0, -100, 100);
  const reliability = trust + state.player.reputation * 1.5 - state.player.wanted * 12;
  if (reliability < -20) return "steal";
  if (reliability < 6) return "fail";
  return "deliver";
}

function renderBaseDialogueOptions(npc) {
  if (!npc || state.dialogueNpc !== npc) return;
  dom.dialogueOptions.replaceChildren();
  const bribeBase = Math.ceil(npc.object.userData.bribeMinimum * (npc.isCop ? 1 + state.player.wanted * 0.35 : 1));
  const bribeEligible = npc.object.userData.canBribe && state.player.wanted <= npc.object.userData.bribeMaxWantedLevel;
  const options = [
    { action: "talk", key: "1", title: "Ask what they know", note: "Local information · no cost" },
    { action: "persuade", key: "2", title: "Persuade", note: npc.persuasionResolved ? "You already made your case tonight" : `${Math.round(persuasionChance(npc) * 100)}% estimated chance`, disabled: npc.persuasionResolved },
    { action: "bribe", key: "3", title: npc.isCop ? `Offer $${bribeBase} discreetly` : `Make it worth $${bribeBase}`, note: npc.bribeResolved ? "This arrangement is already settled" : bribeEligible ? "Immediate leverage · costs cash" : state.player.wanted > npc.object.userData.bribeMaxWantedLevel ? "Your Pig Meter is too hot for this contact" : "This person cannot be bought", disabled: !bribeEligible || npc.bribeResolved },
  ];
  for (const option of options) {
    const button = document.createElement("button");
    button.dataset.action = option.action;
    button.disabled = Boolean(option.disabled);
    button.innerHTML = `<kbd>${option.key}</kbd><span><strong>${option.title}</strong><small>${option.note}</small></span>`;
    button.addEventListener("click", () => resolveDialogue(option.action));
    dom.dialogueOptions.append(button);
  }
  dom.chanceNote.textContent = npc.isCop
    ? "Pig-unit bribes are risky and become harder as your Pig Meter rises."
    : "Persuasion improves with role bonuses, reputation, and earned trust.";
}

function renderDealStatus(message, tone = "") {
  const status = document.createElement("div");
  status.className = `deal-status${tone ? ` ${tone}` : ""}`;
  status.textContent = message;
  dom.dialogueOptions.prepend(status);
}

function clearPendingLanguageDeal() {
  dialogueRuntime.pendingLanguageResult = null;
  dialogueRuntime.pendingLanguageNpcId = null;
}

function renderDealConfirmation(npc, result, { counteroffer = false } = {}) {
  const action = result?.action;
  if (!action?.money || state.dialogueNpc !== npc) return false;
  dialogueRuntime.pendingLanguageResult = result;
  dialogueRuntime.pendingLanguageNpcId = npc.memoryId;
  dialogueRuntime.lastLanguageError = null;
  dom.dialogueOptions.replaceChildren();

  const card = document.createElement("section");
  card.className = "deal-proposal";
  card.setAttribute("aria-label", "NPC deal confirmation");
  const kicker = document.createElement("span");
  kicker.className = "deal-kicker";
  kicker.textContent = counteroffer ? "COUNTEROFFER" : "DEAL PROPOSAL";
  const summary = document.createElement("strong");
  summary.className = "deal-summary";
  summary.textContent = action.task
    ? `${npc.profile.label} · ${npcTaskItemLabel(action.task)}`
    : `${npc.profile.label} · cash transfer`;
  const terms = document.createElement("p");
  terms.className = "deal-terms";
  const timing = action.money.timing === "on_completion" ? "escrowed until delivery" : "paid now";
  const deadline = action.temporal?.token ? ` · due ${action.temporal.token}` : "";
  terms.textContent = `$${action.money.amount.toLocaleString()} · ${timing}${deadline}`;
  const warning = document.createElement("p");
  warning.className = "deal-warning";
  warning.textContent = "No money moves until you confirm. Trust, reputation, heat, and this NPC's history affect the outcome.";
  const actions = document.createElement("div");
  actions.className = "deal-actions";
  const confirm = document.createElement("button");
  confirm.type = "button";
  confirm.className = "deal-confirm";
  confirm.dataset.dealConfirm = "true";
  confirm.textContent = action.money.timing === "on_completion"
    ? `Commit $${action.money.amount.toLocaleString()}`
    : `Give $${action.money.amount.toLocaleString()}`;
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.className = "deal-cancel";
  cancel.dataset.dealCancel = "true";
  cancel.textContent = "Walk away";
  confirm.addEventListener("click", () => confirmPendingLanguageDeal());
  cancel.addEventListener("click", () => {
    rememberConversation(npc, "player", "I am not confirming that deal.", "deal_cancelled");
    rememberConversation(npc, "npc", "Then there is no deal.", "deal_cancelled");
    dom.speakerLine.textContent = "Then there is no deal.";
    clearPendingLanguageDeal();
    renderBaseDialogueOptions(npc);
    renderConversationMemory(npc);
    scheduleSave("npc-deal-cancelled");
  });
  actions.append(confirm, cancel);
  card.append(kicker, summary, terms, warning, actions);
  dom.dialogueOptions.append(card);
  dom.chanceNote.textContent = "Authoritative confirmation required · server-balanced item schema";
  return true;
}

function counterofferFor(npc, action, requiredAmount) {
  const alias = action.task.requestedLabel
    || APPROVED_ITEM_SPEC_BY_ID.get(action.task.itemId)?.aliases?.[0]
    || npcItemLabel(action.task.itemId);
  const deadline = action.temporal?.token ? ` ${action.temporal.token}` : "";
  return npcLanguageActions.parse(`$${requiredAmount} if you bring me a ${alias}${deadline}`, { nowMs: Date.now() });
}

function executeNpcLanguageAction(npc, result) {
  const action = result?.action;
  if (!action || !npcLanguageActions.canExecute(result)) return false;
  const paymentAmount = Math.max(0, Math.floor(action.money?.amount || 0));
  if (paymentAmount > state.player.cash) {
    dom.speakerLine.textContent = `You cannot cover $${paymentAmount.toLocaleString()}.`;
    renderBaseDialogueOptions(npc);
    renderDealStatus("Insufficient cash · deal not executed", "danger");
    audio.play("fail");
    return false;
  }

  if (paymentAmount > 0) state.player.cash -= paymentAmount;
  clearPendingLanguageDeal();
  dialogueRuntime.lastLanguageError = null;

  if (action.task) {
    const outcome = dealOutcomeFor(npc);
    startNpcErrand(npc, {
      type: action.task.type,
      itemType: action.task.itemId,
      requestedLabel: action.task.requestedLabel || null,
      quantity: action.task.quantity,
      requestSummary: action.task.requestSummary,
      deadlineAtMs: action.temporal?.dueAtMs || null,
      deadlineToken: action.temporal?.token || null,
    }, {
      outcome,
      paymentAmount,
      paymentTiming: action.money?.timing || "favor",
      confirmedAtMs: Date.now(),
    });
    dialogueRuntime.activeDealNpcId = npc.memoryId;
    const deadline = action.temporal?.token ? ` by ${action.temporal.token}` : "";
    dom.speakerLine.textContent = outcome === "deliver"
      ? `Deal. I will bring the ${npcTaskItemLabel(action.task)}${deadline}.`
      : "We have a deal. Whether Vegas cooperates is another question.";
    rememberConversation(npc, "player", paymentAmount ? `Confirmed $${paymentAmount} for ${npcTaskItemLabel(action.task)}.` : action.sourceText, "deal_confirmed");
    rememberConversation(npc, "npc", dom.speakerLine.textContent, "deal_confirmed");
    growNpcBond(npc, 4, "kept a deal");
    rememberNpcMind(npc, {
      currentGoal: action.task.requestSummary,
      summary: `Active deal: ${npcTaskItemLabel(action.task)} for $${paymentAmount}.`,
      facts: [`Player confirmed a $${paymentAmount} ${action.money?.timing || "favor"} deal for ${npcTaskItemLabel(action.task)}.`],
    });
    renderBaseDialogueOptions(npc);
    renderDealStatus(`ACTIVE · ${npcTaskItemLabel(action.task)} · $${paymentAmount}${deadline}`, "success");
    audio.play(paymentAmount ? "cash" : "success");
    toast(`Deal confirmed · $${paymentAmount.toLocaleString()} committed`, "success");
  } else if (action.intent === "social_plan") {
    startNpcErrand(npc, {
      type: "bring_companion",
      companionName: "A consenting adult friend",
      requestSummary: action.social.activity,
      deadlineAtMs: action.temporal?.dueAtMs || null,
      deadlineToken: action.temporal?.token || null,
    }, { outcome: "deliver", paymentAmount, paymentTiming: action.money?.timing || "favor", confirmedAtMs: Date.now() });
    dialogueRuntime.activeDealNpcId = npc.memoryId;
    dom.speakerLine.textContent = `I will ask them. If they freely agree, we will meet in public ${action.temporal?.token || "later"}.`;
    rememberConversation(npc, "player", action.sourceText, "social_plan");
    rememberConversation(npc, "npc", dom.speakerLine.textContent, "social_plan");
    growNpcBond(npc, 2, "made plans together");
    renderBaseDialogueOptions(npc);
    renderDealStatus("SOCIAL PLAN · consent required · public meeting", "success");
  } else if (action.intent === "give_money") {
    npc.object.userData.trust = THREE.MathUtils.clamp((npc.object.userData.trust || 0) + Math.min(14, Math.ceil(paymentAmount / 100)), -100, 100);
    dom.speakerLine.textContent = `I received $${paymentAmount.toLocaleString()}. I will remember that.`;
    rememberConversation(npc, "player", `Gave $${paymentAmount.toLocaleString()}.`, "give_money");
    rememberConversation(npc, "npc", dom.speakerLine.textContent, "give_money");
    growNpcBond(npc, Math.min(5, 1 + paymentAmount / 250), "player showed generosity");
    rememberNpcMind(npc, { summary: `The player gave me $${paymentAmount}.`, facts: [`The player gave this NPC $${paymentAmount}.`] });
    renderBaseDialogueOptions(npc);
    renderDealStatus(`TRANSFER COMPLETE · $${paymentAmount.toLocaleString()}`, "success");
    audio.play("cash");
  } else if (action.intent === "time_reference") {
    if (npc.errand) {
      npc.errand.deadlineAtMs = action.temporal?.dueAtMs || null;
      npc.errand.deadlineToken = action.temporal?.token || null;
      dom.speakerLine.textContent = `Understood. I have it marked for ${action.temporal?.token || "later"}.`;
    } else {
      dom.speakerLine.textContent = `I heard ${action.temporal?.token || "that time"}, but we need to agree on the job first.`;
    }
    rememberConversation(npc, "player", action.sourceText, "time_reference");
    rememberConversation(npc, "npc", dom.speakerLine.textContent, "time_reference");
    renderBaseDialogueOptions(npc);
  }

  renderConversationMemory(npc);
  scheduleSave("npc-language-action");
  return true;
}

function confirmPendingLanguageDeal() {
  const npc = state.dialogueNpc;
  const pending = dialogueRuntime.pendingLanguageResult;
  if (!npc || !pending || dialogueRuntime.pendingLanguageNpcId !== npc.memoryId) return false;
  const confirmed = npcLanguageActions.confirm(pending, { confirmed: true, availableCash: state.player.cash });
  if (!confirmed.ok) {
    const message = confirmed.errors?.[0]?.message || "That transfer could not be confirmed.";
    dialogueRuntime.lastLanguageError = confirmed.errors?.[0]?.code || "confirmation_failed";
    dom.speakerLine.textContent = message;
    renderBaseDialogueOptions(npc);
    renderDealStatus(message, "danger");
    audio.play("fail");
    return false;
  }
  return executeNpcLanguageAction(npc, confirmed);
}

function handleNpcLanguageResult(npc, text) {
  const parsed = npcLanguageActions.parse(text, { nowMs: Date.now() });
  if (parsed.status === "no_action") return false;
  dialogueRuntime.lastIntent = parsed.action?.intent || "rejected_action";
  if (!parsed.ok) {
    const entry = parsed.errors?.[0] || { code: "rejected_action", message: "That request cannot become a game action." };
    dialogueRuntime.lastLanguageError = entry.code;
    dom.speakerLine.textContent = entry.message;
    rememberDialogueExchange(npc, "rejected_action", text);
    renderBaseDialogueOptions(npc);
    renderDealStatus(`REQUEST BLOCKED · ${entry.code.replace(/_/g, " ")}`, "danger");
    audio.play("fail");
    return true;
  }

  if (parsed.action?.task && npc.errand) {
    dom.speakerLine.textContent = `I already have an active job: ${npc.errand.summary}`;
    rememberDialogueExchange(npc, "task_busy", text);
    renderBaseDialogueOptions(npc);
    renderDealStatus("NPC BUSY · finish or wait for the current deal", "warning");
    return true;
  }

  if (parsed.action?.task) {
    const requiredAmount = quotedDealPrice(npc, parsed.action.task.itemId);
    const offeredAmount = parsed.action.money?.amount || 0;
    if (!parsed.action.money && npc.object.userData.trust < 60 && state.player.reputation < 20) {
      const counter = counterofferFor(npc, parsed.action, requiredAmount);
      dom.speakerLine.textContent = `That is work. I can do it for $${requiredAmount.toLocaleString()}.`;
      rememberDialogueExchange(npc, "counteroffer", text);
      renderDealConfirmation(npc, counter, { counteroffer: true });
      return true;
    }
    if (parsed.action.money && offeredAmount < Math.ceil(requiredAmount * 0.75)) {
      const counter = counterofferFor(npc, parsed.action, requiredAmount);
      dom.speakerLine.textContent = `$${offeredAmount.toLocaleString()} does not cover it. My price is $${requiredAmount.toLocaleString()}.`;
      rememberDialogueExchange(npc, "counteroffer", text);
      renderDealConfirmation(npc, counter, { counteroffer: true });
      return true;
    }
    if (npc.isCop && state.player.wanted >= 4) {
      dom.speakerLine.textContent = "Not while the whole city is looking for you.";
      rememberDialogueExchange(npc, "deal_rejected", text);
      renderBaseDialogueOptions(npc);
      renderDealStatus("DEAL REJECTED · Pig Meter too high", "danger");
      return true;
    }
  }

  if (parsed.status === "needs_confirmation") {
    dom.speakerLine.textContent = parsed.action.task
      ? `You are offering $${parsed.action.money.amount.toLocaleString()} for ${npcItemLabel(parsed.action.task.itemId)}. Confirm it and I will move.`
      : `Confirm the $${parsed.action.money.amount.toLocaleString()} transfer.`;
    rememberDialogueExchange(npc, "deal_proposed", text);
    renderDealConfirmation(npc, parsed);
    return true;
  }

  return executeNpcLanguageAction(npc, parsed);
}

function rememberDialogueExchange(npc, intent, playerText) {
  const exactPlayerText = dialogueRuntime.pendingPlayerText || playerText;
  dialogueRuntime.pendingPlayerText = null;
  const turns = conversationTurnsFor(npc);
  const recentPlayer = [...turns].reverse().find((turn) => turn.speaker === "player");
  const playerAlreadyRecorded = recentPlayer
    && recentPlayer.text === exactPlayerText
    && state.elapsed - recentPlayer.at < 15;
  if (!playerAlreadyRecorded) rememberConversation(npc, "player", exactPlayerText, intent);
  const latestTurn = conversationTurnsFor(npc).at(-1);
  if (playerAlreadyRecorded && latestTurn?.speaker === "npc" && latestTurn.intent === intent && state.elapsed - latestTurn.at < 15) {
    latestTurn.text = String(dom.speakerLine.textContent || "").slice(0, 240);
    latestTurn.at = Number(state.elapsed.toFixed(2));
  } else {
    rememberConversation(npc, "npc", dom.speakerLine.textContent, intent);
  }
  const bondDelta = {
    talk: 0.8,
    persuade: 1.4,
    deal_proposed: 0.35,
    deal_confirmed: 4,
    give_money: 2.5,
    social_plan: 2,
    bribe: 0.5,
    threaten: -12,
    rejected_action: -0.5,
  }[intent] || 0;
  if (bondDelta) growNpcBond(npc, bondDelta, intent);
  renderConversationMemory(npc);
  scheduleSave(`dialogue-${intent}`);
}

function classifyDialogueInput(text) {
  const normalized = String(text || "").trim().toLowerCase();
  const amountMatch = normalized.match(/(?:\$|offer\s+|pay\s+|give\s+)(\d{1,6})/i);
  const amount = amountMatch ? Math.max(0, Number(amountMatch[1])) : null;
  if (/\b(?:bye|goodbye|leave|later|walk away|never mind)\b/.test(normalized)) return { intent: "leave", amount };
  if (/\b(?:threaten|hurt|kill|or else|make you|regret|intimidate)\b/.test(normalized)) return { intent: "threaten", amount };
  if (amount !== null || /\b(?:bribe|cash|money|offer|pay|deal)\b/.test(normalized)) return { intent: "bribe", amount };
  if (/\b(?:persuade|convince|believe me|trust me|hear me out|please help|work with me)\b/.test(normalized)) return { intent: "persuade", amount };
  return { intent: "talk", amount };
}

const CANONICAL_LORE_QUERY = /\b(?:drain|storm|wash|tunnel|underground|sewer|area\s*51|groom|alien|ufo|extraterrestrial|nellis|air\s*force|airbase|fighter|jet|plane|aircraft|pig|reptilian|occupation|takeover|cop|police|lvmpd|casino|gamble|slots|blackjack|chips|car|truck|bike|motorcycle|offroad|vehicle|drive|gun|weapon|ammo|rifle|pistol|shotgun)\b/i;
const NPC_REFUSAL_REPLY = /\b(?:can(?:not|'t)|won't|not at liberty|classified|divulge|no comment|do not know|don't know)\b/i;

function contextualDialogueReply(npc, text) {
  const normalized = String(text || "").toLowerCase();
  if (/\b(?:drain|storm|wash|tunnel|underground|sewer)\b/.test(normalized)) {
    return npc.profile.id === "tunnelRunner"
      ? "The west wash drops into Flood Channel 17. Keep right at the dry junction; violet light means rare salvage."
      : "People disappear into the concrete wash west of the Strip. Ask a tunnel runner before the rain comes.";
  }
  if (/\b(?:area\s*51|groom|alien|ufo|extraterrestrial)\b/.test(normalized)) {
    return npc.profile.species === "extraterrestrial"
      ? "Groom Lake is not a rumor. The signal beneath the hovering craft is calling every survivor in the valley."
      : "The old Groom Lake road runs northwest. Since the occupation, green lights cross the ridge after midnight.";
  }
  if (/\b(?:nellis|air\s*force|airbase|fighter|jet|plane|aircraft)\b/.test(normalized)) {
    return "Nellis is northeast beyond the city lights. The surviving flight line still has fuel, but the reptilian marshal controls the gate.";
  }
  if (/\b(?:pig|reptilian|occupation|takeover|cop|police|lvmpd)\b/.test(normalized)) {
    return npc.isCop
      ? "Watch the badge. Metro channels are compromised, and the pig enforcers answer to something that did not come from Nevada."
      : "The reptilian pig cops took the northern checkpoints first. Break their line of sight before your Pig Meter reaches the occupation network.";
  }
  if (/\b(?:casino|gamble|slots|blackjack|chips)\b/.test(normalized)) return "The Aurelia pays in chips and secrets. Gold lights mark the casino floor; never wager cash you need for a bribe.";
  if (/\b(?:car|truck|bike|motorcycle|offroad|vehicle|drive)\b/.test(normalized)) return "Street cars are easy to find. Dirt bikes and off-road rigs handle the desert access roads better once the pavement ends.";
  if (/\b(?:gun|weapon|ammo|rifle|pistol|shotgun)\b/.test(normalized)) return "Ammo cases pulse red after dark. Nellis has military crates; the tunnels hide stranger weapons if you can survive the search.";
  const remembered = conversationTurnsFor(npc).some((turn) => turn.speaker === "player");
  if (remembered) return `I remember you. ${rng.pick(npc.profile.dialogue) || "Vegas keeps every promise and every debt."}`;
  return rng.pick(npc.profile.dialogue) || "Vegas always has another angle. Ask me about the tunnels, Nellis, Area 51, or the occupation.";
}

function groundedNpcReply(npc, generatedReply, playerText) {
  const reply = String(generatedReply || "").trim();
  if (!CANONICAL_LORE_QUERY.test(String(playerText || ""))) return reply || contextualDialogueReply(npc, playerText);
  const canon = contextualDialogueReply(npc, playerText);
  if (!reply || NPC_REFUSAL_REPLY.test(reply)) return canon;
  if (reply.toLowerCase().includes(canon.toLowerCase())) return reply.slice(0, 360);
  return `${canon} ${reply}`.slice(0, 360);
}

async function requestNpcIntelligence(npc, text, intent) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 4_500);
  try {
    const response = await fetch("/api/npc-think", {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        npc: {
          id: npc.memoryId,
          name: npc.profile.label,
          occupation: npc.object.userData.occupation,
          isCop: npc.isCop,
          profile: npc.profile.id,
          trust: npc.object.userData.trust,
          fear: npc.object.userData.fear,
        },
        player: { wantedLevel: state.player.wanted, reputation: state.player.reputation, zone: state.player.zone },
        message: text,
        intent,
        canon: CANONICAL_LORE_QUERY.test(text) ? contextualDialogueReply(npc, text) : "",
        history: conversationTurnsFor(npc),
        mind: npcMindFor(npc),
      }),
    });
    const payload = await response.json();
    if (!response.ok || !payload?.turn) throw new Error(payload?.error || "NPC intelligence is unavailable.");
    return payload.turn;
  } finally {
    window.clearTimeout(timeout);
  }
}

function applyNpcIntelligence(npc, turn, intent, playerText) {
  if (state.dialogueNpc !== npc || state.phase !== "dialogue") return;
  npc.object.userData.trust = THREE.MathUtils.clamp((npc.object.userData.trust || 0) + turn.trustDelta, -100, 100);
  npc.object.userData.fear = THREE.MathUtils.clamp((npc.object.userData.fear || 0) + turn.fearDelta, 0, 100);
  npc.object.userData.aiDisposition = turn.disposition;
  rememberNpcMind(npc, turn.memory);
  if (turn.task?.accepted && turn.task.type !== "none" && !npc.errand) startNpcErrand(npc, turn.task);
  const bodyState = {
    patrol: "wander",
    investigate: "investigate",
    approach: "approach",
    retreat: "retreat",
    flee: "flee",
    pursue: "pursue",
    assist: "assist",
  }[turn.bodyAction];
  if (bodyState) {
    npc.object.userData.aiState = bodyState;
    npc.object.userData.aiActionUntil = state.elapsed + (bodyState === "pursue" ? 8 : 5);
    if (["investigate", "approach", "pursue", "assist"].includes(bodyState)) npc.goal.copy(getControlledObject().position);
  }
  dom.speakerLine.textContent = groundedNpcReply(npc, turn.reply, playerText);
  if (turn.suggestedAction === "alert" && npc.isCop) addHeat(2, "Officer called in your behavior");
  if (turn.suggestedAction === "cool_down" && npc.isCop && state.player.heat > 0) setHeat(Math.max(0, state.player.heat - 4));
  if (turn.suggestedAction === "flee" && !npc.isCop) npc.object.userData.aiState = "flee";
  rememberDialogueExchange(npc, intent, playerText);
  scheduleSave("openai-npc-turn");
}

function errandDeparturePoint(npc) {
  const angle = (npc.index * 2.399963) % (Math.PI * 2);
  const point = npc.object.position.clone().add(new THREE.Vector3(Math.cos(angle) * 13, 0, Math.sin(angle) * 13));
  point.x = THREE.MathUtils.clamp(point.x, -WORLD_TRAVEL_LIMIT, WORLD_TRAVEL_LIMIT);
  point.z = THREE.MathUtils.clamp(point.z, -WORLD_TRAVEL_LIMIT, WORLD_TRAVEL_LIMIT);
  point.y = getGroundHeight(point) + 0.42;
  return point;
}

function startNpcErrand(npc, task, deal = {}) {
  const type = task.type === "create_item" ? "fetch_item" : task.type;
  const itemType = task.itemType === "none" ? "collectible" : task.itemType;
  npc.errand = {
    type,
    requestedType: task.type,
    itemType,
    requestedLabel: task.requestedLabel ? String(task.requestedLabel).slice(0, 60) : null,
    quantity: Math.max(1, Math.min(3, Math.floor(finiteMemoryNumber(task.quantity, 1, 1, 3)))),
    summary: task.requestSummary || "A favor for the player.",
    companionName: task.companionName || "A friend from the Strip",
    stage: type === "escort" ? "escorting" : "departing",
    departure: errandDeparturePoint(npc).toArray(),
    startedAt: state.elapsed,
    returnAt: state.elapsed + 9,
    deadlineAtMs: Number.isFinite(task.deadlineAtMs) ? task.deadlineAtMs : null,
    deadlineToken: task.deadlineToken || null,
    outcome: ["deliver", "fail", "steal"].includes(deal.outcome) ? deal.outcome : "deliver",
    payment: {
      amount: Math.max(0, Math.floor(finiteMemoryNumber(deal.paymentAmount, 0, 0, 5_000))),
      timing: String(deal.paymentTiming || "favor").slice(0, 24),
      status: deal.paymentAmount > 0 ? "escrowed" : "favor",
      confirmedAtMs: Number.isFinite(deal.confirmedAtMs) ? deal.confirmedAtMs : null,
    },
    completed: false,
  };
  npc.object.userData.aiState = type === "escort" ? "assist" : "errand";
  rememberNpcMind(npc, { currentGoal: npc.errand.summary, summary: `Agreed to: ${npc.errand.summary}` });
  toast(`${npc.profile.label} is handling it.`, "info");
}

function spawnErrandCompanion(npc, errand) {
  const profile = {
    ...NPC_PROFILES.local,
    id: `companion-${npc.memoryId}-${Math.floor(state.elapsed)}`,
    label: errand.companionName,
    occupation: "Strip local",
    dialogue: ["I came because I wanted to meet you in person. Keep this respectful.", "I agreed to stop by. What did you need?"],
  };
  const object = createNpc(THREE, profile, false);
  realisticVisuals.attachNpc(object, profile.id);
  object.position.copy(npc.object.position).add(new THREE.Vector3(1.15, 0, 0));
  scene.add(object);
  npcs.push({
    id: object.userData.entityId,
    object,
    profile,
    isCop: false,
    home: object.position.clone(),
    baseRotation: object.rotation.clone(),
    goal: object.position.clone(),
    thinkTimer: 1,
    shotTimer: 0,
    interacted: false,
    talkRewarded: false,
    persuasionResolved: false,
    bribeResolved: false,
    dead: false,
    dynamic: true,
    persistentDynamic: true,
    dynamicKind: "companion",
    index: npcs.length,
    memoryId: object.userData.entityId,
  });
}

function spawnErrandVehicle(npc, itemType, offsetIndex = 0) {
  const mappedType = SPAWN_TYPE_MAP[itemType] || (VEHICLE_TYPES[itemType] ? itemType : "sedan");
  const config = VEHICLE_TYPES[mappedType] || VEHICLE_TYPES.sedan;
  const object = createVehicle(THREE, mappedType, rng.pick(config.colors || [0x525865]));
  const angle = npc.object.rotation.y + Math.PI * 0.5;
  object.position.copy(npc.object.position).add(new THREE.Vector3(
    Math.cos(angle) * (2.4 + offsetIndex * 1.8),
    0,
    Math.sin(angle) * (2.4 + offsetIndex * 1.8),
  ));
  object.position.y = getGroundHeight(object.position) + (mappedType === "bicycle" || mappedType === "dirtBike" || mappedType === "streetMotorcycle" ? 0.4 : 0.55);
  object.rotation.y = npc.object.rotation.y;
  object.userData.heading = object.rotation.y;
  object.userData.memoryId = `vehicle:retrieved:${mappedType}:${npc.memoryId}:${Math.floor(state.elapsed * 1000)}:${offsetIndex}`;
  realisticVisuals.attachVehicle(object, itemType || mappedType);
  scene.add(object);
  const record = {
    object,
    kind: "car",
    spawn: { type: itemType || mappedType, variant: "npc_retrieval" },
    basePosition: object.position.clone(),
    memoryId: object.userData.memoryId,
    index: vehicles.length,
    dynamic: true,
    dynamics: createRoadVehicleDynamics(object),
    npcImpactCooldowns: new Map(),
    previousPositionForImpact: object.position.clone(),
    doorCloseAt: 0,
    damageFxAt: 0,
  };
  vehicles.push(record);
  return record;
}

function completeNpcErrand(npc) {
  const errand = npc.errand;
  if (!errand || errand.completed) return;
  errand.completed = true;
  const outcome = errand.outcome || "deliver";
  if (outcome === "steal") {
    npc.object.userData.trust = Math.max(-100, (npc.object.userData.trust || 0) - 35);
    state.player.reputation = Math.max(-100, state.player.reputation - 2);
    growNpcBond(npc, -38, "betrayed the player");
    toast(`${npc.profile.label} came back empty-handed. Your money is gone.`, "danger");
  } else if (outcome === "fail") {
    npc.object.userData.trust = Math.max(-100, (npc.object.userData.trust || 0) - 10);
    const refund = Math.floor((errand.payment?.amount || 0) * 0.5);
    state.player.cash += refund;
    if (errand.payment) errand.payment.refund = refund;
    growNpcBond(npc, -8, "failed a promised job");
    toast(`${npc.profile.label} failed the job${refund ? ` · $${refund} refunded` : ""}.`, "warning");
  } else if (errand.type === "fetch_item") {
    const approved = APPROVED_ITEM_SPEC_BY_ID.get(errand.itemType);
    const count = Math.max(1, Math.min(3, errand.quantity || 1));
    if (approved?.category === "vehicle") {
      for (let index = 0; index < count; index += 1) spawnErrandVehicle(npc, errand.itemType, index);
      toast(`${npc.profile.label} returned with ${count > 1 ? `${count} vehicles` : npcItemLabel(errand.itemType)}.`, "success");
    } else {
      let lastLabel = errand.requestedLabel || npcItemLabel(errand.itemType);
      for (let index = 0; index < count; index += 1) {
        const item = createPickup(THREE, errand.itemType);
        realisticVisuals.attachPickup(item, errand.itemType);
        item.position.copy(npc.object.position).add(new THREE.Vector3(0.85 + index * 0.55, 0, 0.65));
        if (errand.requestedLabel) item.userData.label = errand.requestedLabel;
        item.userData.memoryId = `pickup:retrieved:${npc.memoryId}:${Math.floor(state.elapsed * 1000)}:${index}`;
        scene.add(item);
        const deliveredPickup = {
          id: item.userData.entityId,
          object: item,
          kind: item.userData.kind,
          sourceItemId: errand.itemType,
          requestedLabel: errand.requestedLabel || null,
          memoryId: item.userData.memoryId,
          index: pickups.length,
          collected: false,
          baseY: item.position.y,
          respawnAt: 0,
          dynamic: true,
          persistentDynamic: true,
          oneShot: true,
        };
        pickups.push(deliveredPickup);
        if (errand.requestedLabel) {
          const dynamicItems = sanitizeDynamicInventoryItems(state.player.inventory.dynamicItems);
          if (!dynamicItems.some((entry) => entry.id === deliveredPickup.memoryId)) {
            dynamicItems.push({
              id: deliveredPickup.memoryId,
              label: String(errand.requestedLabel).slice(0, 60),
              sourceItemId: String(errand.itemType || "collectible").slice(0, 40),
              acquiredAt: Number(state.elapsed.toFixed(2)),
            });
          }
          state.player.inventory.dynamicItems = dynamicItems.slice(-32);
        }
        lastLabel = item.userData.label;
      }
      toast(`${npc.profile.label} returned with ${count > 1 ? `${count} × ${lastLabel}` : lastLabel}.`, "success");
    }
    growNpcBond(npc, 6, "completed a deal");
  } else if (errand.type === "bring_companion") {
    spawnErrandCompanion(npc, errand);
    toast(`${npc.profile.label}'s companion agreed to meet you.`, "success");
  } else if (errand.type === "investigate") {
    state.player.reputation += 1;
    toast(`${npc.profile.label} returned with a lead.`, "success");
  }
  if (errand.payment) errand.payment.status = outcome === "deliver" ? "settled" : outcome;
  npc.lastDeal = { ...JSON.parse(JSON.stringify(errand)), status: outcome === "deliver" ? "completed" : outcome, completedAt: state.elapsed };
  rememberNpcMind(npc, {
    currentGoal: "Return to regular life on the Strip.",
    summary: `${outcome === "deliver" ? "Completed" : outcome === "steal" ? "Betrayed" : "Failed"}: ${errand.summary}`,
    facts: [`NPC deal ${outcome}: ${errand.summary}${errand.payment?.amount ? ` for $${errand.payment.amount}` : ""}.`],
  });
  npc.errand = null;
  npc.object.userData.aiState = npc.isCop ? "patrol" : "wander";
  scheduleSave("npc-errand-completed");
}

function updateNpcErrand(npc, target, dt) {
  const errand = npc.errand;
  if (!errand) return false;
  if (errand.stage === "escorting") {
    moveNpc(npc, tmp.a.copy(target).sub(npc.object.position), npc.object.userData.walkSpeed * 0.9, dt);
    return true;
  }
  if (errand.stage === "departing") {
    const departure = new THREE.Vector3().fromArray(errand.departure || npc.home.toArray());
    moveNpc(npc, tmp.a.copy(departure).sub(npc.object.position), npc.object.userData.walkSpeed * 1.35, dt);
    if (npc.object.position.distanceTo(departure) < 1.2 || state.elapsed - errand.startedAt > 10) {
      errand.stage = "away";
      errand.returnAt = state.elapsed + 5;
      npc.object.visible = false;
    }
    return true;
  }
  if (errand.stage === "away") {
    if (state.elapsed >= errand.returnAt) {
      errand.stage = "returning";
      npc.object.visible = true;
      npc.object.position.copy(target).add(new THREE.Vector3(-7, 0, -5));
      npc.object.position.y = getGroundHeight(npc.object.position) + 0.42;
    }
    return true;
  }
  if (errand.stage === "returning") {
    moveNpc(npc, tmp.a.copy(target).sub(npc.object.position), npc.object.userData.walkSpeed * 1.3, dt);
    if (npc.object.position.distanceTo(target) < 3.2) completeNpcErrand(npc);
    return true;
  }
  return false;
}

function setDialogueVoiceStatus(message, tone = "") {
  dom.dialogueVoiceStatus.textContent = message;
  dom.dialogueVoiceStatus.dataset.tone = tone;
  dom.dialogueMic.classList.toggle("listening", dialogueRuntime.listening);
  dom.dialogueMic.setAttribute("aria-pressed", String(dialogueRuntime.listening));
}

function stopDialogueVoice() {
  if (dialogueRuntime.recognition && dialogueRuntime.listening) {
    try { dialogueRuntime.recognition.abort(); } catch { /* Browser recognizer already stopped. */ }
  }
  dialogueRuntime.listening = false;
  setDialogueVoiceStatus(SpeechRecognitionConstructor ? "Voice ready" : "Voice input is unavailable in this browser.");
}

function ensureDialogueRecognition() {
  if (!SpeechRecognitionConstructor) {
    dom.dialogueMic.disabled = true;
    setDialogueVoiceStatus("Voice input is unavailable in this browser.", "warning");
    return null;
  }
  if (dialogueRuntime.recognition) return dialogueRuntime.recognition;
  const recognition = new SpeechRecognitionConstructor();
  recognition.lang = navigator.language || "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    dialogueRuntime.listening = true;
    dialogueRuntime.submittedFinalTranscript = false;
    setDialogueVoiceStatus("Listening… speak naturally.", "listening");
  };
  recognition.onresult = (event) => {
    let transcript = "";
    let finalTranscript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const phrase = event.results[index][0]?.transcript || "";
      transcript += phrase;
      if (event.results[index].isFinal) finalTranscript += phrase;
    }
    if (transcript.trim()) dom.dialogueInput.value = transcript.trim().slice(0, 180);
    if (finalTranscript.trim() && !dialogueRuntime.submittedFinalTranscript) {
      dialogueRuntime.submittedFinalTranscript = true;
      submitDialogueText(finalTranscript, "voice");
    }
  };
  recognition.onerror = (event) => {
    dialogueRuntime.lastVoiceError = event.error || "voice-error";
    dialogueRuntime.listening = false;
    const denied = ["not-allowed", "service-not-allowed"].includes(event.error);
    setDialogueVoiceStatus(denied ? "Microphone permission was denied." : "Voice input stopped. You can still type.", "warning");
  };
  recognition.onend = () => {
    dialogueRuntime.listening = false;
    if (!dialogueRuntime.lastVoiceError) setDialogueVoiceStatus("Voice ready");
  };
  dialogueRuntime.recognition = recognition;
  dom.dialogueMic.disabled = false;
  setDialogueVoiceStatus("Voice ready");
  return recognition;
}

function toggleDialogueVoice() {
  const recognition = ensureDialogueRecognition();
  if (!recognition) return;
  if (dialogueRuntime.listening) {
    stopDialogueVoice();
    return;
  }
  dialogueRuntime.lastVoiceError = null;
  try {
    recognition.start();
  } catch {
    setDialogueVoiceStatus("Voice input is already starting. You can still type.", "warning");
  }
}

function submitDialogueText(rawText, source = "text") {
  const npc = state.dialogueNpc;
  const text = String(rawText || "").trim().slice(0, 180);
  if (!npc || !text || state.phase !== "dialogue") return false;
  const classified = classifyDialogueInput(text);
  dialogueRuntime.lastInput = text;
  dialogueRuntime.lastIntent = classified.intent;
  dialogueRuntime.lastSource = source;
  dialogueRuntime.pendingPlayerText = text;
  dom.dialogueInput.value = "";
  if (!(classified.intent === "bribe" && /\bbribe\b/i.test(text)) && handleNpcLanguageResult(npc, text)) return true;
  if (classified.intent === "leave") {
    rememberConversation(npc, "player", text, "leave");
    scheduleSave("dialogue-leave");
    closeDialogue();
    return true;
  }
  if (classified.intent === "threaten") {
    dialogueRuntime.pendingPlayerText = null;
    npc.object.userData.trust = finiteMemoryNumber(npc.object.userData.trust, 0) - 8;
    npc.object.userData.fear = finiteMemoryNumber(npc.object.userData.fear, 0) + 18;
    dom.speakerLine.textContent = npc.isCop ? "That threat just became evidence. Back away." : "Fine. I heard you—but now I know exactly who you are.";
    if (npc.isCop) addHeat(8, "Threatening an officer");
    rememberDialogueExchange(npc, "threaten", text);
    audio.play("fail");
    return true;
  }
  if (classified.intent === "talk") {
    npc.interacted = true;
    if (!npc.talkRewarded) {
      npc.object.userData.trust += 2;
      state.player.reputation += 1;
      npc.talkRewarded = true;
    }
    dom.speakerLine.textContent = contextualDialogueReply(npc, text);
    rememberDialogueExchange(npc, "talk", text);
    audio.play("ui");
    requestNpcIntelligence(npc, text, "talk")
      .then((turn) => applyNpcIntelligence(npc, turn, "talk", text))
      .catch(() => {
        if (state.dialogueNpc !== npc || state.phase !== "dialogue") return;
        dom.speakerLine.textContent = contextualDialogueReply(npc, text);
        renderConversationMemory(npc);
      });
    return true;
  }
  resolveDialogue(classified.intent, { text, amount: classified.amount, source });
  return true;
}

function openDialogue(npc) {
  lastModalFocus = document.activeElement;
  state.dialogueNpc = npc;
  state.phase = "dialogue";
  dom.dialogue.classList.remove("hidden");
  dom.hud.classList.add("modal-open");
  byId("app").classList.add("modal-active");
  if (document.pointerLockElement) document.exitPointerLock();
  dom.speakerAvatar.textContent = npc.isCop ? "★" : npc.profile.label.slice(0, 1).toUpperCase();
  dom.speakerName.textContent = npc.profile.label;
  const previousPlayerTurn = [...conversationTurnsFor(npc)].reverse().find((turn) => turn.speaker === "player");
  if (previousPlayerTurn && state.elapsed - previousPlayerTurn.at > 90) {
    growNpcBond(npc, Math.min(3, (state.elapsed - previousPlayerTurn.at) / 300), "time and familiarity");
  }
  updateDialogueLoyaltyMeter(npc);
  const greeting = rng.pick(npc.profile.dialogue) || "Vegas always has another angle.";
  dom.speakerLine.textContent = greeting;
  clearPendingLanguageDeal();
  dialogueRuntime.lastLanguageError = null;
  if (!conversationTurnsFor(npc).length) rememberConversation(npc, "npc", greeting, "greeting");
  renderConversationMemory(npc);
  dom.dialogueInput.value = "";
  ensureDialogueRecognition();
  scheduleSave("dialogue-opened");
  renderBaseDialogueOptions(npc);
  if (npc.errand) {
    const payment = npc.errand.payment?.amount || 0;
    renderDealStatus(`ACTIVE · ${npcTaskItemLabel(npc.errand)} · $${payment}${npc.errand.deadlineToken ? ` · due ${npc.errand.deadlineToken}` : ""}`, "success");
  }
  window.requestAnimationFrame(() => dom.dialogueInput?.focus());
}

function closeDialogue() {
  stopDialogueVoice();
  clearPendingLanguageDeal();
  dom.dialogue.classList.add("hidden");
  dom.hud.classList.remove("modal-open");
  byId("app").classList.remove("modal-active");
  state.dialogueNpc = null;
  if (state.phase === "dialogue") state.phase = "playing";
  scheduleSave("dialogue-closed");
  (lastModalFocus instanceof HTMLElement ? lastModalFocus : dom.canvas).focus?.();
}

function persuasionChance(npc) {
  const rules = GAME_CONFIG.interaction.persuasion;
  const roleBonus = ROLE_CONFIG[state.role]?.bonuses?.persuasion || 0;
  const reputationBonus = state.player.reputation * rules.charismaWeight * 0.1;
  const difficulty = npc.object.userData.persuasionDifficulty || 0.5;
  const trust = npc.object.userData.trust || 0;
  const heatPenalty = state.player.wanted * rules.heatPenaltyPerLevel;
  return THREE.MathUtils.clamp(rules.baseChance + roleBonus + reputationBonus + trust * rules.trustWeight - difficulty * 0.4 - heatPenalty, rules.minChance, rules.maxChance);
}

function resolveDialogue(action, context = {}) {
  const npc = state.dialogueNpc;
  if (!npc) return;
  if (action === "talk") {
    npc.interacted = true;
    if (!npc.talkRewarded) {
      npc.object.userData.trust += 2;
      state.player.reputation += 1;
      npc.talkRewarded = true;
    }
    const hints = npc.profile.id === "tunnelRunner"
      ? ["The wash ramp is west of the Strip. Rare cases glow violet below.", "Follow the concrete channel west; the dry junction hides caches."]
      : npc.isCop
        ? ["Keep it legal and Metro will keep its distance.", "Break line of sight and your Pig Meter will eventually cool."]
        : ["Gold lights mark the Aurelia casino floor.", "Sin City Air keeps a prop plane fueled on the east runway.", "Loose items pulse with color after dark."];
    dom.speakerLine.textContent = rng.pick(hints);
    rememberDialogueExchange(npc, "talk", "What do you know about this city?");
    audio.play("ui");
    return;
  }

  if (action === "persuade") {
    if (!npc.object.userData.canPersuade) {
      dom.speakerLine.textContent = "There is nothing you can say that will change this conversation.";
      rememberDialogueExchange(npc, "persuade", "Hear me out.");
      audio.play("fail");
      return;
    }
    if (npc.persuasionResolved) {
      dom.speakerLine.textContent = "You already made your case. My answer stands.";
      rememberDialogueExchange(npc, "persuade", "Will you reconsider?");
      audio.play("fail");
      return;
    }
    npc.persuasionResolved = true;
    const success = rng.chance(persuasionChance(npc));
    if (success) {
      npc.object.userData.trust += GAME_CONFIG.interaction.persuasion.trustGainOnSuccess;
      state.player.reputation += npc.isCop ? 4 : 3;
      if (npc.isCop && state.player.heat > 0) setHeat(Math.max(0, state.player.heat - 16));
      dom.speakerLine.textContent = npc.isCop ? "All right. This is your one warning—move." : "Fine. You didn't hear it from me, but I'll help.";
      missionEvent("socialSuccess");
      audio.play("success");
      toast("Persuasion succeeded.", "success");
    } else {
      npc.object.userData.trust -= GAME_CONFIG.interaction.persuasion.trustLossOnFailure;
      dom.speakerLine.textContent = npc.isCop ? "Wrong answer. Don't test me again." : "Nice speech. I'm still not buying it.";
      if (npc.isCop) addHeat(4, "Suspicious approach");
      audio.play("fail");
      toast("They did not believe you.", "danger");
    }
    rememberDialogueExchange(npc, "persuade", "I need you to see this my way.");
    return;
  }

  if (action === "bribe") {
    if (!npc.object.userData.canBribe) {
      dom.speakerLine.textContent = "Keep it. I cannot be bought.";
      rememberDialogueExchange(npc, "bribe", "Maybe cash changes the answer.");
      audio.play("fail");
      return;
    }
    if (npc.bribeResolved) {
      dom.speakerLine.textContent = "Our arrangement is already settled for tonight.";
      rememberDialogueExchange(npc, "bribe", "About our arrangement…");
      audio.play("fail");
      return;
    }
    if (state.player.wanted > npc.object.userData.bribeMaxWantedLevel) {
      dom.speakerLine.textContent = `Not with Pig Meter ${state.player.wanted}/5 flashing over you.`;
      rememberDialogueExchange(npc, "bribe", "Name your price.");
      audio.play("fail");
      return;
    }
    const minimumAmount = Math.ceil(npc.object.userData.bribeMinimum * (npc.isCop ? 1 + state.player.wanted * 0.35 : 1));
    const explicitOffer = Number(context.amount);
    if (Number.isFinite(explicitOffer) && explicitOffer < minimumAmount) {
      dom.speakerLine.textContent = `That does not cover the risk. The minimum is $${minimumAmount}.`;
      rememberDialogueExchange(npc, "bribe", context.text || `I can offer $${Math.floor(explicitOffer)}.`);
      audio.play("fail");
      return;
    }
    const amount = Number.isFinite(explicitOffer) ? Math.max(minimumAmount, Math.floor(explicitOffer)) : minimumAmount;
    if (state.player.cash < amount) {
      dom.speakerLine.textContent = `Come back when you can cover $${amount}.`;
      rememberDialogueExchange(npc, "bribe", `I can offer $${Math.floor(state.player.cash)}.`);
      audio.play("fail");
      return;
    }
    npc.bribeResolved = true;
    state.player.cash -= amount;
    const roleDiscount = ROLE_CONFIG[state.role]?.bonuses?.bribeDiscount || 0;
    const generousOfferBonus = amount >= minimumAmount * 1.5 ? 0.08 : amount >= minimumAmount * 1.2 ? 0.04 : 0;
    const chance = THREE.MathUtils.clamp(0.74 + roleDiscount + generousOfferBonus - npc.object.userData.persuasionDifficulty * 0.24 - (npc.isCop ? state.player.wanted * 0.08 : 0), 0.12, 0.94);
    if (rng.chance(chance)) {
      npc.object.userData.trust += 15;
      state.player.reputation += 2;
      if (npc.isCop) setHeat(Math.max(0, state.player.heat - 24));
      dom.speakerLine.textContent = npc.isCop ? "I didn't see you tonight. Make that count." : "Now we're speaking the same language.";
      missionEvent("socialSuccess");
      audio.play("cash");
      toast(`Offer accepted · -$${amount}`, "success");
    } else {
      dom.speakerLine.textContent = npc.isCop ? "Attempting to bribe an officer? That's going in the report." : "Keep your money. I want no part of this.";
      if (npc.isCop) addHeat(GAME_CONFIG.interaction.bribe.failureHeat, "Failed police bribe");
      audio.play("fail");
      toast(`Offer refused · -$${amount}`, "danger");
    }
    rememberDialogueExchange(npc, "bribe", `I am offering $${amount}.`);
    saveGame("dialogue-bribe");
  }
}

function wantedFromHeat(heat) {
  let level = 0;
  for (let index = 1; index < GAME_CONFIG.crime.wantedThresholds.length; index += 1) {
    if (heat >= GAME_CONFIG.crime.wantedThresholds[index]) level = index;
  }
  return level;
}

function setHeat(value) {
  const previous = state.player.wanted;
  state.player.heat = THREE.MathUtils.clamp(value, 0, GAME_CONFIG.crime.maxHeat);
  state.player.wanted = wantedFromHeat(state.player.heat);
  playerObject.userData.heat = state.player.heat;
  playerObject.userData.wantedLevel = state.player.wanted;
  if (state.player.wanted > previous) {
    toast(`PIG METER ${state.player.wanted}/5 — pig units responding`, "danger");
    audio.play("siren");
    state.sfx.nextSirenAt = state.elapsed + 0.65;
    ensurePoliceResponse();
  } else if (state.player.wanted === 0 && previous > 0) {
    toast("Pig meter cleared. Keep a low profile.", "success");
  }
}

function addHeat(amount, offense = "Crime reported") {
  state.player.lastCrimeTime = state.elapsed;
  setHeat(state.player.heat + amount);
  if (state.elapsed - state.lastCrimeToastTime > 0.9) {
    toast(`${offense} · heat +${Math.ceil(amount)}`, "danger");
    state.lastCrimeToastTime = state.elapsed;
  }
  for (const npc of npcs) {
    if (!npc.isCop && !npc.dead && npc.object.position.distanceTo(getControlledObject().position) < GAME_CONFIG.crime.witnessRadius) {
      npc.object.userData.aiState = "flee";
      npc.object.userData.alertness = 1;
    }
  }
}

function ensurePoliceResponse() {
  const targetCount = GAME_CONFIG.police.maxActiveByWantedLevel[state.player.wanted] || 0;
  const aliveCops = npcs.filter((npc) => npc.isCop && !npc.dead);
  for (let index = aliveCops.length; index < targetCount; index += 1) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = rng.range(GAME_CONFIG.police.spawnMinDistance, GAME_CONFIG.police.spawnMaxDistance);
    const target = getControlledObject().position;
    const position = new THREE.Vector3(target.x + Math.cos(angle) * distance, target.y, target.z + Math.sin(angle) * distance);
    position.x = THREE.MathUtils.clamp(position.x, -WORLD_TRAVEL_LIMIT, WORLD_TRAVEL_LIMIT);
    position.z = THREE.MathUtils.clamp(position.z, -WORLD_TRAVEL_LIMIT, WORLD_TRAVEL_LIMIT);
    position.y = getGroundHeight(position) + 0.42;
    if (collidesWithWorld(position)) continue;
    const profile = state.player.wanted >= 5
      ? NPC_PROFILES.reptilianMarshal
      : state.player.wanted >= 3
        ? (index % 2 ? NPC_PROFILES.pigEnforcer : NPC_PROFILES.patrolOfficer)
        : NPC_PROFILES.patrolOfficer;
    const object = createNpc(THREE, profile, true);
    realisticVisuals.attachNpc(object, profile.id);
    object.position.copy(position);
    scene.add(object);
    npcs.push({ id: object.userData.entityId, object, profile, isCop: true, home: position.clone(), baseRotation: object.rotation.clone(), goal: position.clone(), thinkTimer: 0, shotTimer: rng.range(0.1, 0.7), interacted: false, talkRewarded: false, persuasionResolved: false, bribeResolved: false, dead: false, dynamic: true, index: npcs.length });
  }
}

function moveNpc(npc, direction, speed, dt) {
  direction.y = 0;
  if (direction.lengthSq() < 0.001) return;
  direction.normalize();
  const previous = npc.object.position.clone();
  npc.object.position.addScaledVector(direction, speed * dt);
  npc.object.position.y = getGroundHeight(npc.object.position) + 0.42;
  const overlapsNpc = npcs.some((other) => other !== npc && !other.dead && other.object.visible && other.object.position.distanceToSquared(npc.object.position) < 0.55 * 0.55);
  if (collidesWithWorld(npc.object.position) || overlapsNpc) {
    npc.object.position.copy(previous);
    npc.thinkTimer = 0;
    return;
  }
  const heading = Math.atan2(-direction.x, -direction.z);
  npc.object.rotation.y = lerpAngle(npc.object.rotation.y, heading, 1 - Math.exp(-7 * dt));
  animateCharacter(npc.object, state.elapsed * speed * 1.8);
}

function lineBlockedByWorld(from, to) {
  const direction = new THREE.Vector3().subVectors(to, from);
  const distance = direction.length();
  if (distance <= 0.001) return false;
  const ray = new THREE.Ray(from, direction.normalize());
  const hit = new THREE.Vector3();
  for (const box of world.collisionBoxes) {
    if (ray.intersectBox(box, hit) && from.distanceTo(hit) < distance - 0.35) return true;
  }
  return false;
}

function easterEntityRecord(npc) {
  return {
    id: npc.memoryId || npc.id,
    kind: npc.specialKind || "npc",
    ageBand: npc.specialKind ? "ageless" : "adult",
    health: Math.max(0, npc.object.userData.health),
    maxHealth: npc.object.userData.maxHealth,
    corruption: npc.object.userData.corruption || 0,
    possessedByDemon: Boolean(npc.object.userData.possessedByDemon),
    alive: !npc.dead && npc.object.userData.health > 0,
    revivable: !npc.specialKind,
  };
}

function spawnReleasedDemon(sourceNpc, releasedDemonId) {
  if (!releasedDemonId || npcs.some((npc) => npc.memoryId === releasedDemonId)) return null;
  const demon = spawnEasterEggNpc("demon", sourceNpc.object.position.clone().add(new THREE.Vector3(1.2, 0, 0.8)), releasedDemonId.split("-").at(-1));
  demon.id = releasedDemonId;
  demon.memoryId = releasedDemonId;
  demon.object.userData.memoryId = releasedDemonId;
  demon.dynamic = true;
  easterEggRuntime.releasedDemons += 1;
  easterEggs.registerEntity(easterEntityRecord(demon));
  return demon;
}

function syncEasterTargetToNpc(npc, target) {
  if (!npc || !target) return;
  npc.object.userData.health = target.health;
  npc.object.userData.corruption = target.corruption || 0;
  npc.object.userData.possessedByDemon = Boolean(target.possessedByDemon);
  npc.object.userData.alignment = target.alignment;
  npc.object.userData.aiState = target.behavior || npc.object.userData.aiState;
  if (target.alive && npc.dead) {
    npc.dead = false;
    npc.object.visible = true;
    npc.object.rotation.z = 0;
    npc.object.position.y = getGroundHeight(npc.object.position) + 0.42;
  } else if (!target.alive) {
    npc.dead = true;
    npc.object.userData.aiState = "down";
    npc.object.rotation.z = Math.PI / 2;
    npc.object.position.y = getGroundHeight(npc.object.position) + 0.25;
  }
}

function presentEasterEggEvents(result) {
  for (const event of result?.events || []) {
    easterEggRuntime.lastUiEventId = event.id;
    const tone = event.tone === "divine" ? "success" : event.tone === "infernal" ? "danger" : "info";
    toast(`${event.icon || "✦"} ${event.title} · ${event.message}`, tone);
  }
}

function applyEasterEggProjectile(shooterNpc, targetNpc, projectileId) {
  if (!shooterNpc || !targetNpc) return null;
  easterEggs.registerEntity(easterEntityRecord(shooterNpc));
  easterEggs.registerEntity(easterEntityRecord(targetNpc));
  const result = easterEggs.applyProjectileHit({
    projectileId,
    shooter: shooterNpc.memoryId || shooterNpc.id,
    targetId: targetNpc.memoryId || targetNpc.id,
    atMs: Math.floor(state.elapsed * 1000),
  });
  syncEasterTargetToNpc(targetNpc, result.target);
  presentEasterEggEvents(result);
  if (result.releasedDemonId) spawnReleasedDemon(targetNpc, result.releasedDemonId);
  const from = shooterNpc.object.position.clone().add(new THREE.Vector3(0, 1.45, 0));
  const to = targetNpc.object.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  const color = projectileId === "divineLight" || projectileId === "goldenPistol" ? 0xfff2a1 : 0x8b1cff;
  addSpecialProjectileSprite(from, to, projectileId);
  addTracer(from, to, color);
  addImpactBurst(to, color, projectileId === "goldenPistol");
  scheduleSave(`easter-egg-${projectileId}`);
  return result;
}

function applyPlayerGoldenPistolHit(targetNpc) {
  easterEggs.registerEntity({
    id: playerObject.userData.entityId,
    kind: "npc",
    ageBand: "adult",
    health: state.player.health,
    maxHealth: GAME_CONFIG.player.maxHealth,
    alive: state.player.health > 0,
  });
  easterEggs.registerEntity(easterEntityRecord(targetNpc));
  const result = easterEggs.applyProjectileHit({
    projectileId: "goldenPistol",
    shooter: playerObject.userData.entityId,
    targetId: targetNpc.memoryId || targetNpc.id,
    atMs: Math.floor(state.elapsed * 1000),
  });
  syncEasterTargetToNpc(targetNpc, result.target);
  presentEasterEggEvents(result);
  return result;
}

function updateSupernaturalNpc(npc, playerTarget, dt) {
  if (!npc.specialKind) return false;
  const playerDistance = npc.object.position.distanceTo(playerTarget);
  if (playerDistance > 90) {
    animateCharacter(npc.object, 0, true);
    return true;
  }
  if (npc.specialKind === "devil") {
    const victim = npcs
      .filter((candidate) => !candidate.dead && !candidate.specialKind && candidate.object.visible && (candidate.object.userData.corruption || 0) < 100)
      .map((candidate) => ({ candidate, distance: candidate.object.position.distanceTo(npc.object.position) }))
      .filter((entry) => entry.distance < 28)
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;
    if (victim) {
      npc.object.lookAt(victim.object.position.x, npc.object.position.y, victim.object.position.z);
      if (npc.shotTimer <= 0 && !lineBlockedByWorld(npc.object.position, victim.object.position)) {
        applyEasterEggProjectile(npc, victim, "soulTaker");
        npc.shotTimer = 3.8;
      }
    }
    return true;
  }
  if (npc.specialKind === "jesus") {
    const infernal = npcs
      .filter((candidate) => !candidate.dead && ["demon", "devil"].includes(candidate.specialKind))
      .map((candidate) => ({ candidate, distance: candidate.object.position.distanceTo(npc.object.position) }))
      .filter((entry) => entry.distance < 42)
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;
    const wounded = npcs
      .filter((candidate) => !candidate.specialKind && (candidate.dead || candidate.object.userData.corruption > 0 || candidate.object.userData.health < candidate.object.userData.maxHealth))
      .map((candidate) => ({ candidate, distance: candidate.object.position.distanceTo(npc.object.position) }))
      .filter((entry) => entry.distance < 34)
      .sort((a, b) => a.distance - b.distance)[0]?.candidate;
    const targetNpc = infernal || wounded;
    if (targetNpc) {
      npc.object.lookAt(targetNpc.object.position.x, npc.object.position.y, targetNpc.object.position.z);
      if (npc.shotTimer <= 0 && !lineBlockedByWorld(npc.object.position, targetNpc.object.position)) {
        applyEasterEggProjectile(npc, targetNpc, infernal ? "goldenPistol" : "divineLight");
        npc.shotTimer = infernal ? 2.4 : 1.8;
      }
    }
    return true;
  }
  const distance = npc.object.position.distanceTo(playerTarget);
  if (distance > 1.8) moveNpc(npc, tmp.a.copy(playerTarget).sub(npc.object.position), npc.object.userData.walkSpeed * 1.35, dt);
  else if (npc.shotTimer <= 0) {
    damagePlayer(9);
    npc.shotTimer = 1.25;
    toast("DEMON STRIKE · divine light can release its hold", "danger");
  }
  return true;
}

function updateNpcAi(dt) {
  const target = getControlledObject().position;
  let arrestingCopNearby = false;
  for (const npc of npcs) {
    if (npc.dead) continue;
    if (updateNpcVehicleImpact(npc, dt)) continue;
    npc.thinkTimer -= dt;
    npc.shotTimer -= dt;
    const distance = npc.object.position.distanceTo(target);
    if (updateSupernaturalNpc(npc, target, dt)) continue;
    if (updateNpcErrand(npc, target, dt)) continue;
    if (!npc.object.visible) continue;
    if (npc.isCop && state.player.wanted > 0 && !state.player.arrested) {
      npc.object.userData.aiState = distance < 13 ? "engage" : "chase";
      moveNpc(npc, tmp.a.copy(target).sub(npc.object.position), npc.object.userData.chaseSpeed, dt);
      if (distance < 18 && npc.shotTimer <= 0 && state.player.wanted >= 2) {
        npc.shotTimer = GAME_CONFIG.police.shotCooldownSeconds + rng.range(0.1, 0.45);
        const from = npc.object.position.clone().add(new THREE.Vector3(0, 1.5, 0));
        const to = target.clone().add(new THREE.Vector3(rng.range(-0.5, 0.5), 1, rng.range(-0.5, 0.5)));
        if (!lineBlockedByWorld(from, to)) {
          addTracer(from, to, 0x76b9ff);
          const accuracy = THREE.MathUtils.clamp(0.72 - distance * 0.022, 0.28, 0.68);
          if (rng.chance(accuracy)) damagePlayer(rng.range(5, 10));
        }
      }
      if (distance < GAME_CONFIG.police.arrestRange + 0.8) arrestingCopNearby = true;
      continue;
    }

    if (!npc.isCop && npc.object.userData.aiState === "flee") {
      const away = tmp.a.copy(npc.object.position).sub(target);
      moveNpc(npc, away, npc.object.userData.walkSpeed * 1.85, dt);
      if (distance > GAME_CONFIG.crime.witnessRadius * 1.5) npc.object.userData.aiState = "wander";
      continue;
    }

    const commandedAction = npc.object.userData.aiState;
    const actionActive = Number(npc.object.userData.aiActionUntil) > state.elapsed;
    if (actionActive && ["investigate", "approach", "pursue", "assist"].includes(commandedAction)) {
      const targetPosition = commandedAction === "investigate" ? npc.goal : target;
      const pace = commandedAction === "pursue" ? 1.6 : commandedAction === "approach" ? 1.05 : 0.86;
      moveNpc(npc, tmp.a.copy(targetPosition).sub(npc.object.position), npc.object.userData.walkSpeed * pace, dt);
      continue;
    }
    if (actionActive && commandedAction === "retreat") {
      moveNpc(npc, tmp.a.copy(npc.object.position).sub(target), npc.object.userData.walkSpeed * 1.15, dt);
      continue;
    }

    if (npc.thinkTimer <= 0 || npc.object.position.distanceTo(npc.goal) < 1.2) {
      npc.thinkTimer = rng.range(2.2, 6.5);
      npc.goal.copy(npc.home).add(new THREE.Vector3(rng.range(-12, 12), 0, rng.range(-12, 12)));
      npc.goal.y = npc.home.y;
    }
    if (npc.object.position.distanceTo(npc.goal) > 1) moveNpc(npc, tmp.a.copy(npc.goal).sub(npc.object.position), npc.object.userData.walkSpeed * 0.62, dt);
    else animateCharacter(npc.object, 0, true);
  }

    if (arrestingCopNearby && state.player.wanted > 0 && !state.player.arrested) {
    state.player.arrestProgress += dt;
    if (state.player.arrestProgress > 0.5 && state.elapsed - state.lastArrestToastTime > 1.1) {
      toast("POLICE RESTRAINT — move away!", "danger");
      state.lastArrestToastTime = state.elapsed;
    }
    if (state.player.arrestProgress >= GAME_CONFIG.police.arrestHoldSeconds) {
      const cop = npcs.find((candidate) => candidate.isCop && !candidate.dead && candidate.object.position.distanceTo(getControlledObject().position) < GAME_CONFIG.police.arrestRange + 1.5);
      beginArrestSequence(cop);
    }
  } else {
    state.player.arrestProgress = Math.max(0, state.player.arrestProgress - dt * 2.2);
  }
}

function damagePlayer(amount) {
  let remaining = amount;
  if (state.player.armor > 0) {
    const absorbed = Math.min(state.player.armor, amount * GAME_CONFIG.combat.armorAbsorption);
    state.player.armor -= absorbed;
    remaining -= absorbed;
  }
  state.player.health = Math.max(0, state.player.health - remaining);
  state.screenShake = Math.min(0.65, state.screenShake + amount / 60);
  if (state.player.health <= 0) hospitalRespawn();
}

function beginArrestSequence(cop) {
  if (state.player.arrested) return;
  if (state.player.inVehicle) releasePlayerVehicle(state.player.inVehicle);
  state.player.arrested = true;
  state.player.arrestPhase = "takedown";
  state.player.arrestTimer = 0;
  state.player.arrestCopId = cop?.id || null;
  state.player.arrestProgress = 0;
  playerObject.userData.velocity.set(0, 0, 0);
  const direction = cop ? tmp.a.copy(playerObject.position).sub(cop.object.position).setY(0).normalize() : tmp.a.set(0, 0, 1);
  if (direction.lengthSq() < 0.01) direction.set(0, 0, 1);
  playerObject.position.addScaledVector(direction, 0.28);
  playerObject.userData.arrestCuffs ||= createArrestCuffs();
  if (!playerObject.userData.arrestCuffs.parent) playerObject.add(playerObject.userData.arrestCuffs);
  toast("TAKEDOWN · officer forced you down", "danger");
  audio.play("crash", { start: 420, end: 70, duration: 0.18, gain: 0.12, throttle: 0 });
  window.setTimeout(() => {
    if (!state.player.arrested) return;
    state.player.arrestPhase = "cuffed";
    toast("CUFFED · weapons and movement disabled", "danger");
    audio.play("cuff");
  }, 650);
}

function createArrestCuffs() {
  const group = new THREE.Group();
  group.name = "ArrestCuffs";
  const metal = new THREE.MeshStandardMaterial({ color: 0x9ea9b6, metalness: 0.9, roughness: 0.22 });
  const left = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.035, 8, 16), metal);
  const right = left.clone();
  left.position.set(-0.18, 0.58, -0.18);
  right.position.set(0.18, 0.58, -0.18);
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.36, 8), metal);
  chain.rotation.z = Math.PI / 2;
  chain.position.set(0, 0.58, -0.18);
  group.add(left, right, chain);
  group.visible = false;
  return group;
}

function arrestPlayer() {
  if (state.player.inVehicle) releasePlayerVehicle(state.player.inVehicle);
  state.player.cash = Math.max(0, state.player.cash - GAME_CONFIG.economy.impoundFee);
  setHeat(0);
  state.player.arrestProgress = 0;
  state.player.arrested = false;
  state.player.arrestPhase = "free";
  state.player.arrestTimer = 0;
  state.player.arrestCopId = null;
  playerObject.rotation.z = 0;
  playerObject.userData.arrested = false;
  if (playerObject.userData.arrestCuffs) playerObject.userData.arrestCuffs.visible = false;
  playerObject.position.copy(world.locations.policeStation.position).add(new THREE.Vector3(-9, 0, 0));
  playerObject.position.y = 0.42;
  toast(`BUSTED · impound fee $${GAME_CONFIG.economy.impoundFee}`, "danger");
  saveGame();
}

function hospitalRespawn() {
  if (state.player.inVehicle) releasePlayerVehicle(state.player.inVehicle);
  else releasePlayerVehicle(null);
  state.player.health = GAME_CONFIG.player.maxHealth;
  state.player.armor = 0;
  state.player.cash = Math.max(0, state.player.cash - GAME_CONFIG.economy.hospitalFee);
  setHeat(0);
  playerObject.position.copy(world.locations.spawn.position);
  playerObject.position.y = 0.42;
  toast(`WASTED · medical bill $${GAME_CONFIG.economy.hospitalFee}`, "danger");
}

function addTracer(from, to, color) {
  const tracer = createBulletTracer(THREE, from, to, color);
  scene.add(tracer);
  effects.push(tracer);
}

function addCombatBurst(position, color, size = 0.12) {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.96, depthWrite: false, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size, 8, 6), material);
  mesh.position.copy(position);
  mesh.userData = { ttl: 0.09, maxTtl: 0.09, effectKind: "combat-burst", baseScale: 1 };
  scene.add(mesh);
  effects.push(mesh);
}

function addImpactBurst(position, color, critical = false) {
  addCombatBurst(position, critical ? 0xffe08a : color, critical ? 0.19 : 0.12);
  for (let index = 0; index < (critical ? 3 : 2); index += 1) {
    const sparkEnd = position.clone().add(new THREE.Vector3(rng.range(-0.35, 0.35), rng.range(0.04, 0.42), rng.range(-0.35, 0.35)));
    addTracer(position, sparkEnd, critical ? 0xfff0b0 : color);
  }
}

function addSpecialProjectileSprite(from, to, projectileId) {
  if (FORCE_IMAGE_VOXEL_3D_MODE) {
    const url = SUPERNATURAL_PROJECTILE_URLS[projectileId] || SUPERNATURAL_PROJECTILE_URLS.divineLight;
    const projectile = createImageVoxelAtlasModel(THREE, {
      name: `Projectile_${projectileId}`,
      url,
      columns: projectileId === "goldenPistol" ? 4 : 1,
      rows: projectileId === "goldenPistol" ? 2 : 1,
      tile: 0,
      width: projectileId === "divineLight" ? 0.78 : projectileId === "goldenPistol" ? 0.62 : 0.68,
      height: projectileId === "divineLight" ? 0.42 : 0.36,
      depth: projectileId === "divineLight" ? 0.18 : 0.15,
      feetOffset: -0.2,
      sampleWidth: MOBILE_QUALITY ? 14 : 18,
      sampleHeight: MOBILE_QUALITY ? 10 : 14,
      anisotropy: MOBILE_QUALITY ? 2 : 8,
    });
    projectile.position.copy(from);
    projectile.lookAt(to);
    const ttl = 0.22;
    projectile.userData = {
      ...projectile.userData,
      ttl,
      maxTtl: ttl,
      effectKind: "special-projectile",
      baseScale: 1,
      imageDerivedProjectile: true,
      velocity: new THREE.Vector3().subVectors(to, from).multiplyScalar(1 / ttl),
    };
    scene.add(projectile);
    effects.push(projectile);
    return;
  }
  const texture = SUPERNATURAL_PROJECTILE_TEXTURES[projectileId];
  if (!texture) return;
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity: 0.98,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.copy(from);
  sprite.scale.set(projectileId === "divineLight" ? 1.65 : 1.35, projectileId === "divineLight" ? 0.82 : 0.7, 1);
  const ttl = 0.22;
  sprite.userData = {
    ttl,
    maxTtl: ttl,
    effectKind: "special-projectile",
    velocity: new THREE.Vector3().subVectors(to, from).multiplyScalar(1 / ttl),
  };
  scene.add(sprite);
  effects.push(sprite);
}

function lineHitsNpc(origin, direction, range) {
  tmp.ray.set(origin, direction);
  tmp.ray.far = range;
  const objects = npcs.filter((npc) => !npc.dead).map((npc) => npc.object);
  const hits = tmp.ray.intersectObjects(objects, true);
  if (!hits.length) return null;
  const hit = hits[0];
  let owner = null;
  for (const npc of npcs) {
    if (npc.dead) continue;
    let current = hit.object;
    while (current) {
      if (current === npc.object) {
        owner = npc;
        break;
      }
      current = current.parent;
    }
    if (owner) break;
  }
  return owner ? { npc: owner, point: hit.point, distance: hit.distance, critical: hit.point.y > owner.object.position.y + 1.52 } : null;
}

function clearTargetLock(message = "") {
  if (!state.lockedTarget) return;
  state.lockedTarget = null;
  dom.crosshair.classList.remove("target-locked");
  delete dom.crosshair.dataset.target;
  if (message) toast(message, "info");
}

function bestTargetLockCandidate() {
  if (state.player.inVehicle || state.player.weapon === "unarmed") return null;
  const origin = playerObject.position.clone().add(new THREE.Vector3(0, 1.45, 0));
  const forward = camera.getWorldDirection(new THREE.Vector3()).normalize();
  let best = null;
  let bestScore = Infinity;
  for (const npc of npcs) {
    if (npc.dead || !npc.object.visible) continue;
    const point = npc.object.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    const offset = point.clone().sub(origin);
    const distance = offset.length();
    if (distance > 72 || distance < 0.5) continue;
    const facing = forward.dot(offset.clone().normalize());
    if (facing < 0.68 || lineBlockedByWorld(origin, point)) continue;
    const score = (1 - facing) * 85 + distance * 0.018;
    if (score < bestScore) {
      best = npc;
      bestScore = score;
    }
  }
  return best;
}

function toggleTargetLock() {
  if (state.phase !== "playing" || state.player.inVehicle || state.player.weapon === "unarmed") {
    clearTargetLock();
    return false;
  }
  const candidate = bestTargetLockCandidate();
  if (!candidate) {
    clearTargetLock();
    toast("No target in the lock cone.", "warning");
    audio.play("empty");
    return false;
  }
  if (state.lockedTarget === candidate) {
    clearTargetLock("Target lock released.");
    return false;
  }
  state.lockedTarget = candidate;
  dom.crosshair.classList.add("target-locked");
  dom.crosshair.dataset.target = candidate.profile.label.toUpperCase();
  toast(`LOCKED · ${candidate.profile.label}`, "danger");
  audio.play("lock");
  return true;
}

function updateTargetLock(dt) {
  const npc = state.lockedTarget;
  if (!npc) return;
  if (npc.dead || !npc.object.visible || state.player.inVehicle || state.player.weapon === "unarmed" || playerObject.position.distanceTo(npc.object.position) > 86) {
    clearTargetLock("Target lock lost.");
    return;
  }
  const origin = playerObject.position.clone().add(new THREE.Vector3(0, 1.45, 0));
  const point = npc.object.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  const offset = point.sub(origin);
  const flatDistance = Math.max(0.01, Math.hypot(offset.x, offset.z));
  const desiredYaw = Math.atan2(-offset.x, -offset.z);
  const yawDelta = Math.atan2(Math.sin(desiredYaw - state.cameraYaw), Math.cos(desiredYaw - state.cameraYaw));
  const strength = 1 - Math.exp(-dt * 11);
  state.cameraYaw += yawDelta * strength;
  const desiredPitch = THREE.MathUtils.clamp(0.28 + Math.atan2(offset.y, flatDistance) * 0.84, GAME_CONFIG.camera.minPitch, GAME_CONFIG.camera.maxPitch);
  state.cameraPitch = THREE.MathUtils.lerp(state.cameraPitch, desiredPitch, strength);
  playerObject.rotation.y = state.cameraYaw;
}

function fireWeapon() {
  if (state.phase !== "playing" || state.player.arrested || state.player.inVehicle || state.player.fireCooldown > 0 || state.player.reloadTimer > 0) return;
  const weapon = WEAPONS[state.player.weapon] || WEAPONS.unarmed;
  if (weapon.id === "unarmed") {
    const target = npcs.find((npc) => !npc.dead && npc.object.position.distanceTo(playerObject.position) < weapon.range + 0.8);
    if (target) {
      damageNpc(target, weapon.damage);
      addHeat(GAME_CONFIG.crime.heatByOffense.assault, "Assault witnessed");
    }
    state.player.fireCooldown = 1 / weapon.fireRate;
    return;
  }
  const ammo = state.player.ammo[weapon.id];
  if (!ammo || ammo.magazine <= 0) {
    audio.play("empty");
    toast(ammo?.reserve > 0 ? "Magazine empty · press R to reload" : "Out of ammunition", "warning");
    state.player.fireCooldown = 0.3;
    return;
  }
  ammo.magazine -= 1;
  state.player.fireCooldown = 1 / weapon.fireRate;
  const origin = playerObject.position.clone().add(new THREE.Vector3(0, 1.45, 0));
  const baseDirection = state.lockedTarget && !state.lockedTarget.dead
    ? state.lockedTarget.object.position.clone().add(new THREE.Vector3(0, 1.18, 0)).sub(origin).normalize()
    : new THREE.Vector3(
      -Math.sin(state.cameraYaw),
      (state.cameraPitch - 0.28) * 0.9,
      -Math.cos(state.cameraYaw),
    );
  const pelletCount = Math.max(1, weapon.pellets || 1);
  const hitTargets = new Set();
  let anyHit = false;
  for (let pellet = 0; pellet < pelletCount; pellet += 1) {
    const direction = baseDirection.clone();
    const cone = pelletCount > 1 ? weapon.spread * 1.25 : weapon.spread;
    direction.x += rng.range(-cone, cone);
    direction.y += rng.range(-cone, cone);
    direction.z += rng.range(-cone, cone);
    direction.normalize();
    let hit = lineHitsNpc(origin, direction, weapon.range);
    tmp.ray.set(origin, direction);
    tmp.ray.far = weapon.range;
    const worldHit = tmp.ray.intersectObject(world.root, true)[0];
    if (worldHit && (!hit || worldHit.distance < hit.distance)) hit = null;
    const end = hit?.point || worldHit?.point || origin.clone().addScaledVector(direction, weapon.range);
    if (pelletCount === 1 || pellet < 4) addTracer(origin, end, weapon.tracerColor);
    if (hit) {
      const damage = weapon.damage * (hit.critical ? GAME_CONFIG.combat.headshotMultiplier : 1);
      const specialResult = weapon.specialProjectile === "goldenPistol"
        ? applyPlayerGoldenPistolHit(hit.npc)
        : null;
      if (!specialResult) damageNpc(hit.npc, damage);
      addImpactBurst(hit.point, weapon.tracerColor, hit.critical);
      if (!specialResult || ["damaged", "defeated"].includes(specialResult.outcome)) {
        hitTargets.add(hit.npc);
        anyHit = true;
      }
    } else if (worldHit) {
      addImpactBurst(worldHit.point, 0xffcf73, false);
    }
  }
  addCombatBurst(origin.clone().addScaledVector(baseDirection.normalize(), 0.46), weapon.id === "taser" ? 0x6cf5ff : 0xffd36a, weapon.id === "shotgun" ? 0.2 : 0.11);
  const weaponHeat = weapon.heat ?? GAME_CONFIG.crime.heatByOffense.weaponDischarge;
  if (weaponHeat > 0) addHeat(weaponHeat, "Weapon discharge reported");
  const kick = weapon.id === "shotgun" ? 0.09 : weapon.id === "smg" ? 0.027 : weapon.id === "taser" ? 0.018 : 0.045;
  state.gunFeel.pitchKick = Math.min(0.16, state.gunFeel.pitchKick + kick);
  state.gunFeel.yawKick += rng.range(-kick * 0.42, kick * 0.42);
  state.gunFeel.hitConfirm = anyHit ? 1 : 0;
  state.screenShake = Math.min(0.38, state.screenShake + (weapon.damage || 12) / 180);
  if (anyHit) {
    toast(`${hitTargets.size > 1 ? `${hitTargets.size} targets hit` : "Target hit"}${weapon.id === "shotgun" ? " · pellet spread confirmed" : ""}`, "success");
    audio.play("hit", { throttle: 0 });
  }
  audio.playGunshot?.(weapon.id);
}

function damageNpc(npc, amount) {
  if (!npc || npc.dead) return;
  let remaining = amount;
  if (npc.object.userData.armor > 0) {
    const absorbed = Math.min(npc.object.userData.armor, amount * 0.55);
    npc.object.userData.armor -= absorbed;
    remaining -= absorbed;
  }
  npc.object.userData.health -= remaining;
  growNpcBond(npc, -Math.min(30, Math.max(4, remaining * 0.45)), "player violence");
  npc.object.userData.aiState = npc.isCop ? "chase" : "flee";
  if (npc.isCop) addHeat(GAME_CONFIG.crime.heatByOffense.policeAssault, "Officer attacked");
  else addHeat(GAME_CONFIG.crime.heatByOffense.assault, "Civilian attacked");
  if (npc.object.userData.health <= 0) {
    npc.dead = true;
    npc.object.rotation.z = Math.PI / 2;
    npc.object.position.y = getGroundHeight(npc.object.position) + 0.25;
    npc.object.userData.aiState = "down";
    const dropKind = rng.chance(0.6) ? "cash" : "ammo";
  const object = createPickup(THREE, dropKind);
  realisticVisuals.attachPickup(object, dropKind);
    object.position.copy(npc.object.position).add(new THREE.Vector3(0.8, 0.3, 0));
    object.userData.baseY = object.position.y;
    scene.add(object);
    pickups.push({ object, kind: dropKind, collected: false, baseY: object.position.y, respawnAt: 0, dynamic: true });
  }
}

function reloadWeapon() {
  const weapon = WEAPONS[state.player.weapon];
  const ammo = state.player.ammo[state.player.weapon];
  if (!weapon || !ammo || weapon.magazineSize <= 0 || ammo.magazine >= weapon.magazineSize || ammo.reserve <= 0 || state.player.reloadTimer > 0) return;
  state.player.reloadTimer = weapon.reloadSeconds;
  toast(`Reloading ${weapon.label}…`, "info");
  audio.play("reloadStart");
}

function finishReload() {
  const weapon = WEAPONS[state.player.weapon];
  const ammo = state.player.ammo[state.player.weapon];
  if (!weapon || !ammo) return;
  const needed = weapon.magazineSize - ammo.magazine;
  const moved = Math.min(needed, ammo.reserve);
  ammo.magazine += moved;
  ammo.reserve -= moved;
  audio.play("reloadEnd");
}

function selectWeapon(slot) {
  if (state.player.arrested) return;
  const order = ["unarmed", "pistol", "smg", "shotgun", "taser", "goldenPistol"].filter((id) => state.player.unlockedWeapons.has(id));
  const id = order[Math.max(0, slot - 1)];
  if (!id) return;
  state.player.weapon = id;
  if (id === "unarmed") clearTargetLock();
  state.player.reloadTimer = 0;
  audio.play("weaponSelect");
  toast(`${WEAPONS[id].label} equipped`, "info");
}

function collectPickup(pickup) {
  if (pickup.collected) return;
  const data = pickup.object.userData;
  const amount = rng.int(data.amountMin, data.amountMax);
  const effect = data.effect || {};
  if (effect.stat === "cash") state.player.cash += amount;
  else if (effect.stat === "health") state.player.health = Math.min(GAME_CONFIG.player.maxHealth, state.player.health + amount);
  else if (effect.stat === "armor") state.player.armor = Math.min(GAME_CONFIG.player.maxArmor, state.player.armor + amount);
  else if (effect.stat === "ammo") {
    const owned = [...state.player.unlockedWeapons].filter((id) => id !== "unarmed" && state.player.ammo[id]);
    const weapon = rng.pick(owned) || "pistol";
    state.player.ammo[weapon].reserve += amount;
  } else if (effect.stat === "casinoChips") state.player.chips += amount;
  else if (effect.stat === "lockpicks") state.player.inventory.lockpicks += amount;
  else if (effect.stat === "collectibles") state.player.inventory.collectibles += amount;
  else if (effect.stat === "fenceValue") state.player.inventory.contraband += 1;
  else if (effect.stat === "vehicleFuel") {
    const nearbyVehicle = state.player.inVehicle || vehicles
      .map((vehicle) => ({ vehicle, distance: vehicle.object.position.distanceTo(playerObject.position) }))
      .filter((entry) => entry.distance < 6)
      .sort((a, b) => a.distance - b.distance)[0]?.vehicle;
    if (nearbyVehicle) nearbyVehicle.object.userData.fuel = Math.min(nearbyVehicle.object.userData.maxFuel, nearbyVehicle.object.userData.fuel + amount);
    else state.player.inventory.fuel += amount;
  }
  else if (effect.stat === "weapon") {
    const candidates = (data.lootTable || Object.keys(WEAPONS)).filter((id) => !state.player.unlockedWeapons.has(id) && id !== "unarmed");
    const weapon = rng.pick(candidates) || rng.pick(data.lootTable || ["pistol"]);
    state.player.unlockedWeapons.add(weapon);
    const weaponData = WEAPONS[weapon];
    state.player.ammo[weapon] = { magazine: weaponData.magazineSize, reserve: weaponData.reserveAmmo };
    state.player.weapon = weapon;
    toast(`${weaponData.label} unlocked`, "success");
  }
  if (data.pickupHeat) addHeat(data.pickupHeat, "Suspicious package recovered");
  if (pickup.requestedLabel) {
    const dynamicItems = sanitizeDynamicInventoryItems(state.player.inventory.dynamicItems);
    const itemId = String(pickup.memoryId || pickup.object.userData.memoryId || pickup.object.userData.entityId);
    if (!dynamicItems.some((item) => item.id === itemId)) {
      dynamicItems.push({
        id: itemId,
        label: String(pickup.requestedLabel).slice(0, 60),
        sourceItemId: String(pickup.sourceItemId || pickup.kind || "collectible").slice(0, 40),
        acquiredAt: Number(state.elapsed.toFixed(2)),
      });
    }
    state.player.inventory.dynamicItems = dynamicItems.slice(-32);
  }
  pickup.collected = true;
  pickup.object.visible = false;
  pickup.respawnAt = pickup.oneShot ? Number.POSITIVE_INFINITY : state.elapsed + data.respawnSeconds;
  state.player.reputation += data.rarity === "legendary" ? 3 : data.rarity === "rare" ? 1 : 0;
  audio.play("pickup");
  toast(`${data.label}${effect.stat === "weapon" ? "" : ` +${amount}`}`, data.rarity === "rare" || data.rarity === "legendary" ? "success" : "info");
  if (state.player.zone === "storm-drains") missionEvent("tunnelPickup");
  saveGame();
}

function updatePickups(dt) {
  const position = getControlledObject().position;
  for (const pickup of pickups) {
    if (pickup.collected) {
      if (!pickup.oneShot && state.elapsed >= pickup.respawnAt) {
        pickup.collected = false;
        pickup.object.visible = true;
      }
      continue;
    }
    const data = pickup.object.userData;
    pickup.object.rotation.y += data.spinSpeed * dt;
    pickup.object.position.y = pickup.baseY + Math.sin(state.elapsed * data.bobSpeed + data.bobPhase) * data.bobHeight;
    const canCollect = !state.player.inVehicle || pickup.kind === "fuel";
    const collectDistance = state.player.inVehicle && pickup.kind === "fuel" ? GAME_CONFIG.pickups.collectRadius * 1.8 : GAME_CONFIG.pickups.collectRadius;
    if (canCollect && pickup.object.position.distanceTo(position) < collectDistance) collectPickup(pickup);
  }
}

function updateEffects(dt) {
  for (let index = effects.length - 1; index >= 0; index -= 1) {
    const effect = effects[index];
    effect.userData.ttl -= dt;
    const opacity = Math.max(0, effect.userData.ttl / effect.userData.maxTtl);
    if (effect.material) effect.material.opacity = opacity;
    if (effect.userData.effectKind === "combat-burst") {
      const growth = 1 + (1 - opacity) * 2.4;
      effect.scale.setScalar(growth);
    }
    if (effect.userData.effectKind === "vehicle-smoke") {
      const growth = 1 + (1 - opacity) * 2.8;
      effect.scale.setScalar(growth);
      effect.position.y += dt * 0.72;
    }
    if (effect.userData.effectKind === "special-projectile") {
      effect.position.addScaledVector(effect.userData.velocity, dt);
      effect.scale.multiplyScalar(1 + dt * 1.8);
    }
    if (effect.userData.ttl <= 0) {
      scene.remove(effect);
      if (effect.userData.imageDerivedProjectile) {
        effect.traverse((child) => {
          if (child === effect) return;
          child.geometry?.dispose?.();
          if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
          else child.material?.dispose?.();
        });
      } else {
        if (!effect.isSprite) effect.geometry?.dispose?.();
        effect.material?.dispose?.();
      }
      effects.splice(index, 1);
    }
  }
}

function updateHeat(dt) {
  if (state.player.heat <= 0) return;
  if (state.player.wanted > 0 && state.elapsed >= state.sfx.nextSirenAt) {
    audio.play("siren", {
      start: 560 + state.player.wanted * 55,
      end: 880 + state.player.wanted * 62,
      duration: 0.42,
      gain: 0.045 + state.player.wanted * 0.008,
      throttle: 0,
    });
    state.sfx.nextSirenAt = state.elapsed + Math.max(0.58, 1.55 - state.player.wanted * 0.14);
  }
  if (state.elapsed - state.player.lastCrimeTime < GAME_CONFIG.crime.heatDecayDelay) return;
  const target = getControlledObject().position;
  const copNearby = npcs.some((npc) => npc.isCop && !npc.dead && npc.object.position.distanceTo(target) < 32);
  const multiplier = copNearby ? 0.22 : GAME_CONFIG.crime.hiddenDecayMultiplier;
  setHeat(state.player.heat - GAME_CONFIG.crime.heatDecayPerSecond * multiplier * dt);
}

function openCasino() {
  if (state.phase !== "playing") return;
  lastModalFocus = document.activeElement;
  state.phase = "casino";
  dom.casino.classList.remove("hidden");
  dom.hud.classList.add("modal-open");
  byId("app").classList.add("modal-active");
  if (document.pointerLockElement) document.exitPointerLock();
  missionEvent("enterCasino");
  audio.play("casino");
  toast("Aurelia Casino floor — wagers use cash", "info");
  window.requestAnimationFrame(() => dom.casino.querySelector("[role='tab']")?.focus());
}

function closeCasino() {
  dom.casino.classList.add("hidden");
  dom.hud.classList.remove("modal-open");
  byId("app").classList.remove("modal-active");
  if (state.phase === "casino") state.phase = "playing";
  saveGame();
  (lastModalFocus instanceof HTMLElement ? lastModalFocus : dom.canvas).focus?.();
}

const SLOT_SYMBOLS = Object.freeze([
  { mark: "7", weight: 1, payout: 12 },
  { mark: "◆", weight: 2, payout: 7 },
  { mark: "BAR", weight: 3, payout: 5 },
  { mark: "♠", weight: 4, payout: 3 },
  { mark: "🍒", weight: 6, payout: 2 },
]);

function weightedSlotSymbol() {
  return rng.weighted(SLOT_SYMBOLS, (symbol) => symbol.weight);
}

function spinSlots() {
  const bet = state.casinoBet;
  if (state.player.cash < bet) {
    dom.slotsResult.textContent = `You need $${bet} to spin.`;
    audio.play("fail");
    return;
  }
  state.player.cash -= bet;
  const result = [weightedSlotSymbol(), weightedSlotSymbol(), weightedSlotSymbol()];
  dom.spin.disabled = true;
  [dom.reel1, dom.reel2, dom.reel3].forEach((reel) => reel.classList.add("spinning"));
  const settle = () => {
    [dom.reel1, dom.reel2, dom.reel3].forEach((reel, index) => {
      reel.textContent = result[index].mark;
      reel.classList.remove("spinning", "win");
    });
    let winnings = 0;
    if (result.every((symbol) => symbol.mark === result[0].mark)) winnings = bet * result[0].payout;
    else if (result.filter((symbol) => symbol.mark === "🍒").length === 2) winnings = bet;
    if (winnings > 0) {
      state.player.cash += winnings;
      [dom.reel1, dom.reel2, dom.reel3].forEach((reel) => reel.classList.add("win"));
      dom.slotsResult.textContent = `WINNER · $${winnings.toLocaleString()} paid`;
      audio.playWin();
      toast(`Casino win +$${winnings}`, "success");
    } else {
      dom.slotsResult.textContent = `No match · $${bet} wagered`;
      audio.play("fail");
    }
    dom.spin.disabled = false;
    saveGame();
  };
  if (TEST_MODE) settle();
  else window.setTimeout(settle, 620);
}

function createDeck() {
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const suits = ["♠", "♥", "♦", "♣"];
  return rng.shuffle(suits.flatMap((suit) => ranks.map((rank) => ({ rank, suit }))));
}

function handTotal(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    if (card.rank === "A") {
      total += 11;
      aces += 1;
    } else if (["J", "Q", "K"].includes(card.rank)) total += 10;
    else total += Number(card.rank);
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces -= 1;
  }
  return total;
}

function renderCards() {
  const game = state.blackjack;
  if (!game) {
    dom.dealerCards.replaceChildren();
    dom.playerCards.replaceChildren();
    return;
  }
  const renderHand = (container, hand, hideSecond = false) => {
    container.replaceChildren();
    hand.forEach((card, index) => {
      const node = document.createElement("span");
      node.className = `card ${card.suit === "♥" || card.suit === "♦" ? "red" : ""} ${hideSecond && index === 1 ? "hidden-card" : ""}`;
      node.textContent = hideSecond && index === 1 ? "?" : `${card.rank}${card.suit}`;
      container.append(node);
    });
  };
  renderHand(dom.dealerCards, game.dealer, !game.over);
  renderHand(dom.playerCards, game.player);
  dom.dealerTotal.textContent = game.over ? handTotal(game.dealer) : handTotal([game.dealer[0]]);
  dom.playerTotal.textContent = handTotal(game.player);
}

function dealBlackjack() {
  const bet = 50;
  if (state.player.cash < bet) {
    dom.blackjackResult.textContent = `You need $${bet} to deal.`;
    audio.play("fail");
    return;
  }
  state.player.cash -= bet;
  const deck = createDeck();
  state.blackjack = { bet, deck, player: [deck.pop(), deck.pop()], dealer: [deck.pop(), deck.pop()], over: false };
  dom.hit.disabled = false;
  dom.stand.disabled = false;
  dom.deal.disabled = true;
  dom.blackjackResult.textContent = "Hit or stand.";
  renderCards();
  audio.play("casino");
  const playerNatural = handTotal(state.blackjack.player) === 21;
  const dealerNatural = handTotal(state.blackjack.dealer) === 21;
  if (playerNatural && dealerNatural) finishBlackjack("push");
  else if (playerNatural) finishBlackjack("blackjack");
  else if (dealerNatural) finishBlackjack("dealerBlackjack");
}

function hitBlackjack() {
  const game = state.blackjack;
  if (!game || game.over) return;
  game.player.push(game.deck.pop());
  renderCards();
  audio.play("ui");
  if (handTotal(game.player) > 21) finishBlackjack("bust");
  else if (handTotal(game.player) === 21) standBlackjack();
}

function standBlackjack() {
  const game = state.blackjack;
  if (!game || game.over) return;
  while (handTotal(game.dealer) < 17) game.dealer.push(game.deck.pop());
  const playerTotal = handTotal(game.player);
  const dealerTotal = handTotal(game.dealer);
  if (dealerTotal > 21 || playerTotal > dealerTotal) finishBlackjack("win");
  else if (playerTotal === dealerTotal) finishBlackjack("push");
  else finishBlackjack("lose");
}

function finishBlackjack(result) {
  const game = state.blackjack;
  if (!game || game.over) return;
  game.over = true;
  let payout = 0;
  if (result === "blackjack") payout = Math.floor(game.bet * (1 + GAME_CONFIG.gambling.games.blackjack.blackjackPayout));
  else if (result === "win") payout = game.bet * 2;
  else if (result === "push") payout = game.bet;
  state.player.cash += payout;
  const messages = {
    blackjack: `BLACKJACK · $${payout} paid`,
    win: `You beat the dealer · $${payout} paid`,
    push: "Push · bet returned",
    dealerBlackjack: "Dealer blackjack · house wins.",
    lose: "Dealer wins this hand.",
    bust: "Bust · the house takes it.",
  };
  dom.blackjackResult.textContent = messages[result];
  dom.hit.disabled = true;
  dom.stand.disabled = true;
  dom.deal.disabled = false;
  renderCards();
  if (payout > game.bet) audio.playWin();
  else if (result === "push") audio.play("ui");
  else audio.play("fail");
  saveGame();
}

const ZONE_LABELS = Object.freeze({
  strip: "THE STRIP",
  "aurelia-casino": "AURELIA RESORT",
  "storm-drains": "FLOOD CHANNEL 17",
  airport: "SIN CITY AIR",
  "police-station": "LV METRO",
  fremont: "FREMONT AFTER DARK",
  desert: "MOJAVE OUTSKIRTS",
  "mojave-desert": "MOJAVE DESERT",
  "downtown-vegas": "DOWNTOWN LAS VEGAS",
  "occupation-zone": "DIRECTORATE CHECKPOINT",
  "nellis-air-force-base": "NELLIS AIR FORCE BASE",
  "area-51": "AREA 51 / GROOM LAKE",
  "alien-crash-site": "HENDERSON IMPACT SITE",
  "red-rock-canyon": "RED ROCK CANYON",
  henderson: "HENDERSON",
  "sunrise-manor": "SUNRISE MANOR",
  "greater-vegas": "GREATER VEGAS",
});

function updateNearby() {
  state.nearby = findNearbyInteraction();
  if (!state.nearby && !state.player.inVehicle) {
    const vehicle = findNearestVehicle();
    if (vehicle) {
      const aircraftLabel = vehicle.object.userData.vehicleType === "helicopter" ? "Pilot Metro Air Helicopter" : "Fly Desert Skipper";
      state.nearby = { kind: "vehicle", entity: vehicle, label: vehicle.kind === "plane" ? aircraftLabel : `Drive ${VEHICLE_TYPES[vehicle.object.userData.vehicleType]?.label || "vehicle"}` };
    }
  }
  dom.interactionPrompt.classList.toggle("hidden", !state.nearby);
  if (state.nearby) {
    dom.promptKey.textContent = state.nearby.kind === "vehicle" ? "F" : "E";
    dom.promptText.textContent = state.nearby.label;
  }
}

function drawMinimap() {
  const context = dom.minimap.getContext("2d");
  const width = dom.minimap.width;
  const height = dom.minimap.height;
  const center = getControlledObject().position;
  const scale = 1.08;
  context.clearRect(0, 0, width, height);
  context.save();
  context.translate(width / 2, height / 2);
  context.fillStyle = "rgba(4, 5, 12, .92)";
  context.beginPath();
  context.arc(0, 0, width / 2 - 3, 0, Math.PI * 2);
  context.fill();
  context.clip();

  context.strokeStyle = "rgba(255,255,255,.12)";
  context.lineWidth = 8;
  for (let road = -1400; road <= 1400; road += 52) {
    const x = (road - center.x) * scale;
    const z = (road - center.z) * scale;
    context.beginPath(); context.moveTo(x, -height); context.lineTo(x, height); context.stroke();
    context.beginPath(); context.moveTo(-width, z); context.lineTo(width, z); context.stroke();
  }
  context.strokeStyle = "rgba(244,210,90,.32)";
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo((0 - center.x) * scale, (-1360 - center.z) * scale);
  context.lineTo((0 - center.x) * scale, (1360 - center.z) * scale);
  context.stroke();

  const marker = (position, color, radius = 3, clampToEdge = true) => {
    let x = (position.x - center.x) * scale;
    let y = (position.z - center.z) * scale;
    const distance = Math.hypot(x, y);
    const edge = width * 0.43;
    const offscreen = distance > edge;
    if (offscreen && !clampToEdge) return;
    if (offscreen) {
      x = x / distance * edge;
      y = y / distance * edge;
    }
    context.fillStyle = color;
    context.beginPath(); context.arc(x, y, offscreen ? radius + 1.4 : radius, 0, Math.PI * 2); context.fill();
    if (offscreen) {
      context.strokeStyle = "rgba(255,255,255,.7)";
      context.lineWidth = 1;
      context.beginPath(); context.arc(x, y, radius + 3.2, 0, Math.PI * 2); context.stroke();
    }
  };
  marker(world.locations.casino.position, "#f5d563", 4.5);
  marker(world.locations.tunnelEntrance.position, "#64d7ff", 4.5);
  marker(world.locations.airport.position, "#b79cff", 4.5);
  marker(world.locations.occupationCheckpoint.position, "#ff315c", 4.8);
  marker(world.locations.nellis.position, "#7ac8ff", 4.8);
  marker(world.locations.area51.position, "#42ffc0", 5.2);
  marker(world.locations.alienCrash.position, "#9cff75", 4.2);
  for (const npc of npcs) if (npc.isCop && !npc.dead) marker(npc.object.position, "#568cff", 2.4, false);
  for (const vehicle of vehicles) if (!vehicle.object.userData.occupied) marker(vehicle.object.position, "rgba(255,255,255,.55)", 1.7, false);

  context.rotate(-(state.player.inVehicle?.object.rotation.y || playerObject.rotation.y));
  context.fillStyle = "#ff3fa4";
  context.beginPath();
  context.moveTo(0, -8); context.lineTo(5.5, 7); context.lineTo(0, 4); context.lineTo(-5.5, 7); context.closePath(); context.fill();
  context.restore();
}

function formatWorldTime() {
  const hours = (GAME_CONFIG.time.startHour + state.elapsed / GAME_CONFIG.time.dayLengthSeconds * 24) % 24;
  const whole = Math.floor(hours);
  const minutes = Math.floor((hours - whole) * 60);
  const displayHour = whole % 12 || 12;
  return `${displayHour}:${String(minutes).padStart(2, "0")} ${whole >= 12 ? "PM" : "AM"}`;
}

function updateInventoryStrip() {
  const weapons = ["unarmed", "pistol", "smg", "shotgun", "taser", "goldenPistol"].filter((id) => state.player.unlockedWeapons.has(id));
  const existing = [...dom.inventory.children].map((node) => node.dataset.weapon).join(",");
  if (existing === weapons.join(",")) {
    [...dom.inventory.children].forEach((node) => node.classList.toggle("active", node.dataset.weapon === state.player.weapon));
    return;
  }
  dom.inventory.replaceChildren();
  weapons.forEach((id, index) => {
    const button = document.createElement("button");
    button.dataset.weapon = id;
    button.className = id === state.player.weapon ? "active" : "";
    button.innerHTML = `<kbd>${index + 1}</kbd><span>${WEAPONS[id].label}</span>`;
    button.addEventListener("click", () => selectWeapon(index + 1));
    dom.inventory.append(button);
  });
}

function updateHud(force = false) {
  const controlled = getControlledObject();
  const detectedZone = world.zoneAt(controlled.position);
  if (detectedZone !== state.player.zone) {
    const wasTunnel = state.player.zone === "storm-drains";
    state.player.zone = detectedZone;
    if (!state.memory.discoveredZones.has(detectedZone)) {
      state.memory.discoveredZones.add(detectedZone);
      scheduleSave("district-discovered");
    }
    if (!wasTunnel && detectedZone === "storm-drains") missionEvent("enterTunnel");
    if (detectedZone === "occupation-zone") missionEvent("enterOccupation");
    if (detectedZone === "nellis-air-force-base") missionEvent("enterNellis");
    if (detectedZone === "area-51") missionEvent("enterArea51");
  }
  dom.zoneName.textContent = ZONE_LABELS[state.player.zone] || state.player.zone.toUpperCase();
  dom.worldTime.textContent = formatWorldTime();
  const memoryDiagnostics = persistence.getDiagnostics();
  const memoryStatus = memoryDiagnostics.pending || state.memory.dirty
    ? "SAVING"
    : memoryDiagnostics.status === "error"
      ? "RECOVERY"
      : state.memory.sessionStarted ? "SAVED" : "STANDBY";
  dom.bufferStatus.innerHTML = `<i></i> MEMORY ${memoryStatus} · BUFFER ${Math.round(state.buffer)}%`;
  dom.cash.textContent = `$${Math.max(0, Math.floor(state.player.cash)).toLocaleString()}`;
  dom.reputation.textContent = Math.floor(state.player.reputation);
  const pigHeads = [...dom.wanted.children];
  dom.wanted.dataset.level = String(state.player.wanted);
  dom.wanted.dataset.alert = String(state.player.wanted > 0);
  pigHeads.forEach((pig, index) => {
    pig.textContent = "🐷";
    pig.classList.toggle("active", index < state.player.wanted);
  });
  dom.wantedLabel.textContent = state.player.wanted ? `PIG METER ${state.player.wanted}/5 · HEAT ${Math.ceil(state.player.heat)}` : "PIG METER CLEAR";
  dom.healthFill.style.width = `${state.player.health}%`;
  dom.healthValue.textContent = Math.ceil(state.player.health);
  dom.armorFill.style.width = `${state.player.armor}%`;
  dom.armorValue.textContent = Math.ceil(state.player.armor);
  dom.staminaFill.style.width = `${state.player.stamina}%`;
  dom.staminaValue.textContent = Math.ceil(state.player.stamina);
  const weapon = WEAPONS[state.player.weapon] || WEAPONS.unarmed;
  const weaponIcons = { unarmed: "✦", pistol: "⌁", smg: "≋", shotgun: "═", taser: "ϟ" };
  dom.weaponIcon.textContent = weaponIcons[weapon.id] || "⌁";
  const weaponTiles = { unarmed: 0, pistol: 1, smg: 2, shotgun: 3, taser: 4 };
  const weaponTile = weaponTiles[weapon.id] ?? 1;
  const weaponColumn = weaponTile % 4;
  const weaponRow = Math.floor(weaponTile / 4);
  dom.weaponIcon.textContent = "";
  dom.weaponIcon.dataset.weapon = weapon.id;
  dom.weaponIcon.style.backgroundPosition = `${weaponColumn / 3 * 100}% ${weaponRow * 100}%`;
  dom.weaponName.textContent = weapon.label.toUpperCase();
  const ammo = state.player.ammo[weapon.id];
  dom.ammoCount.textContent = ammo ? `${ammo.magazine} / ${ammo.reserve}` : "—";
  dom.crosshair.classList.toggle("hidden", weapon.id === "unarmed" || Boolean(state.player.inVehicle));

  const step = STORY_STEPS[state.mission.index];
  dom.missionTitle.textContent = step.title;
  dom.missionText.textContent = step.text;
  dom.missionProgress.style.width = `${step.target ? state.mission.progress / step.target * 100 : state.mission.index / (STORY_STEPS.length - 1) * 100}%`;

  const vehicle = state.player.inVehicle;
  dom.vehicleHud.classList.toggle("hidden", !vehicle);
  if (vehicle) {
    const speed = vehicle.kind === "plane" ? vehicle.object.userData.speed * 2.237 : vehicle.object.userData.speedKph * 0.621371;
    dom.speedValue.textContent = String(Math.round(Math.abs(speed))).padStart(3, "0");
    dom.gearValue.textContent = vehicle.kind === "plane" ? (vehicle.object.userData.airborne ? "AIR" : "TAXI") : vehicle.object.userData.speed > 1 ? "D" : vehicle.object.userData.speed < -1 ? "R" : "N";
    dom.vehicleHealth.style.width = `${vehicle.object.userData.health / vehicle.object.userData.maxHealth * 100}%`;
  }
  updateInventoryStrip();
  updateNearby();
  updateWaypoint();
  drawMinimap();
  if (force) renderer.render(scene, camera);
}

function simulate(dt) {
  const clamped = Math.min(Math.max(0, dt), GAME_CONFIG.physics.maxFrameDelta);
  if (state.phase === "playing") {
    state.elapsed += clamped;
    state.frame += 1;
    const wasReloading = state.player.reloadTimer > 0;
    state.player.fireCooldown = Math.max(0, state.player.fireCooldown - clamped);
    state.player.reloadTimer = Math.max(0, state.player.reloadTimer - clamped);
    if (wasReloading && state.player.reloadTimer === 0) finishReload();
    if (state.player.inVehicle) updateControlledVehicle(clamped);
    else updateOnFoot(clamped);
    updateVehicleDynamicsSystems(clamped);
    if (state.player.inVehicle?.kind === "car") handleVehicleNpcImpacts(state.player.inVehicle);
    if (input.fireHeld) fireWeapon();
    updateNpcAi(clamped);
    updateNpcRelationships(clamped);
    updatePickups(clamped);
    updateEffects(clamped);
    updateHeat(clamped);
    world.update(clamped, state.elapsed, camera);
    touristCrowd.update(clamped, state.elapsed, camera);
    crowdAudioUpdateTimer -= clamped;
    if (crowdAudioUpdateTimer <= 0) {
      crowdAudio.update(getControlledObject().position, state.player.zone);
      crowdAudioUpdateTimer = 0.2;
    }
    updateWaypoint();
    if (state.player.inVehicle) clearTargetLock();
    else updateTargetLock(clamped);
    updateCamera(clamped);
    const onFoot = !state.player.inVehicle;
    const armed = state.player.weapon !== "unarmed";
    const reloading = onFoot && state.player.reloadTimer > 0;
    const firing = onFoot && armed && state.player.fireCooldown > 0.04;
    const aiming = onFoot && armed && input.fireHeld;
    const heavyCombat = state.player.weapon === "smg" || state.player.weapon === "shotgun";
    const walking = onFoot
      && Boolean(playerObject.userData.walking)
      && !reloading
      && !firing
      && !aiming;

    if (FORCE_IMAGE_VOXEL_3D_MODE) {
      updateDirectionalSprite(playerSprite, clamped, camera, { facingObject: playerObject });
      updateDirectionalSprite(playerWalkSprite, clamped, camera, { facingObject: playerObject });
      updateDirectionalSprite(playerCombatSprite, clamped, camera, { facingObject: playerObject });
      updateDirectionalSprite(playerHeavyCombatSprite, clamped, camera, { facingObject: playerObject });

      if (playerActionVisual) {
        playerActionVisual.visible = reloading;
        if (reloading) playerActionVisual.userData.setTile(6);
      }
      playerImageVoxelCombat.visible = !reloading && (firing || aiming) && !heavyCombat;
      if (playerImageVoxelCombat.visible) playerImageVoxelCombat.userData.setTile(playerCombatSprite.userData.spriteAtlas?.tile ?? 0);
      playerImageVoxelHeavyCombat.visible = !reloading && (firing || aiming) && heavyCombat;
      if (heavyCombat) playerHeavyCombatSprite.spriteController?.setAnimation(state.player.weapon);
      if (playerImageVoxelHeavyCombat.visible) playerImageVoxelHeavyCombat.userData.setTile(playerHeavyCombatSprite.userData.spriteAtlas?.tile ?? 0);
      playerImageVoxelWalk.visible = walking;
      if (playerWalkSprite.spriteController) playerWalkSprite.spriteController.playing = walking;
      if (playerImageVoxelWalk.visible) playerImageVoxelWalk.userData.setTile(playerWalkSprite.userData.spriteAtlas?.tile ?? 0);
      playerImageVoxelIdle.visible = onFoot && !reloading && !firing && !aiming && !walking;
      if (playerImageVoxelIdle.visible) playerImageVoxelIdle.userData.setTile(playerSprite.userData.spriteAtlas?.tile ?? 0);

      playerCombatSprite.visible = false;
      playerHeavyCombatSprite.visible = false;
      playerWalkSprite.visible = false;
      playerSprite.visible = false;
    } else {
      playerImageVoxelIdle.visible = false;
      playerImageVoxelWalk.visible = false;
      playerImageVoxelCombat.visible = false;
      playerImageVoxelHeavyCombat.visible = false;
      if (playerActionVisual) {
        playerActionVisual.visible = reloading;
        if (reloading) playerActionVisual.userData.setTile(6);
      }

      playerCombatSprite.visible = !reloading && (firing || aiming) && !heavyCombat;
      playerCombatSprite.spriteController?.setAnimationFrame(firing ? 1 : 0);
      playerHeavyCombatSprite.visible = !reloading && (firing || aiming) && heavyCombat;
      if (heavyCombat) playerHeavyCombatSprite.spriteController?.setAnimation(state.player.weapon);

      playerWalkSprite.visible = walking;
      if (playerWalkSprite.spriteController) playerWalkSprite.spriteController.playing = walking;

      playerSprite.visible = onFoot && !reloading && !firing && !aiming && !walking;
      updateDirectionalSprite(playerSprite, clamped, camera, { facingObject: playerObject });
      updateDirectionalSprite(playerWalkSprite, clamped, camera, { facingObject: playerObject });
      updateDirectionalSprite(playerCombatSprite, clamped, camera, { facingObject: playerObject });
      updateDirectionalSprite(playerHeavyCombatSprite, clamped, camera, { facingObject: playerObject });
    }
    realisticVisuals.update(camera);
    for (const npc of npcs) {
      if (npc.object.userData.supernaturalSprite) {
        updateDirectionalSprite(npc.object.userData.supernaturalSprite, clamped, camera, { facingObject: npc.object });
        const voxel = npc.object.userData.supernaturalImageVoxel;
        if (voxel?.userData?.setTile) voxel.userData.setTile(npc.object.userData.supernaturalSprite.userData.spriteAtlas?.tile ?? 0);
      }
      const aura = npc.object.userData.aura;
      if (aura?.halo) aura.halo.rotation.z += clamped * 0.52;
      if (aura?.light) aura.light.intensity = aura.baseIntensity * (0.84 + (Math.sin(state.elapsed * 3 + npc.index) + 1) * 0.08);
    }
    if (state.frame % 5 === 0) updateHud();
  } else {
    world.update(clamped, state.elapsed, camera);
  }
}

let lastFrameTime = performance.now();
let lastTestRenderTime = 0;
let lastIdleRenderTime = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) return;
  // World construction is synchronous. One completed bootstrap frame is enough
  // to validate the GPU path without starving the loading transition on an
  // embedded or software WebGL implementation.
  if (state.phase === "loading" && loadingRuntime.firstFrameRendered) return;
  if (TEST_MODE && now - lastTestRenderTime < 100) return;
  if (TEST_MODE) lastTestRenderTime = now;
  if (!TEST_MODE && state.phase !== "playing" && now - lastIdleRenderTime < 100) return;
  if (!TEST_MODE && state.phase !== "playing") lastIdleRenderTime = now;
  const rawDelta = Math.min(0.1, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;
  if (!TEST_MODE && state.phase === "playing") {
    state.accumulator += rawDelta;
    let steps = 0;
    while (state.accumulator >= FIXED_STEP && steps < 5) {
      simulate(FIXED_STEP);
      state.accumulator -= FIXED_STEP;
      steps += 1;
    }
    state.buffer = THREE.MathUtils.damp(state.buffer, steps >= 5 ? 86 : 100, 4, rawDelta);
  } else if (state.phase !== "playing") {
    world.update(rawDelta, state.elapsed, camera);
  }
  renderer.render(scene, camera);
  if (state.phase === "loading") acknowledgeLoadingFrame();
}
requestAnimationFrame(frame);

function renderGameToText() {
  const controlled = getControlledObject();
  const nearbyVehicle = findNearestVehicle();
  const weapon = WEAPONS[state.player.weapon] || WEAPONS.unarmed;
  const ammo = state.player.ammo[weapon.id];
  const dealNpc = npcs.find((npc) => npc.memoryId === dialogueRuntime.activeDealNpcId)
    || npcs.find((npc) => npc.errand)
    || state.dialogueNpc;
  const liveDeal = dealNpc?.errand || dealNpc?.lastDeal || null;
  const activeDeal = liveDeal ? {
    npcId: dealNpc.memoryId,
    status: liveDeal.status || liveDeal.stage || (liveDeal.completed ? "completed" : "active"),
    task: {
      type: liveDeal.requestedType || liveDeal.type || "none",
      itemId: liveDeal.itemType || null,
      requestedLabel: liveDeal.requestedLabel || null,
      quantity: liveDeal.quantity || 1,
    },
    paymentAmount: liveDeal.payment?.amount || 0,
    paymentStatus: liveDeal.payment?.status || null,
    deadline: liveDeal.deadlineToken || null,
    npcDistance: Number(controlled.position.distanceTo(dealNpc.object.position).toFixed(2)),
  } : null;
  const pendingAction = dialogueRuntime.pendingLanguageResult?.action || null;
  return JSON.stringify({
    game: "Sin City RP",
    phase: state.phase,
    role: state.role,
    time: Number(state.elapsed.toFixed(2)),
    zone: state.player.zone,
    player: {
      x: Number(controlled.position.x.toFixed(2)),
      y: Number(controlled.position.y.toFixed(2)),
      z: Number(controlled.position.z.toFixed(2)),
      mode: state.player.inVehicle?.kind || "onFoot",
      health: Math.ceil(state.player.health),
      armor: Math.ceil(state.player.armor),
      stamina: Math.ceil(state.player.stamina),
      cash: Math.floor(state.player.cash),
      reputation: Math.floor(state.player.reputation),
      wanted: state.player.wanted,
      pigMeter: state.player.wanted,
      heat: Number(state.player.heat.toFixed(1)),
      targetLock: state.lockedTarget ? { id: state.lockedTarget.memoryId, label: state.lockedTarget.profile.label } : null,
      weapon: weapon.id,
      ammo: ammo ? `${ammo.magazine}/${ammo.reserve}` : null,
      inventory: { ...state.player.inventory },
      unlockedWeapons: [...state.player.unlockedWeapons],
      visual: {
        system: playerSprite.userData.spriteAtlas?.system || "procedural",
        atlasState: playerSprite.userData.spriteAtlas?.loadState || "unknown",
        direction: playerSprite.userData.spriteAtlas?.direction || null,
      },
    },
    vehicle: state.player.inVehicle ? {
      type: state.player.inVehicle.object.userData.vehicleType,
      speed: Number(state.player.inVehicle.object.userData.speed.toFixed(1)),
      health: Math.ceil(state.player.inVehicle.object.userData.health),
      airborne: Boolean(state.player.inVehicle.object.userData.airborne),
      damage: state.player.inVehicle.dynamics ? {
        stage: state.player.inVehicle.dynamics.getState().damage.externalStage,
        structural: Number(state.player.inVehicle.dynamics.getState().damage.structural.toFixed(3)),
        engine: Number(state.player.inVehicle.dynamics.getState().damage.internal.engine.toFixed(3)),
        fuelSystem: Number(state.player.inVehicle.dynamics.getState().damage.internal.fuelSystem.toFixed(3)),
        doors: Object.fromEntries(Object.entries(state.player.inVehicle.dynamics.getState().doors).map(([id, door]) => [id, door.phase])),
      } : null,
    } : null,
    nearby: state.nearby?.label || null,
    nearbyVehicle: nearbyVehicle ? { type: nearbyVehicle.object.userData.vehicleType, distance: Number(playerObject.position.distanceTo(nearbyVehicle.object.position).toFixed(1)) } : null,
    mission: { title: STORY_STEPS[state.mission.index].title, progress: state.mission.progress, target: STORY_STEPS[state.mission.index].target || 1 },
    dialogue: {
      npcId: state.dialogueNpc?.memoryId || null,
      lastInput: dialogueRuntime.lastInput || null,
      lastIntent: dialogueRuntime.lastIntent,
      lastSource: dialogueRuntime.lastSource,
      voiceSupported: Boolean(SpeechRecognitionConstructor),
      listening: dialogueRuntime.listening,
      rememberedTurns: state.dialogueNpc ? conversationTurnsFor(state.dialogueNpc).length : 0,
      loyalty: state.dialogueNpc ? getNpcLoyaltyMeter(npcLoyaltyValue(state.dialogueNpc)) : null,
      pendingDeal: pendingAction ? {
        intent: pendingAction.intent,
        task: pendingAction.task ? { ...pendingAction.task } : null,
        amount: pendingAction.money?.amount || 0,
        status: dialogueRuntime.pendingLanguageResult.status,
      } : null,
      activeDeal,
      lastLanguageError: dialogueRuntime.lastLanguageError,
    },
    memory: {
      status: persistence.getDiagnostics().pending || state.memory.dirty ? "saving" : persistence.getDiagnostics().status,
      savedAt: persistence.getDiagnostics().lastSavedAt,
      revision: persistence.getDiagnostics().revision,
      recovered: Boolean(state.memory.loadDiagnostics?.recovered || persistence.getDiagnostics().recovered),
      discoveredZones: [...state.memory.discoveredZones],
      rememberedNpcs: npcs.filter((npc) => !npc.dynamic && (npc.interacted || conversationTurnsFor(npc).length > 0)).length,
    },
    world: {
      halfExtent: world.root.userData.config?.halfExtent || 450,
      vehicles: vehicles.length,
      vehicleTypes: vehicles.filter((vehicle) => vehicle.object?.userData?.health > 0).map((vehicle) => vehicle.object.userData.vehicleType || vehicle.spawn?.type || "vehicle"),
      npcs: npcs.filter((npc) => !npc.dead).length,
      cops: npcs.filter((npc) => npc.isCop && !npc.dead).length,
      occupationForces: npcs.filter((npc) => !npc.dead && npc.profile?.faction === "reptilian-occupation").length,
      extraterrestrials: npcs.filter((npc) => !npc.dead && npc.profile?.species === "extraterrestrial").length,
      supernatural: {
        jesusAlive: !jesusNpc.dead,
        devilAlive: !devilNpc.dead,
        demonsAlive: npcs.filter((npc) => npc.specialKind === "demon" && !npc.dead).length,
        corruptedPeople: npcs.filter((npc) => !npc.specialKind && (npc.object.userData.corruption || 0) > 0).length,
        lastEventId: easterEggRuntime.lastUiEventId,
      },
      area51Hangars: world.expansion?.area51Manifest?.hangarCount || 0,
      area51Craft: world.expansion?.area51Manifest?.craftCount || 0,
      ambience: crowdAudio.snapshot(),
      pickupsAvailable: pickups.filter((pickup) => !pickup.collected).length,
      pickupLabels: pickups.filter((pickup) => !pickup.collected).map((pickup) => pickup.object.userData.label || pickup.kind),
      buffer: Math.round(state.buffer),
      renderer: {
        quality: TEST_MODE ? "test" : RENDER_QUALITY,
        pixelRatio: Number(renderer.getPixelRatio().toFixed(2)),
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        contextLost: Boolean(renderer.getContext()?.isContextLost?.()),
      },
    },
    modal: state.phase === "casino" ? "casino" : state.phase === "dialogue" ? "dialogue" : null,
    lastToast: state.lastToast,
  });
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (milliseconds) => {
  const seconds = Math.max(0, Number(milliseconds) || 0) / 1000;
  const fullSteps = Math.floor(seconds / FIXED_STEP + 1e-9);
  for (let index = 0; index < fullSteps; index += 1) simulate(FIXED_STEP);
  const remainder = seconds - fullSteps * FIXED_STEP;
  if (remainder > 1e-8) simulate(remainder);
  updateHud(true);
  return renderGameToText();
};

function persistenceSnapshot() {
  const liveDiagnostics = persistence.getDiagnostics();
  const loadDiagnostics = state.memory.loadDiagnostics || {};
  const npcMemory = npcs.filter((npc) => !npc.dynamic).map((npc) => ({
    id: npc.memoryId,
    memoryId: npc.memoryId,
    profileId: npc.profile.id,
    trust: finiteMemoryNumber(npc.object.userData.trust, npc.profile.trust ?? 35),
    fear: finiteMemoryNumber(npc.object.userData.fear, 0),
    loyalty: npcLoyaltyValue(npc),
    loyaltyTier: npcLoyaltyTier(npcLoyaltyValue(npc)),
    relationship: sanitizeNpcRelationship(relationshipForNpc(npc)),
    interacted: Boolean(npc.interacted),
    interactionCount: conversationTurnsFor(npc).filter((turn) => turn.speaker === "player").length,
    conversation: conversationTurnsFor(npc).map((turn) => ({ ...turn })),
    mind: npcMindFor(npc),
    dead: Boolean(npc.dead),
  }));
  const diagnostics = {
    ...liveDiagnostics,
    saveKey: ACTIVE_SAVE_KEY,
    recovered: Boolean(loadDiagnostics.recovered || liveDiagnostics.recovered),
    error: loadDiagnostics.error || liveDiagnostics.error || null,
    status: loadDiagnostics.error && !state.memory.sessionStarted ? "recovery-required" : liveDiagnostics.status,
  };
  return {
    saveKey: ACTIVE_SAVE_KEY,
    diagnostics,
    role: state.role,
    player: {
      cash: state.player.cash,
      reputation: state.player.reputation,
      position: cleanMemoryPosition(getControlledObject().position),
      zone: state.player.zone,
    },
    cash: state.player.cash,
    reputation: state.player.reputation,
    position: cleanMemoryPosition(getControlledObject().position),
    zone: state.player.zone,
    discoveredZones: [...state.memory.discoveredZones],
    npcMemory,
    npcs: npcMemory,
    conversations: sanitizeConversationMemory(state.memory.conversations),
    npcMinds: sanitizeNpcMindMemory(state.memory.npcMinds),
    memory: {
      sessionStarted: state.memory.sessionStarted,
      hydrated: state.memory.hydrated,
      dirty: state.memory.dirty,
      discoveredZones: [...state.memory.discoveredZones],
      npcs: npcMemory,
      conversations: sanitizeConversationMemory(state.memory.conversations),
      npcMinds: sanitizeNpcMindMemory(state.memory.npcMinds),
    },
  };
}

function setPersistenceProbe({ cashDelta = 0, reputationDelta = 0, npcIndex = 0, trustDelta = 0, discoveredZone = "test-memory" } = {}) {
  if (!state.memory.sessionStarted) return persistenceSnapshot();
  state.player.cash += finiteMemoryNumber(cashDelta, 0);
  state.player.reputation += finiteMemoryNumber(reputationDelta, 0);
  const npc = npcs.filter((candidate) => !candidate.dynamic)[Math.max(0, Math.floor(finiteMemoryNumber(npcIndex, 0)))] || npcs.find((candidate) => !candidate.dynamic);
  if (npc) {
    npc.object.userData.trust = finiteMemoryNumber(npc.object.userData.trust, npc.profile.trust ?? 35) + finiteMemoryNumber(trustDelta, 0);
    npc.interacted = true;
    npc.talkRewarded = true;
    rememberConversation(npc, "player", "Remember me when the neon comes back on.", "memory-probe");
    rememberConversation(npc, "npc", "I remember. This city does not erase a debt.", "memory-probe");
  }
  state.memory.discoveredZones.add(String(discoveredZone));
  state.memory.dirty = true;
  updateHud(true);
  return persistenceSnapshot();
}

window.__SIN_CITY_TEST__ = Object.freeze({
  start: (role = "drifter") => {
    const uiRole = role === "highRoller" ? "highroller" : role;
    const card = document.querySelector(`[data-role="${uiRole}"]`) || document.querySelector("[data-role='drifter']");
    document.querySelectorAll(".role-card").forEach((node) => {
      node.classList.toggle("selected", node === card);
      node.setAttribute("aria-pressed", String(node === card));
    });
    startGame();
    return JSON.parse(renderGameToText());
  },
  teleport: (location) => {
    const target = world.locations[location];
    if (!target || state.player.inVehicle) return false;
    playerObject.position.copy(target.position);
    playerObject.position.y = getGroundHeight(playerObject.position) + 0.42;
    if (target.zone === "storm-drains") {
      state.cameraYaw = -Math.PI / 2;
      playerObject.rotation.y = -Math.PI / 2;
    } else {
      const showcaseYaw = location === "nellis" ? Math.PI / 2 : location === "area51" ? Math.PI : 0;
      state.cameraYaw = showcaseYaw;
      playerObject.rotation.y = showcaseYaw;
    }
    updateCamera(0, true);
    updateHud(true);
    return true;
  },
  teleportToVehicle: (type) => {
    const target = vehicles.find((vehicle) => !vehicle.object.userData.occupied && (!type || vehicle.object.userData.vehicleType === type || vehicle.kind === type));
    if (!target || state.player.inVehicle) return false;
    playerObject.position.copy(target.object.position).add(new THREE.Vector3(2, 0, 0));
    playerObject.position.y = getGroundHeight(playerObject.position) + 0.42;
    updateCamera(0, true);
    updateHud(true);
    return true;
  },
  teleportToNpc: (profileId) => {
    if (state.player.inVehicle) return false;
    const target = npcs.find((npc) => !npc.dead && (!profileId || npc.profile.id === profileId));
    if (!target) return false;
    playerObject.position.copy(target.object.position).add(new THREE.Vector3(0, 0, 2.6));
    playerObject.position.y = getGroundHeight(playerObject.position) + 0.42;
    state.cameraYaw = 0;
    playerObject.rotation.y = 0;
    updateCamera(0, true);
    updateHud(true);
    return true;
  },
  teleportToPickup: (kind) => {
    if (state.player.inVehicle) return false;
    const target = pickups.find((pickup) => !pickup.collected && (!kind || pickup.kind === kind));
    if (!target) return false;
    playerObject.position.copy(target.object.position);
    playerObject.position.y = getGroundHeight(playerObject.position) + 0.42;
    updateCamera(0, true);
    updateHud(true);
    return true;
  },
  addHeat,
  openCasino: () => {
    if (state.phase === "playing") openCasino();
  },
  closeCasino,
  saveNow: () => {
    flushSave("test-save-now");
    return persistenceSnapshot();
  },
  persistenceSnapshot,
  setPersistenceProbe,
  submitDialogueText: (text) => submitDialogueText(text, "test"),
  snapshot: () => JSON.parse(renderGameToText()),
});

function trapPanelFocus(event, panel) {
  if (event.key !== "Tab" || !panel) return false;
  const focusable = [...panel.querySelectorAll("button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex='-1'])")]
    .filter((element) => element.offsetParent !== null);
  if (!focusable.length) return false;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
  return true;
}

function handleKeyDown(event) {
  if (event.key === "Tab") {
    const panel = state.phase === "dialogue" ? dom.dialogue : state.phase === "casino" ? dom.casino : state.phase === "paused" ? dom.pause : null;
    if (panel) trapPanelFocus(event, panel);
  }
  const textEntry = event.target instanceof HTMLElement
    && Boolean(event.target.closest("input, textarea, [contenteditable='true']"));
  if (textEntry) {
    if (event.code === "Escape" && state.phase === "dialogue") closeDialogue();
    return;
  }
  input.keys.add(event.code);
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(event.code)) event.preventDefault();
  if (event.code === "Enter" && state.phase === "menu") startGame();
  if (event.code === "Escape") {
    if (state.phase === "dialogue") closeDialogue();
    else if (state.phase === "casino") closeCasino();
    else pauseGame();
  }
  if (state.phase === "dialogue" && ["Digit1", "Digit2", "Digit3"].includes(event.code)) {
    resolveDialogue({ Digit1: "talk", Digit2: "persuade", Digit3: "bribe" }[event.code]);
    return;
  }
  if (state.phase !== "playing" || event.repeat) return;
  if (event.code === "KeyE") interact();
  if (event.code === "KeyF") enterOrExitVehicle();
  if (event.code === "KeyR") reloadWeapon();
  if (event.code === "KeyM") {
    const enabled = audio.toggle();
    crowdAudio.setMuted(!enabled);
    toast(`Audio ${enabled ? "enabled" : "muted"}`, "info");
  }
  if (/^Digit[1-6]$/.test(event.code)) selectWeapon(Number(event.code.slice(-1)));
}

function handleKeyUp(event) {
  input.keys.delete(event.code);
}

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", () => {
  input.keys.clear();
  input.fireHeld = false;
  input.touchX = 0;
  input.touchY = 0;
  input.touchAscend = false;
  input.touchDescend = false;
});

dom.canvas.addEventListener("click", (event) => {
  if (state.phase === "playing" && event.pointerType !== "touch" && !document.pointerLockElement) dom.canvas.requestPointerLock?.();
  audio.unlock();
  void crowdAudio.unlock().catch(() => {});
});
dom.canvas.addEventListener("mousedown", (event) => {
  if (event.button === 2 && state.phase === "playing") {
    event.preventDefault();
    toggleTargetLock();
    return;
  }
  if (event.button !== 0 || state.phase !== "playing") return;
  input.fireHeld = true;
  fireWeapon();
});
dom.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
window.addEventListener("mouseup", (event) => {
  if (event.button === 0) input.fireHeld = false;
});
document.addEventListener("pointerlockchange", () => {
  input.pointerLocked = document.pointerLockElement === dom.canvas;
});
document.addEventListener("mousemove", (event) => {
  if (!input.pointerLocked || state.phase !== "playing") return;
  state.cameraYaw -= event.movementX * GAME_CONFIG.camera.lookSensitivity;
  state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch - event.movementY * GAME_CONFIG.camera.lookSensitivity, GAME_CONFIG.camera.minPitch, GAME_CONFIG.camera.maxPitch);
});

let touchLookPointer = null;
let touchLookX = 0;
let touchLookY = 0;
dom.canvas.addEventListener("pointerdown", (event) => {
  if (event.pointerType !== "touch" || state.phase !== "playing") return;
  touchLookPointer = event.pointerId;
  touchLookX = event.clientX;
  touchLookY = event.clientY;
  dom.canvas.setPointerCapture?.(event.pointerId);
});
dom.canvas.addEventListener("pointermove", (event) => {
  if (event.pointerId !== touchLookPointer) return;
  const dx = event.clientX - touchLookX;
  const dy = event.clientY - touchLookY;
  touchLookX = event.clientX;
  touchLookY = event.clientY;
  state.cameraYaw -= dx * GAME_CONFIG.camera.lookSensitivity * 1.55;
  state.cameraPitch = THREE.MathUtils.clamp(state.cameraPitch - dy * GAME_CONFIG.camera.lookSensitivity * 1.55, GAME_CONFIG.camera.minPitch, GAME_CONFIG.camera.maxPitch);
});
const releaseTouchLook = (event) => {
  if (event.pointerId === touchLookPointer) touchLookPointer = null;
};
dom.canvas.addEventListener("pointerup", releaseTouchLook);
dom.canvas.addEventListener("pointercancel", releaseTouchLook);

document.querySelectorAll(".role-card").forEach((card) => card.addEventListener("click", () => {
  document.querySelectorAll(".role-card").forEach((node) => {
    node.classList.toggle("selected", node === card);
    node.setAttribute("aria-pressed", String(node === card));
  });
  audio.play("ui");
}));
dom.startButton.addEventListener("click", startGame);
dom.resume.addEventListener("click", () => pauseGame(false));
dom.restart.addEventListener("click", () => {
  persistence.reset([ACTIVE_SAVE_KEY, RECOVERY_SAVE_KEY, ...LEGACY_SAVE_KEYS]);
  state.phase = "restarting";
  dom.casino.classList.add("hidden");
  dom.dialogue.classList.add("hidden");
  dom.hud.classList.remove("modal-open");
  byId("app").classList.remove("modal-active");
  resetSimulationEntities();
  resetPlayer(state.role);
  state.elapsed = 0;
  state.accumulator = 0;
  state.frame = 0;
  state.buffer = 100;
  state.memory.discoveredZones = new Set([state.player.zone]);
  state.memory.conversations = Object.create(null);
  state.memory.loadDiagnostics = null;
  state.memory.sessionStarted = true;
  state.memory.hydrated = true;
  state.memory.dirty = true;
  input.keys.clear();
  input.fireHeld = false;
  state.phase = "playing";
  dom.pause.classList.add("hidden");
  toast("The night has been restarted.", "success");
  updateHud(true);
  saveGame("restart-night");
});
document.querySelectorAll("[data-close='dialogue']").forEach((button) => button.addEventListener("click", closeDialogue));
document.querySelectorAll("[data-close='casino']").forEach((button) => button.addEventListener("click", closeCasino));
dom.dialogueComposer.addEventListener("submit", (event) => {
  event.preventDefault();
  event.stopPropagation();
  submitDialogueText(dom.dialogueInput.value, "text");
});
dom.dialogueMic.addEventListener("click", (event) => {
  event.preventDefault();
  toggleDialogueVoice();
});
document.querySelectorAll(".casino-tabs button").forEach((button) => button.addEventListener("click", () => {
  document.querySelectorAll(".casino-tabs button").forEach((tab) => {
    tab.classList.toggle("active", tab === button);
    tab.setAttribute("aria-selected", String(tab === button));
  });
  const slots = button.dataset.game === "slots";
  dom.slotsGame.classList.toggle("hidden", !slots);
  dom.blackjackGame.classList.toggle("hidden", slots);
  audio.play("ui");
}));
document.querySelectorAll("[data-bet]").forEach((button) => button.addEventListener("click", () => {
  state.casinoBet = Number(button.dataset.bet);
  document.querySelectorAll("[data-bet]").forEach((node) => node.classList.toggle("active", node === button));
  dom.slotsResult.textContent = `Wager set to $${state.casinoBet}. Match three to win.`;
  audio.play("ui");
}));
dom.spin.addEventListener("click", spinSlots);
dom.deal.addEventListener("click", dealBlackjack);
dom.hit.addEventListener("click", hitBlackjack);
dom.stand.addEventListener("click", standBlackjack);
document.querySelectorAll("#touch-controls button").forEach((button) => {
  const release = () => {
    if (button.dataset.action === "ascend") input.touchAscend = false;
    if (button.dataset.action === "descend") input.touchDescend = false;
    if (button.dataset.action === "fire") input.fireHeld = false;
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    const action = button.dataset.action;
    if (action === "interact") interact();
    else if (action === "vehicle") enterOrExitVehicle();
    else if (action === "ascend") input.touchAscend = true;
    else if (action === "descend") input.touchDescend = true;
    else if (action === "reload") reloadWeapon();
    else if (action === "fire") {
      input.fireHeld = true;
      fireWeapon();
    }
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});

const touchStick = byId("touch-stick");
const touchKnob = touchStick?.querySelector("i");
let touchStickPointer = null;
function updateTouchStick(event) {
  const rect = touchStick.getBoundingClientRect();
  const radius = rect.width * 0.34;
  const dx = event.clientX - (rect.left + rect.width / 2);
  const dy = event.clientY - (rect.top + rect.height / 2);
  const length = Math.hypot(dx, dy) || 1;
  const scale = Math.min(1, radius / length);
  const x = dx * scale;
  const y = dy * scale;
  input.touchX = THREE.MathUtils.clamp(x / radius, -1, 1);
  input.touchY = THREE.MathUtils.clamp(y / radius, -1, 1);
  if (touchKnob) touchKnob.style.transform = `translate(calc(-50% + ${x.toFixed(1)}px), calc(-50% + ${y.toFixed(1)}px))`;
}
function releaseTouchStick(event) {
  if (touchStickPointer !== null && event?.pointerId !== undefined && event.pointerId !== touchStickPointer) return;
  touchStickPointer = null;
  input.touchX = 0;
  input.touchY = 0;
  if (touchKnob) touchKnob.style.transform = "translate(-50%,-50%)";
}
touchStick?.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  touchStickPointer = event.pointerId;
  touchStick.setPointerCapture?.(event.pointerId);
  updateTouchStick(event);
});
touchStick?.addEventListener("pointermove", (event) => {
  if (event.pointerId === touchStickPointer) updateTouchStick(event);
});
touchStick?.addEventListener("pointerup", releaseTouchStick);
touchStick?.addEventListener("pointercancel", releaseTouchStick);
touchStick?.addEventListener("lostpointercapture", releaseTouchStick);
window.setInterval(() => scheduleSave("periodic-autosave"), 5000);
window.addEventListener("pagehide", () => flushSave("pagehide"));
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushSave("visibility-hidden");
});
window.addEventListener("beforeunload", () => flushSave("beforeunload"));

playerObject.visible = false;
const loadingRuntime = {
  firstFrameRendered: false,
  finished: false,
  finishTimer: null,
  fallbackTimer: null,
};

function setLoadingStage(progress, label) {
  dom.loadProgress.style.width = `${progress}%`;
  dom.loadStatus.textContent = label;
}

function finishLoading() {
  if (loadingRuntime.finished) return;
  loadingRuntime.finished = true;
  window.clearTimeout(loadingRuntime.finishTimer);
  window.clearTimeout(loadingRuntime.fallbackTimer);
  setLoadingStage(100, "Sin City is live.");
  dom.loading.classList.remove("active");
  dom.loading.classList.add("hidden");
  dom.start.classList.remove("hidden");
  dom.start.classList.add("active");
  state.phase = "menu";
  window.__gameReady = true;
}

function acknowledgeLoadingFrame() {
  if (loadingRuntime.firstFrameRendered) return;
  loadingRuntime.firstFrameRendered = true;
  setLoadingStage(92, "Graphics online. Opening the city…");
  loadingRuntime.finishTimer = window.setTimeout(finishLoading, TEST_MODE ? 0 : 140);
}

window.__gameReady = false;
setLoadingStage(28, "Building Greater Las Vegas…");
// Backgrounded tabs can suppress requestAnimationFrame. The watchdog keeps the
// player from being trapped behind a permanent loading overlay.
loadingRuntime.fallbackTimer = window.setTimeout(finishLoading, TEST_MODE ? 800 : 4000);
