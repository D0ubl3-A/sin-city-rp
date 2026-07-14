/**
 * Data-driven visual asset registry for Sin City RP.
 *
 * The registry deliberately separates visual lookup from entity construction. Every
 * lookup returns renderable metadata, including a procedural fallback, so a missing
 * generated file can never turn an entity invisible.
 */

const REGISTRY_SCHEMA_VERSION = 1;
const ASSET_VERSION = 1;
const ASSET_ROOT = "/assets";

const deepFreeze = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  Object.getOwnPropertyNames(value).forEach((key) => deepFreeze(value[key], seen));
  return Object.freeze(value);
};

const copy = (value) => {
  if (Array.isArray(value)) return value.map(copy);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, copy(item)]));
  }
  return value;
};

const DIRECTIONAL_LAYOUT = deepFreeze({
  kind: "directional-atlas",
  columns: 4,
  rows: 2,
  frameCount: 8,
  order: ["south", "south-west", "west", "north-west", "north", "north-east", "east", "south-east"],
  origin: "top-left",
});

const TEXTURE_LAYOUT = deepFreeze({
  kind: "surface-texture",
  columns: 1,
  rows: 1,
  frameCount: 1,
  wrap: "repeat",
  colorSpace: "srgb",
});

const SPRITE_MATERIAL = deepFreeze({
  transparent: true,
  alphaTest: 0.08,
  depthTest: true,
  depthWrite: true,
  toneMapped: true,
  polygonOffset: false,
});

const SURFACE_MATERIAL = deepFreeze({
  transparent: false,
  alphaTest: 0,
  depthTest: true,
  depthWrite: true,
  toneMapped: true,
  polygonOffset: false,
});

const STATUS_VALUES = new Set(["generated", "ready", "planned", "fallback", "disabled"]);
const CATEGORY_VALUES = new Set(["character", "vehicle", "weapon", "pickup", "building"]);

const slugify = (value) => String(value ?? "")
  .trim()
  .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
  .replace(/[^a-zA-Z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "")
  .toLowerCase();

const token = (value) => slugify(value).replace(/-/g, "");

const versionUrl = (url, version) => {
  if (!url) return null;
  const text = String(url);
  if (/(?:^|[-_.])v\d+(?:[./_-]|$)|[?&](?:v|version)=\d+/i.test(text)) return text;
  return `${text}${text.includes("?") ? "&" : "?"}v=${version}`;
};

const normalizeColors = (colors, fallback = [0xff3fa4, 0x27d9ff, 0x151923]) => {
  const normalized = (Array.isArray(colors) ? colors : [colors])
    .map((color) => typeof color === "string" ? Number.parseInt(color.replace(/^#|0x/i, ""), 16) : Number(color))
    .filter((color) => Number.isFinite(color))
    .map((color) => Math.max(0, Math.min(0xffffff, Math.round(color))));
  return normalized.length ? normalized : [...fallback];
};

const inferCategory = (key) => String(key).split(".")[0];

const defaultProceduralShape = (category) => ({
  character: "capsule-rig",
  vehicle: "vehicle-box-rig",
  weapon: "weapon-box-rig",
  pickup: "glowing-pickup-rig",
  building: "facade-color-grid",
}[category] || "debug-marker");

const makeEntry = (key, definition = {}, source = "default") => {
  const category = definition.category || inferCategory(key);
  const version = Math.max(1, Math.floor(Number(definition.version) || ASSET_VERSION));
  const fallbackColors = normalizeColors(definition.fallbackColors ?? definition.fallback?.colors);
  const directional = definition.layout?.kind === "directional-atlas"
    || (!definition.layout && category !== "building");
  const layout = copy(definition.layout || (directional ? DIRECTIONAL_LAYOUT : TEXTURE_LAYOUT));
  const material = {
    ...(directional ? SPRITE_MATERIAL : SURFACE_MATERIAL),
    ...(definition.material || {}),
  };
  const scale = Array.isArray(definition.scale) && definition.scale.length >= 2
    ? [Number(definition.scale[0]) || 1, Number(definition.scale[1]) || 1]
    : [1, 1];
  const fallback = {
    kind: "procedural",
    shape: definition.fallback?.shape || defaultProceduralShape(category),
    emissive: Boolean(definition.fallback?.emissive ?? category === "pickup"),
    label: definition.fallback?.label || `${category} fallback`,
    ...(definition.fallback || {}),
    colors: [...fallbackColors],
  };

  return {
    key,
    category,
    version,
    url: versionUrl(definition.url, version),
    layout,
    scale,
    feetOffset: Number.isFinite(Number(definition.feetOffset)) ? Number(definition.feetOffset) : 0,
    material,
    fallbackColors,
    fallback,
    status: definition.status || "planned",
    source,
    tags: Array.isArray(definition.tags) ? [...new Set(definition.tags.map(String))] : [],
    ...(category === "character" && definition.poses ? { poses: definition.poses } : {}),
  };
};

const defaultAssetSeeds = {};
const seed = (key, definition) => {
  if (defaultAssetSeeds[key]) throw new Error(`Duplicate visual asset key: ${key}`);
  defaultAssetSeeds[key] = makeEntry(key, definition);
};

import { createCharacterPoseManifest } from "./characterPoseManifest.js";

const CHARACTER_VISUALS = [
  ["player", [0xd89b75, 0x171c29, 0x15d4ff], [1.34, 2.66], "generated"],
  ["tourist", [0xd8a073, 0x47a7e8, 0xffcf4a], [1.22, 2.48]],
  ["local", [0x9a654d, 0x6f52a8, 0x65e3c4], [1.23, 2.5]],
  ["casinoDealer", [0xb97755, 0xf0eee9, 0xc92d54], [1.2, 2.5]],
  ["highRoller", [0xe0ad85, 0x181b23, 0xe8c55c], [1.24, 2.55]],
  ["mechanic", [0x7e513b, 0x315b78, 0xe68a34], [1.3, 2.52]],
  ["tunnelRunner", [0x805440, 0x75613f, 0x9de28f], [1.25, 2.5]],
  ["security", [0x5e3c32, 0x202b3a, 0xd8b24d], [1.3, 2.56]],
  ["patrolOfficer", [0xb47b5c, 0x263d5a, 0xd7b64b], [1.32, 2.58]],
  ["pigEnforcer", [0x8d685a, 0x40182a, 0xff315c], [1.56, 2.67]],
  ["reptilianMarshal", [0x526a49, 0x182d31, 0x31ffc2], [1.4, 2.78]],
  ["nellisGuard", [0x8f6049, 0x39483c, 0xc7b86d], [1.34, 2.61]],
  ["alienObserver", [0x879a8d, 0x1b2730, 0x42ffc0], [1.16, 2.75]],
  ["area51Scientist", [0xc18a69, 0xd7d9d8, 0x5ee0ff], [1.22, 2.55]],
  ["detective", [0x8e5e49, 0xb7ac92, 0x446b93], [1.3, 2.58]],
];

CHARACTER_VISUALS.forEach(([id, colors, scale, status = "planned"]) => {
  const fileName = id === "player" ? "player-idle-8dir-v1.png" : `${slugify(id)}-8dir-v1.png`;
  seed(`character.${id}`, {
    category: "character",
    url: `${ASSET_ROOT}/sprites/characters/${fileName}`,
    layout: DIRECTIONAL_LAYOUT,
    scale,
    feetOffset: -0.04,
    material: SPRITE_MATERIAL,
    fallbackColors: colors,
    fallback: { shape: id === "pigEnforcer" ? "porcine-hybrid-rig" : id.includes("alien") || id.includes("reptilian") ? "alien-humanoid-rig" : "capsule-rig" },
    status,
    tags: ["npc", "eight-direction", id],
    poses: createCharacterPoseManifest(DIRECTIONAL_LAYOUT),
  });
});

const VEHICLE_VISUALS = [
  ["compact", [0x36a8a0, 0x303640], [3.85, 2.1], "car"],
  ["sedan", [0x5c6470, 0x244d7a], [4.75, 2.2], "car"],
  ["taxi", [0xf1b72d, 0x17191e], [4.85, 2.3], "service-car"],
  ["limousine", [0x111318, 0xd9b85f], [6.35, 2.35], "limousine"],
  ["muscle", [0xa31936, 0x17191e], [4.7, 2.15], "car"],
  ["sports", [0xef2d56, 0x22b8d6], [4.6, 1.95], "supercar"],
  ["suv", [0x243b32, 0xc7c0ab], [5.05, 2.55], "suv"],
  ["policeCruiser", [0x171a20, 0xe6edf7, 0x2d7cff], [4.95, 2.45], "police-car"],
  ["policeSuv", [0x14171d, 0xe6edf7, 0xff315c], [5.15, 2.65], "police-suv"],
  ["utilityVan", [0xc5c8c5, 0x3b4248], [5.25, 2.7], "van"],
  ["airportShuttle", [0xe8ebee, 0x27bfe5], [6.25, 2.85], "shuttle-bus"],
  ["streetMotorcycle", [0x1b2028, 0xff315c], [2.35, 1.65], "motorcycle"],
  ["dirtBike", [0xe36b28, 0x20242a], [2.25, 1.72], "dirt-bike"],
  ["bicycle", [0x19c7c9, 0x252a31], [1.95, 1.7], "bicycle"],
  ["atv", [0x4a563c, 0x16191c], [2.45, 1.75], "atv"],
  ["duneBuggy", [0xd7a43b, 0x2a2520], [3.55, 1.85], "dune-buggy"],
  ["offroadPickup", [0x7a3e2b, 0xd8c092], [5.25, 2.6], "offroad-pickup"],
  ["offroadSuv", [0x324335, 0xc4aa72], [5.0, 2.65], "offroad-suv"],
  ["privateJet", [0xe6e8ed, 0x394f72, 0xd2b05f], [12.8, 4.6], "aircraft"],
  ["plane", [0xe8e9e5, 0x36a8d8], [10.6, 4.1], "aircraft"],
  ["helicopter", [0x171c22, 0x315f88, 0xff315c], [8.2, 3.8], "rotorcraft"],
  ["ufo", [0x586862, 0x21ffb4, 0x14c8ff], [9.5, 3.8], "alien-craft"],
];

VEHICLE_VISUALS.forEach(([id, colors, scale, shape]) => {
  seed(`vehicle.${id}`, {
    category: "vehicle",
    url: `${ASSET_ROOT}/sprites/vehicles/${slugify(id)}-8dir-v1.png`,
    layout: DIRECTIONAL_LAYOUT,
    scale,
    feetOffset: -0.03,
    material: { ...SPRITE_MATERIAL, alphaTest: 0.06 },
    fallbackColors: colors,
    fallback: { shape },
    status: "planned",
    tags: ["vehicle", "eight-direction", shape],
  });
});

[
  ["policeCruiser", "occupation", [0x4b1627, 0xff315c, 0x16131a]],
  ["policeCruiser", "metro", [0x171a20, 0xe6edf7, 0x2d7cff]],
  ["policeSuv", "nellis-security", [0x303b34, 0xc7b86d, 0x121618]],
  ["policeSuv", "metro", [0x171a20, 0xe6edf7, 0xff315c]],
  ["utilityVan", "area51-research", [0xd7d9d8, 0x273039, 0x5ee0ff]],
  ["utilityVan", "drain-crew", [0xc5c8c5, 0xe68a34, 0x333941]],
  ["privateJet", "nellis-flyable", [0x56645c, 0xc7b86d, 0x20262a]],
].forEach(([id, variant, colors]) => {
  const base = defaultAssetSeeds[`vehicle.${id}`];
  seed(`vehicle.${id}.${variant}`, {
    ...base,
    url: `${ASSET_ROOT}/sprites/vehicles/${slugify(id)}-${variant}-8dir-v1.png`,
    fallbackColors: colors,
    tags: [...base.tags, variant],
    status: "planned",
  });
});

const WEAPON_VISUALS = [
  ["unarmed", [0xd89b75, 0x212631], [0.9, 0.9], "fists"],
  ["pistol", [0x252a31, 0x787f88, 0xffd36a], [1.05, 0.64], "pistol"],
  ["smg", [0x20242a, 0x555d67, 0xffbf42], [1.42, 0.76], "submachine-gun"],
  ["shotgun", [0x282522, 0x795b3e, 0xff8d35], [1.78, 0.72], "shotgun"],
  ["taser", [0x242a31, 0xd5b936, 0x55d9ff], [1.0, 0.62], "stun-device"],
];

WEAPON_VISUALS.forEach(([id, colors, scale, shape]) => seed(`weapon.${id}`, {
  category: "weapon",
  url: `${ASSET_ROOT}/sprites/weapons/${slugify(id)}-8dir-v1.png`,
  layout: DIRECTIONAL_LAYOUT,
  scale,
  feetOffset: 1.15,
  material: { ...SPRITE_MATERIAL, alphaTest: 0.12 },
  fallbackColors: colors,
  fallback: { shape },
  status: "planned",
  tags: ["weapon", "eight-direction", shape],
}));

const PICKUP_VISUALS = [
  ["cash", [0x55e68b, 0x19ff77], "cash-bundle"],
  ["medkit", [0xf4f5f7, 0xff4057], "medkit"],
  ["armor", [0x34506d, 0x45a9ff], "body-armor"],
  ["ammo", [0xb58a44, 0xffb238], "ammo-box"],
  ["casinoChips", [0xe33f78, 0xff4bab], "casino-chip-stack"],
  ["lockpick", [0xa8b1bd, 0xd9e4ff], "lockpick-case"],
  ["fuel", [0xd63c35, 0xff713f], "fuel-can"],
  ["weaponCrate", [0x252a32, 0xa05cff], "weapon-case"],
  ["contraband", [0xc6aa72, 0xffdc70], "sealed-package"],
  ["collectible", [0xffd64a, 0xffff8b], "neon-token"],
];

PICKUP_VISUALS.forEach(([id, colors, shape]) => seed(`pickup.${id}`, {
  category: "pickup",
  url: `${ASSET_ROOT}/sprites/pickups/${slugify(id)}-8dir-v1.png`,
  layout: DIRECTIONAL_LAYOUT,
  scale: id === "weaponCrate" ? [0.95, 0.82] : [0.68, 0.68],
  feetOffset: 0.05,
  material: { ...SPRITE_MATERIAL, depthWrite: false, alphaTest: 0.1 },
  fallbackColors: colors,
  fallback: { shape, emissive: true },
  status: "planned",
  tags: ["pickup", "eight-direction", shape],
}));

const BUILDING_FAMILIES = {
  "las-vegas-strip": ["default", "casino", "hotel", "retail", "parking"],
  "aurelia-casino": ["default", "casino", "hotel", "podium"],
  fremont: ["default", "historic", "casino", "retail"],
  "downtown-vegas": ["default", "office", "residential", "mixed-use", "parking"],
  "north-las-vegas": ["default", "residential", "industrial", "commercial"],
  "sunrise-manor": ["default", "residential", "strip-mall", "industrial"],
  henderson: ["default", "residential", "commercial", "resort"],
  "south-strip": ["default", "casino", "hotel", "warehouse"],
  airport: ["default", "terminal", "hangar", "service"],
  "police-station": ["default", "civic", "police"],
  "storm-drains": ["default", "tunnel", "concrete"],
  "nellis-air-force-base": ["default", "military", "hangar", "control-tower"],
  "area-51": ["default", "secret", "hangar", "bunker", "laboratory"],
  "occupation-zone": ["default", "occupation", "checkpoint"],
  "alien-crash-site": ["default", "alien", "wreckage"],
  "red-rock-canyon": ["default", "desert", "visitor-center"],
  "mojave-desert": ["default", "desert", "industrial"],
};

const DISTRICT_COLORS = {
  "las-vegas-strip": [0x171b29, 0xff3fa4, 0x27d9ff],
  "aurelia-casino": [0x201821, 0xe8c55c, 0xc92d54],
  fremont: [0x1d1930, 0xffb238, 0xa05cff],
  "downtown-vegas": [0x161c2b, 0x1d2637, 0x302238],
  "north-las-vegas": [0x242b34, 0x30343b, 0x2b2630],
  "sunrise-manor": [0x26313b, 0x2f3440, 0x342b35],
  henderson: [0x2d3036, 0x34343b, 0x2b3540],
  "south-strip": [0x171b29, 0x202c3a, 0x38293c],
  airport: [0x74736f, 0x182235, 0x1c7fd0],
  "police-station": [0x263d5a, 0xd7b64b, 0x2d7cff],
  "storm-drains": [0x5d5b55, 0x292725, 0x9de28f],
  "nellis-air-force-base": [0x303b34, 0x3f4850, 0xc7b86d],
  "area-51": [0x171b20, 0x273039, 0x5ee0ff],
  "occupation-zone": [0x4b1627, 0x8e0e38, 0xff315c],
  "alien-crash-site": [0x56675f, 0x21ffb4, 0x14c8ff],
  "red-rock-canyon": [0x5b4331, 0x8d6545, 0xd49b55],
  "mojave-desert": [0x5b4331, 0x3f342d, 0x9e7048],
};

Object.entries(BUILDING_FAMILIES).forEach(([district, styles]) => {
  styles.forEach((style) => seed(`building.${district}.${style}`, {
    category: "building",
    url: `${ASSET_ROOT}/textures/buildings/${district}-${style}-facade-v1.webp`,
    layout: { ...TEXTURE_LAYOUT, repeat: style === "hangar" || style === "warehouse" ? [2, 1] : [4, 3] },
    scale: [1, 1],
    feetOffset: 0,
    material: SURFACE_MATERIAL,
    fallbackColors: DISTRICT_COLORS[district],
    fallback: { shape: "facade-color-grid", emissive: ["casino", "hotel", "retail", "occupation", "alien"].includes(style) },
    status: "planned",
    tags: ["building", "facade", district, style],
  }));
});

const DEFAULT_ASSETS = deepFreeze(defaultAssetSeeds);
const runtimeAssets = new Map();
const fallbackCache = new Map();
const textureCache = new Map();

const CHARACTER_ALIASES = deepFreeze({
  player: "player",
  tourist: "tourist",
  civilian: "tourist",
  visitor: "tourist",
  local: "local",
  resident: "local",
  streetperformer: "local",
  performer: "local",
  pilot: "local",
  casinodealer: "casinoDealer",
  dealer: "casinoDealer",
  blackjack: "casinoDealer",
  highroller: "highRoller",
  casinoguest: "highRoller",
  mechanic: "mechanic",
  tunnelrunner: "tunnelRunner",
  drainscout: "tunnelRunner",
  tunnelsquatter: "tunnelRunner",
  smuggler: "tunnelRunner",
  informant: "tunnelRunner",
  underground: "tunnelRunner",
  security: "security",
  casinosecurity: "security",
  patrolofficer: "patrolOfficer",
  cop: "patrolOfficer",
  police: "patrolOfficer",
  pigenforcer: "pigEnforcer",
  reptilianpigcop: "pigEnforcer",
  occupationenforcer: "pigEnforcer",
  reptilianmarshal: "reptilianMarshal",
  nelliscommand: "reptilianMarshal",
  nellisguard: "nellisGuard",
  flightline: "nellisGuard",
  alienobserver: "alienObserver",
  alieninfiltrator: "alienObserver",
  groomobserver: "alienObserver",
  crashsurvivor: "alienObserver",
  area51scientist: "area51Scientist",
  researcher: "area51Scientist",
  detective: "detective",
});

const VEHICLE_ALIASES = deepFreeze({
  compact: "compact",
  hatchback: "compact",
  sedan: "sedan",
  taxi: "taxi",
  limousine: "limousine",
  limo: "limousine",
  muscle: "muscle",
  musclecar: "muscle",
  sports: "sports",
  sportscar: "sports",
  supercar: "sports",
  suv: "suv",
  policecruiser: "policeCruiser",
  policecar: "policeCruiser",
  policesuv: "policeSuv",
  utilityvan: "utilityVan",
  van: "utilityVan",
  airportshuttle: "airportShuttle",
  shuttle: "airportShuttle",
  bus: "airportShuttle",
  motorcycle: "streetMotorcycle",
  streetmotorcycle: "streetMotorcycle",
  streetbike: "streetMotorcycle",
  motorbike: "streetMotorcycle",
  dirtbike: "dirtBike",
  trailbike: "dirtBike",
  bicycle: "bicycle",
  bike: "bicycle",
  pedalbike: "bicycle",
  atv: "atv",
  quad: "atv",
  quadbike: "atv",
  dunebuggy: "duneBuggy",
  buggy: "duneBuggy",
  offroadpickup: "offroadPickup",
  pickuptruck: "offroadPickup",
  offroadtruck: "offroadPickup",
  offroadsuv: "offroadSuv",
  fourbyfour: "offroadSuv",
  privatejet: "privateJet",
  jet: "privateJet",
  plane: "plane",
  aircraft: "plane",
  helicopter: "helicopter",
  chopper: "helicopter",
  ufo: "ufo",
  aliencraft: "ufo",
});

const WEAPON_ALIASES = deepFreeze({
  unarmed: "unarmed",
  fists: "unarmed",
  melee: "unarmed",
  pistol: "pistol",
  handgun: "pistol",
  "9mm": "pistol",
  ninemm: "pistol",
  smg: "smg",
  compactsmg: "smg",
  submachinegun: "smg",
  shotgun: "shotgun",
  pumpshotgun: "shotgun",
  taser: "taser",
  stundevice: "taser",
  stunweapon: "taser",
});

const PICKUP_ALIASES = deepFreeze({
  ...Object.fromEntries(PICKUP_VISUALS.flatMap(([id]) => [
    [token(id), id],
    [token(slugify(id)), id],
  ])),
  casinochip: "casinoChips",
  cashroll: "cash",
  firstaid: "medkit",
  ammobox: "ammo",
  armorvest: "armor",
  weaponcase: "weaponCrate",
  lockpickset: "lockpick",
  fuelcan: "fuel",
  neontoken: "collectible",
});

const DISTRICT_ALIASES = deepFreeze({
  strip: "las-vegas-strip",
  lasvegasstrip: "las-vegas-strip",
  vegasstrip: "las-vegas-strip",
  aurelia: "aurelia-casino",
  aureliacasino: "aurelia-casino",
  casino: "aurelia-casino",
  fremont: "fremont",
  fremontstreet: "fremont",
  downtown: "downtown-vegas",
  downtownvegas: "downtown-vegas",
  northlasvegas: "north-las-vegas",
  sunrisemanor: "sunrise-manor",
  henderson: "henderson",
  southstrip: "south-strip",
  airport: "airport",
  sincityair: "airport",
  policestation: "police-station",
  lvmetro: "police-station",
  stormdrains: "storm-drains",
  draintunnels: "storm-drains",
  tunnels: "storm-drains",
  nellis: "nellis-air-force-base",
  nellisairforcebase: "nellis-air-force-base",
  area51: "area-51",
  groomlake: "area-51",
  occupation: "occupation-zone",
  occupationzone: "occupation-zone",
  aliencrashsite: "alien-crash-site",
  impactsite: "alien-crash-site",
  redrock: "red-rock-canyon",
  redrockcanyon: "red-rock-canyon",
  mojave: "mojave-desert",
  mojavedesert: "mojave-desert",
});

const STYLE_ALIASES = deepFreeze({
  default: "default",
  generic: "default",
  casino: "casino",
  hotel: "hotel",
  retail: "retail",
  parking: "parking",
  podium: "podium",
  historic: "historic",
  office: "office",
  residential: "residential",
  mixeduse: "mixed-use",
  industrial: "industrial",
  commercial: "commercial",
  stripmall: "strip-mall",
  resort: "resort",
  warehouse: "warehouse",
  terminal: "terminal",
  hangar: "hangar",
  service: "service",
  civic: "civic",
  police: "police",
  tunnel: "tunnel",
  concrete: "concrete",
  military: "military",
  controltower: "control-tower",
  secret: "secret",
  bunker: "bunker",
  laboratory: "laboratory",
  lab: "laboratory",
  occupation: "occupation",
  checkpoint: "checkpoint",
  alien: "alien",
  wreckage: "wreckage",
  desert: "desert",
  visitorcenter: "visitor-center",
});

const validateEntry = (entry) => {
  if (!entry.key || !/^[a-zA-Z0-9._-]+$/.test(entry.key)) throw new TypeError("Visual asset keys may only contain letters, numbers, dots, underscores, and hyphens");
  if (!CATEGORY_VALUES.has(entry.category)) throw new TypeError(`Unsupported visual asset category: ${entry.category}`);
  if (!STATUS_VALUES.has(entry.status)) throw new TypeError(`Unsupported visual asset status: ${entry.status}`);
  if (!["directional-atlas", "surface-texture"].includes(entry.layout?.kind)) throw new TypeError(`Unsupported layout for ${entry.key}`);
  if (entry.layout.kind === "directional-atlas" && (entry.layout.columns !== 4 || entry.layout.rows !== 2 || entry.layout.frameCount !== 8)) {
    throw new TypeError(`Directional asset ${entry.key} must use a 4x2 eight-direction atlas`);
  }
  return entry;
};

const getAsset = (key) => runtimeAssets.get(key) || DEFAULT_ASSETS[key] || null;

const proceduralFallback = (category, requestedKey, colors) => {
  const cacheKey = `${category}:${requestedKey}`;
  if (!fallbackCache.has(cacheKey)) {
    fallbackCache.set(cacheKey, deepFreeze(makeEntry(requestedKey, {
      category,
      version: ASSET_VERSION,
      url: null,
      layout: category === "building" ? TEXTURE_LAYOUT : DIRECTIONAL_LAYOUT,
      scale: category === "character" ? [1.25, 2.5] : category === "vehicle" ? [4.5, 2.25] : [1, 1],
      feetOffset: category === "weapon" ? 1.15 : 0,
      fallbackColors: colors,
      status: "fallback",
      tags: ["procedural-fallback", "missing-asset"],
    }, "fallback")));
  }
  return fallbackCache.get(cacheKey);
};

/**
 * Registers or overrides an asset at runtime without mutating the frozen defaults.
 */
export function registerVisualAsset(key, definition = {}) {
  const normalizedKey = String(key ?? "").trim();
  const base = getAsset(normalizedKey);
  const entry = makeEntry(normalizedKey, {
    ...(base ? copy(base) : {}),
    ...copy(definition),
    layout: { ...(base?.layout || {}), ...(definition.layout || {}) },
    material: { ...(base?.material || {}), ...(definition.material || {}) },
    fallback: { ...(base?.fallback || {}), ...(definition.fallback || {}) },
    status: definition.status || base?.status || "ready",
  }, "runtime");
  validateEntry(entry);
  const frozenEntry = deepFreeze(entry);
  runtimeAssets.set(normalizedKey, frozenEntry);
  textureCache.delete(normalizedKey);
  return frozenEntry;
}

/**
 * Resolves a character visual from a profile id/object plus optional serialized spawn.
 */
export function resolveCharacterVisual(profile, spawn = {}) {
  const profileValue = typeof profile === "object" ? profile?.id || profile?.profile || profile?.type : profile;
  const spawnValue = typeof spawn === "object" && spawn ? spawn : {};
  const spawnType = token(spawnValue.type || spawnValue.npcType);
  const spawnRole = token(spawnValue.role || spawnValue.occupation);

  let canonical;
  if (spawnType === "civilian" && spawnRole === "local") canonical = "local";
  const candidates = [
    profileValue,
    spawnValue.profileId,
    spawnValue.profile,
    spawnValue.npcProfile,
    spawnValue.type,
    spawnValue.role,
    spawnValue.occupation,
  ];
  for (const candidate of candidates) {
    canonical ||= CHARACTER_ALIASES[token(candidate)];
    if (canonical) break;
  }

  const requestedKey = `character.${canonical || slugify(profileValue || spawnValue.type || "unknown") || "unknown"}`;
  return getAsset(requestedKey) || proceduralFallback("character", requestedKey);
}

/** Returns a stable pose definition for a character visual and requested pose. */
export function resolveCharacterPose(profile, pose = "idle", spawn = {}) {
  const visual = resolveCharacterVisual(profile, spawn);
  const manifest = visual.poses || createCharacterPoseManifest(visual.layout);
  const key = typeof pose === "string" && manifest.poses?.[pose] ? pose : "idle";
  return { visual, manifest, pose: manifest.poses[key] || manifest.poses.idle };
}

/**
 * Resolves canonical and spawn-alias vehicle names, with optional livery variants.
 */
export function resolveVehicleVisual(type, variant) {
  const value = typeof type === "object" && type ? type : {};
  const rawType = typeof type === "object" ? value.vehicleType || value.type || value.kind : type;
  const rawVariant = variant ?? value.variant ?? value.livery;
  const canonical = VEHICLE_ALIASES[token(rawType)];
  const requestedVariant = slugify(rawVariant);
  if (!canonical) {
    return proceduralFallback("vehicle", `vehicle.${slugify(rawType) || "unknown"}`);
  }
  if (requestedVariant) {
    const variantAsset = getAsset(`vehicle.${canonical}.${requestedVariant}`);
    if (variantAsset) return variantAsset;
  }
  return getAsset(`vehicle.${canonical}`) || proceduralFallback("vehicle", `vehicle.${canonical}`);
}

export function resolveWeaponVisual(id) {
  const rawId = typeof id === "object" && id ? id.id || id.weapon || id.type : id;
  const canonical = WEAPON_ALIASES[token(rawId)];
  const requestedKey = `weapon.${canonical || slugify(rawId) || "unknown"}`;
  return getAsset(requestedKey) || proceduralFallback("weapon", requestedKey);
}

export function resolvePickupVisual(kind) {
  const rawKind = typeof kind === "object" && kind ? kind.kind || kind.id || kind.type : kind;
  const canonical = PICKUP_ALIASES[token(rawKind)];
  const requestedKey = `pickup.${canonical || slugify(rawKind) || "unknown"}`;
  return getAsset(requestedKey) || proceduralFallback("pickup", requestedKey);
}

export function resolveBuildingTexture(district, style) {
  const rawDistrict = typeof district === "object" && district ? district.district || district.zone || district.id : district;
  const rawStyle = typeof district === "object" && district ? style ?? district.style ?? district.facadeStyle ?? "default" : style ?? "default";
  const canonicalDistrict = DISTRICT_ALIASES[token(rawDistrict)];
  const canonicalStyle = STYLE_ALIASES[token(rawStyle || "default")];
  if (!canonicalDistrict || !canonicalStyle) {
    return proceduralFallback("building", `building.${slugify(rawDistrict) || "unknown"}.${slugify(rawStyle) || "default"}`);
  }
  const requestedKey = `building.${canonicalDistrict}.${canonicalStyle}`;
  return getAsset(requestedKey) || proceduralFallback("building", requestedKey, DISTRICT_COLORS[canonicalDistrict]);
}

const configureTexture = (THREE, texture, entry) => {
  texture.name = entry.key;
  texture.userData ||= {};
  texture.userData.visualAssetKey = entry.key;
  texture.userData.visualAssetVersion = entry.version;
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  if (entry.layout.kind === "surface-texture") {
    if (THREE.RepeatWrapping !== undefined) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    const repeat = entry.layout.repeat;
    if (Array.isArray(repeat) && texture.repeat?.set) texture.repeat.set(Number(repeat[0]) || 1, Number(repeat[1]) || 1);
    if (THREE.LinearMipmapLinearFilter !== undefined) texture.minFilter = THREE.LinearMipmapLinearFilter;
  } else {
    if (THREE.ClampToEdgeWrapping !== undefined) texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
    if (THREE.LinearFilter !== undefined) texture.magFilter = THREE.LinearFilter;
  }
  texture.needsUpdate = true;
  return texture;
};

/**
 * Preloads generated/ready assets by default. Planned URLs are opt-in to avoid
 * intentional 404 noise while image-generation batches are still being produced.
 */
export async function preloadVisualAssets(THREE, options = {}) {
  if (!THREE?.TextureLoader) throw new TypeError("preloadVisualAssets requires a Three.js namespace with TextureLoader");
  const snapshot = getVisualRegistrySnapshot();
  const keyFilter = options.keys ? new Set(options.keys.map(String)) : null;
  const categoryFilter = options.categories ? new Set(options.categories.map(String)) : null;
  const statusFilter = options.statuses
    ? new Set(options.statuses.map(String))
    : new Set(options.includePlanned ? ["generated", "ready", "planned"] : ["generated", "ready"]);
  const candidates = Object.values(snapshot.assets).filter((entry) => (
    entry.url
    && statusFilter.has(entry.status)
    && (!keyFilter || keyFilter.has(entry.key))
    && (!categoryFilter || categoryFilter.has(entry.category))
  ));
  const loader = options.loader || new THREE.TextureLoader(options.manager);
  if (options.crossOrigin && typeof loader.setCrossOrigin === "function") loader.setCrossOrigin(options.crossOrigin);
  const textures = new Map();
  const loaded = [];
  const failed = [];
  const cached = [];

  const loadOne = async (entry, index) => {
    if (!options.forceReload && textureCache.has(entry.key)) {
      const texture = textureCache.get(entry.key);
      textures.set(entry.key, texture);
      cached.push(entry.key);
      options.onProgress?.({ key: entry.key, index: index + 1, total: candidates.length, status: "cached" });
      return;
    }
    try {
      const texture = await new Promise((resolve, reject) => loader.load(entry.url, resolve, undefined, reject));
      configureTexture(THREE, texture, entry);
      textureCache.set(entry.key, texture);
      textures.set(entry.key, texture);
      loaded.push(entry.key);
      options.onProgress?.({ key: entry.key, index: index + 1, total: candidates.length, status: "loaded" });
    } catch (error) {
      const failure = {
        key: entry.key,
        url: entry.url,
        message: error instanceof Error ? error.message : String(error || "Texture load failed"),
        fallback: entry.fallback,
      };
      failed.push(failure);
      options.onProgress?.({ key: entry.key, index: index + 1, total: candidates.length, status: "failed", error: failure.message });
    }
  };

  await Promise.all(candidates.map(loadOne));
  const result = {
    textures,
    loaded: Object.freeze(loaded),
    cached: Object.freeze(cached),
    failed: Object.freeze(failed),
    requested: candidates.length,
    skipped: Object.keys(snapshot.assets).length - candidates.length,
  };
  if (options.strict && failed.length) {
    const error = new Error(`Failed to preload ${failed.length} visual asset${failed.length === 1 ? "" : "s"}`);
    error.failures = failed;
    error.result = result;
    throw error;
  }
  return result;
}

export function getVisualRegistrySnapshot() {
  const assets = { ...DEFAULT_ASSETS };
  runtimeAssets.forEach((entry, key) => { assets[key] = entry; });
  const orderedAssets = Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a.localeCompare(b)));
  const counts = { total: 0, defaults: Object.keys(DEFAULT_ASSETS).length, runtime: runtimeAssets.size, byCategory: {}, byStatus: {} };
  Object.values(orderedAssets).forEach((entry) => {
    counts.total += 1;
    counts.byCategory[entry.category] = (counts.byCategory[entry.category] || 0) + 1;
    counts.byStatus[entry.status] = (counts.byStatus[entry.status] || 0) + 1;
  });
  return deepFreeze({
    schemaVersion: REGISTRY_SCHEMA_VERSION,
    assetVersion: ASSET_VERSION,
    assets: copy(orderedAssets),
    counts,
  });
}
