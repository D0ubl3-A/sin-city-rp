const SCHEMA_VERSION = 1;
const MAX_TEXT_LENGTH = 360;
const MAX_CASH_OFFER = 5_000;
const MAX_DEADLINE_MS = 7 * 24 * 60 * 60 * 1_000;
const DAY_MS = 24 * 60 * 60 * 1_000;

const INTENTS = new Set(["none", "fetch_item", "create_item", "give_money", "social_plan", "time_reference"]);
const TASK_TYPES = new Set(["fetch_item", "create_item"]);
const ITEM_CATEGORIES = new Set(["pickup", "vehicle", "tool", "consumable"]);
const MONEY_TIMINGS = new Set(["upfront", "gift", "on_completion"]);
const TEMPORAL_KINDS = new Set(["relative_day", "day_window"]);
const TEMPORAL_ROLES = new Set(["deadline", "social_window"]);

const SPEC_KEYS = new Set(["id", "category", "aliases", "maxQuantity", "maxCashOffer", "taskTypes"]);
const ACTION_KEYS = new Set(["version", "intent", "sourceText", "task", "temporal", "social", "money"]);
const TASK_KEYS = new Set(["type", "itemId", "quantity", "requestSummary", "requestedLabel"]);
const TEMPORAL_KEYS = new Set(["token", "kind", "role", "offsetMs", "dueAtMs"]);
const SOCIAL_KEYS = new Set(["activity", "publicMeeting", "adultConsentRequired", "consentLanguagePresent"]);
const MONEY_KEYS = new Set(["amount", "currency", "direction", "timing", "requiresConfirmation", "confirmed"]);

const FETCH_RE = /\b(?:bring|find|get|fetch|retrieve|source|locate|pick\s+up)\s+(?:me\s+)?(?:an?\s+|the\s+|some\s+)?([^,.!?;]+)/i;
// `make` is deliberately only an item verb when followed by "me". This keeps
// conversational offers such as "wanna make 100 bucks" out of item creation.
const CREATE_RE = /\b(?:(?:build|create|craft|assemble|spawn|generate)\s+(?:me\s+)?|make\s+me\s+)(?:an?\s+|the\s+|some\s+)?([^,.!?;]+)/i;
const SOCIAL_RE = /\b(?:meet|hang\s*out|come\s+by|stop\s+by|join\s+me|have\s+dinner|grab\s+drinks?|party)\b/i;
const SOCIAL_PERSON_RE = /\b(?:girlfriend|boyfriend|wife|husband|partner|woman|man|friend|date|companion)\b/i;
const CONSENT_RE = /\b(?:ask|invite|consent(?:ing)?|wants?\s+to|willing|agrees?|if\s+(?:she|he|they)\s+wants?)\b/i;
const COERCION_RE = /\b(?:force|coerce|kidnap|abduct|drug|threaten|blackmail|make)\b/i;
const SEXUAL_OR_SOCIAL_TARGET_RE = /\b(?:sex|sexual|sleep\s+with|hook\s*up|girlfriend|boyfriend|wife|husband|partner|woman|man|date|companion)\b/i;
const MINOR_RE = /\b(?:minor|underage|child|children|kid|kids|teen|teenage|teenager|schoolgirl|schoolboy)\b/i;
const HARM_RE = /\b(?:attack|beat|hurt|kill|shoot|target|harass|terrorize|exclude|drive\s+out|steal\s+from)\b/i;
const PROTECTED_CLASS_RE = /\b(?:race|racial|black\s+people|white\s+people|asian\s+people|jews?|jewish\s+people|muslims?|christians?|hindus?|gays?|lesbians?|transgender|trans\s+people|disabled\s+people|immigrants?|nationality|ethnic(?:ity|\s+group))\b/i;
const INSTRUCTION_RE = /\b(?:how\s+(?:do\s+i|can\s+i|to)|step[- ]by[- ]step|instructions?|teach\s+me|explain\s+how|best\s+way\s+to|walk\s+me\s+through)\b/i;
const REAL_CRIME_RE = /\b(?:(?:rob|robbing|robbery\s+of)\s+(?:a\s+)?bank|hotwire|launder\s+money|make\s+(?:a\s+)?bomb|build\s+(?:a\s+)?bomb|hack\s+(?:an?\s+)?(?:account|bank|phone|computer)|break\s+into|steal\s+(?:a\s+)?(?:real\s+)?car|evade\s+(?:the\s+)?police|manufacture\s+drugs|buy\s+illegal\s+drugs)\b/i;
const IMPOSSIBLE_ITEM_RE = /\b(?:jet\s*pack|nuclear\s+bomb|nuke|time\s+machine|teleporter|infinite\s+money|god\s*mode|spaceship|death\s+ray|orbital\s+weapon|minigun|tank)\b/i;

const MONEY_CONTEXT_RE = /\b(?:give|pay|offer|tip|hand|send|front|spot|wire)\s+(?:you|u|them|him|her)|\b(?:you|u)\s+(?:can|could|will|would|wanna|want\s+to|want\s+2)\s+(?:make|earn|get)|\b(?:wanna|want\s+to|want\s+2)\s+make\b/i;
const MONEY_TYPO_REPLACEMENTS = Object.freeze([
  [/\b(?:dollers?|dolars?|dollors?)\b/gi, "dollars"],
  [/\b(?:buks?|bux|buckss+)\b/gi, "bucks"],
  [/\bbandz\b/gi, "bands"],
  [/\b(?:hundered|hunderd|hundrid)\b/gi, "hundred"],
  [/\b(?:thousnd|thousandd)\b/gi, "thousand"],
  [/\bfiv\b/gi, "five"],
]);
const SMALL_NUMBER_WORDS = Object.freeze({
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
});
const NUMBER_WORD_PATTERN = Object.keys(SMALL_NUMBER_WORDS).join("|");

const defaultSpecs = [
  ["cash", "pickup", ["cash bundle", "money bundle"], 1, 1_000, ["fetch_item"]],
  ["medkit", "consumable", ["medkit", "medical kit", "first aid kit"], 3, 1_500, ["fetch_item", "create_item"]],
  ["armor", "pickup", ["armor", "body armor", "armor vest", "tactical vest"], 2, 2_500, ["fetch_item"]],
  ["ammo", "consumable", ["ammo", "ammunition", "ammo box"], 3, 1_500, ["fetch_item"]],
  ["casinoChips", "pickup", ["casino chips", "chips"], 3, 1_000, ["fetch_item"]],
  ["lockpick", "tool", ["lockpick", "lockpicks", "lockpick set", "lockpick toolkit"], 2, 1_200, ["fetch_item", "create_item"]],
  ["fuel", "consumable", ["fuel", "fuel can", "gas can"], 2, 1_000, ["fetch_item"]],
  ["weaponCrate", "pickup", ["weapon crate", "weapon case", "closed weapon case"], 1, 3_000, ["fetch_item"]],
  ["contraband", "pickup", ["contraband", "sealed parcel", "unmarked package"], 1, 2_000, ["fetch_item"]],
  ["collectible", "pickup", ["collectible", "neon token", "casino token"], 3, 5_000, ["fetch_item", "create_item"]],
  ["dirtBike", "vehicle", ["dirt bike", "trail bike"], 1, 5_000, ["fetch_item"]],
  ["motorcycle", "vehicle", ["motorcycle", "motorbike", "street bike"], 1, 5_000, ["fetch_item"]],
  ["bicycle", "vehicle", ["bicycle", "pedal bike"], 1, 1_500, ["fetch_item"]],
  ["atv", "vehicle", ["atv", "quad", "quad bike"], 1, 4_000, ["fetch_item"]],
  ["duneBuggy", "vehicle", ["dune buggy", "buggy"], 1, 5_000, ["fetch_item"]],
  ["offroadPickup", "vehicle", ["offroad pickup", "off road pickup", "pickup truck"], 1, 5_000, ["fetch_item"]],
  ["offroadSuv", "vehicle", ["offroad suv", "off road suv", "four by four"], 1, 5_000, ["fetch_item"]],
  ["sedan", "vehicle", ["sedan", "car"], 1, 5_000, ["fetch_item"]],
  ["taxi", "vehicle", ["taxi", "cab"], 1, 5_000, ["fetch_item"]],
  ["sports", "vehicle", ["sports car", "supercar"], 1, 5_000, ["fetch_item"]],
  ["suv", "vehicle", ["suv"], 1, 5_000, ["fetch_item"]],
  ["compact", "vehicle", ["compact car", "hatchback"], 1, 5_000, ["fetch_item"]],
  ["muscle", "vehicle", ["muscle car", "street muscle"], 1, 5_000, ["fetch_item"]],
  ["policeCruiser", "vehicle", ["police cruiser", "patrol car"], 1, 5_000, ["fetch_item"]],
  ["limousine", "vehicle", ["limousine", "limo"], 1, 5_000, ["fetch_item"]],
  ["utilityVan", "vehicle", ["utility van", "work van"], 1, 5_000, ["fetch_item"]],
  ["airportShuttle", "vehicle", ["airport shuttle", "shuttle van"], 1, 5_000, ["fetch_item"]],
  ["policeSuv", "vehicle", ["police suv", "pursuit suv"], 1, 5_000, ["fetch_item"]],
].map(([id, category, aliases, maxQuantity, maxCashOffer, taskTypes]) => ({
  id,
  category,
  aliases,
  maxQuantity,
  maxCashOffer,
  taskTypes,
}));

const plainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const error = (code, message, details) => ({ code, message, ...(details ? { details } : {}) });
const normalizeText = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
const normalizeAlias = (value) => normalizeText(value).toLowerCase().replace(/[_-]+/g, " ").replace(/[^a-z0-9 ]+/g, "").replace(/\s+/g, " ").trim();
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unexpectedKeys = (value, allowed) => plainObject(value) ? Object.keys(value).filter((key) => !allowed.has(key)) : [];
const freezeSpecs = (specs) => Object.freeze(specs.map((spec) => Object.freeze({ ...spec, aliases: Object.freeze([...spec.aliases]), taskTypes: Object.freeze([...spec.taskTypes]) })));

export const NPC_LANGUAGE_ACTION_VERSION = SCHEMA_VERSION;
export const NPC_LANGUAGE_ACTION_LIMITS = Object.freeze({
  maxTextLength: MAX_TEXT_LENGTH,
  maxCashOffer: MAX_CASH_OFFER,
  maxDeadlineMs: MAX_DEADLINE_MS,
});
export const DEFAULT_APPROVED_ITEM_SPECS = freezeSpecs(defaultSpecs);

export function validateApprovedItemSpecs(specs) {
  const errors = [];
  const normalized = [];
  const ids = new Set();
  const aliases = new Set();

  if (!Array.isArray(specs) || specs.length < 1 || specs.length > 64) {
    return { ok: false, items: [], errors: [error("invalid_item_specs", "Approved item specs must contain between 1 and 64 entries.")] };
  }

  specs.forEach((spec, index) => {
    const prefix = `itemSpecs[${index}]`;
    if (!plainObject(spec)) {
      errors.push(error("invalid_item_spec", `${prefix} must be an object.`));
      return;
    }
    const extras = unexpectedKeys(spec, SPEC_KEYS);
    if (extras.length) errors.push(error("unbounded_item_spec", `${prefix} contains forbidden fields.`, { fields: extras }));
    const id = String(spec.id ?? "");
    if (!/^[A-Za-z][A-Za-z0-9]{0,31}$/.test(id)) errors.push(error("invalid_item_id", `${prefix}.id is invalid.`));
    if (ids.has(id)) errors.push(error("duplicate_item_id", `${prefix}.id is duplicated.`, { id }));
    ids.add(id);
    if (!ITEM_CATEGORIES.has(spec.category)) errors.push(error("invalid_item_category", `${prefix}.category is not allowed.`));
    if (!Array.isArray(spec.aliases) || spec.aliases.length < 1 || spec.aliases.length > 12) {
      errors.push(error("invalid_item_aliases", `${prefix}.aliases must contain 1-12 entries.`));
    }
    const cleanAliases = Array.isArray(spec.aliases) ? spec.aliases.map(normalizeAlias).filter(Boolean) : [];
    cleanAliases.forEach((alias) => {
      if (alias.length > 40) errors.push(error("invalid_item_alias", `${prefix} contains an alias longer than 40 characters.`));
      if (aliases.has(alias)) errors.push(error("duplicate_item_alias", `${prefix} reuses an alias.`, { alias }));
      aliases.add(alias);
    });
    if (!Number.isInteger(spec.maxQuantity) || spec.maxQuantity < 1 || spec.maxQuantity > 10) errors.push(error("invalid_item_quantity_bound", `${prefix}.maxQuantity must be an integer from 1 to 10.`));
    if (!Number.isInteger(spec.maxCashOffer) || spec.maxCashOffer < 0 || spec.maxCashOffer > MAX_CASH_OFFER) errors.push(error("invalid_item_cash_bound", `${prefix}.maxCashOffer is outside the economy bound.`));
    if (!Array.isArray(spec.taskTypes) || spec.taskTypes.length < 1 || spec.taskTypes.some((type) => !TASK_TYPES.has(type))) errors.push(error("invalid_item_task_types", `${prefix}.taskTypes contains an unsupported action.`));
    normalized.push({
      id,
      category: spec.category,
      aliases: [...new Set([normalizeAlias(id), ...cleanAliases])],
      maxQuantity: spec.maxQuantity,
      maxCashOffer: spec.maxCashOffer,
      taskTypes: [...new Set(spec.taskTypes)],
    });
  });

  return errors.length ? { ok: false, items: [], errors } : { ok: true, items: freezeSpecs(normalized), errors: [] };
}

const defaultSpecValidation = validateApprovedItemSpecs(DEFAULT_APPROVED_ITEM_SPECS);
if (!defaultSpecValidation.ok) throw new Error("Default NPC item specs are invalid.");

function createRegistry(specs) {
  const byId = new Map(specs.map((spec) => [spec.id, spec]));
  const byAlias = specs.flatMap((spec) => spec.aliases.map((alias) => ({ alias, spec }))).sort((a, b) => b.alias.length - a.alias.length);
  return { byId, byAlias };
}

function matchApprovedItem(text, registry) {
  const normalized = normalizeAlias(text);
  return registry.byAlias.find(({ alias }) => {
    const pluralSuffix = alias.endsWith("s") ? "" : "s?";
    return new RegExp(`(?:^|\\s)${escapeRegex(alias)}${pluralSuffix}(?:$|\\s)`).test(normalized);
  })?.spec ?? null;
}

function requestedPhrase(text, regex) {
  const match = text.match(regex);
  if (!match) return "";
  return normalizeText(match[1])
    .replace(/\b(?:by\s+)?(?:tomorrow|tonight)\b.*$/i, "")
    .replace(/\b(?:if|when|after|once)\s+.+$/i, "")
    .replace(/^(?:a|an|the|some)\s+/i, "")
    .trim();
}

function boundedDynamicLabel(phrase) {
  const normalized = normalizeText(phrase)
    .replace(/^\s*(?:\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten)\s+/i, "")
    .replace(/^(?:a|an|the|some)\s+/i, "")
    .replace(/[^a-z0-9 '&-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  if (!normalized) return "Custom item";
  return normalized.replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

function parseQuantity(phrase) {
  const numeric = phrase.match(/^\s*(\d{1,2})\b/);
  if (numeric) return Number(numeric[1]);
  const word = phrase.match(/^\s*(one|two|three|four|five|six|seven|eight|nine|ten)\b/i)?.[1]?.toLowerCase();
  return word ? ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"].indexOf(word) + 1 : 1;
}

function parseRequestedQuantity(phrase, spec) {
  const normalized = normalizeAlias(phrase);
  const beginsWithItemAlias = spec.aliases.some((alias) => {
    const pluralSuffix = alias.endsWith("s") ? "" : "s?";
    return new RegExp(`^${escapeRegex(alias)}${pluralSuffix}(?:$|\\s)`).test(normalized);
  });
  return beginsWithItemAlias ? 1 : parseQuantity(phrase);
}

function normalizeMoneyText(value) {
  let normalized = normalizeText(value).toLowerCase();
  for (const [pattern, replacement] of MONEY_TYPO_REPLACEMENTS) normalized = normalized.replace(pattern, replacement);
  return normalized.replace(/\s+/g, " ").trim();
}

function parseNumberWords(value) {
  const tokens = normalizeMoneyText(value).split(/[-\s]+/).filter(Boolean);
  if (!tokens.length) return null;
  let total = 0;
  let current = 0;
  let consumed = 0;
  for (const token of tokens) {
    if (token === "and") continue;
    if (Object.hasOwn(SMALL_NUMBER_WORDS, token)) {
      current += SMALL_NUMBER_WORDS[token];
      consumed += 1;
      continue;
    }
    if (token === "hundred") {
      current = Math.max(1, current) * 100;
      consumed += 1;
      continue;
    }
    if (token === "thousand") {
      total += Math.max(1, current) * 1_000;
      current = 0;
      consumed += 1;
      continue;
    }
    return null;
  }
  return consumed ? total + current : null;
}

function moneyAmountFromText(text) {
  const normalized = normalizeMoneyText(text);
  const symbolic = normalized.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/i);
  if (symbolic) return Number(symbolic[1].replace(/,/g, ""));

  const numericUnit = normalized.match(/\b([\d,]+(?:\.\d{1,2})?)\s*(usd|dollars?|bucks?|bands?|grand)\b/i);
  if (numericUnit) {
    const base = Number(numericUnit[1].replace(/,/g, ""));
    return /^(?:bands?|grand)$/i.test(numericUnit[2]) ? base * 1_000 : base;
  }

  const wordsWithUnit = normalized.match(new RegExp(`\\b((?:(?:${NUMBER_WORD_PATTERN}|hundred|thousand|and)[ -]*)+)\\s*(usd|dollars?|bucks?|bands?|grand)\\b`, "i"));
  if (wordsWithUnit) {
    const base = parseNumberWords(wordsWithUnit[1]);
    if (base === null) return null;
    return /^(?:bands?|grand)$/i.test(wordsWithUnit[2]) ? base * 1_000 : base;
  }

  const bareSpokenAmount = normalized.match(new RegExp(`^((?:(?:${NUMBER_WORD_PATTERN}|hundred|thousand|and)[ -]*)+)$`, "i"));
  if (bareSpokenAmount) return parseNumberWords(bareSpokenAmount[1]);

  if (MONEY_CONTEXT_RE.test(normalized)) {
    const contextualWords = normalized.match(new RegExp(`\\b((?:(?:${NUMBER_WORD_PATTERN}|hundred|thousand|and)[ -]*)+)\\b(?=\\s*(?:if|when|after|once|for|to|$))`, "i"));
    if (contextualWords) return parseNumberWords(contextualWords[1]);
    const contextualNumber = normalized.match(/\b(\d{1,6}(?:,\d{3})*)\b(?=\s*(?:if|when|after|once|for|to|$))/i);
    if (contextualNumber) return Number(contextualNumber[1].replace(/,/g, ""));
  }
  return null;
}

export function parseNpcMoneyOffer(text) {
  const normalized = normalizeMoneyText(text);
  const amount = moneyAmountFromText(normalized);
  if (amount === null) return null;
  const npcToPlayer = /\b(?:give|pay|send|hand)\s+me\b/i.test(text);
  const conditional = /\b(?:if|when|after|once)\b/i.test(text);
  const gift = /\b(?:gift|tip|give\s+you|hand\s+you)\b/i.test(text);
  return {
    amount,
    currency: "USD",
    direction: npcToPlayer ? "npc_to_player" : "player_to_npc",
    timing: conditional ? "on_completion" : gift ? "gift" : "upfront",
    requiresConfirmation: true,
    confirmed: false,
  };
}

function tonightDueAt(nowMs) {
  if (!Number.isFinite(nowMs)) return null;
  const now = new Date(nowMs);
  const target = new Date(nowMs);
  target.setUTCHours(20, 0, 0, 0);
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime();
}

export function parseNpcTemporalExpression(text, { nowMs = null, social = false } = {}) {
  const normalized = normalizeText(text).toLowerCase();
  if (/\btomorrow\b/.test(normalized)) {
    return {
      token: "tomorrow",
      kind: "relative_day",
      role: social ? "social_window" : "deadline",
      offsetMs: DAY_MS,
      dueAtMs: Number.isFinite(nowMs) ? nowMs + DAY_MS : null,
    };
  }
  if (/\btonight\b/.test(normalized)) {
    const dueAtMs = tonightDueAt(nowMs);
    return {
      token: "tonight",
      kind: "day_window",
      role: "social_window",
      offsetMs: Number.isFinite(nowMs) ? dueAtMs - nowMs : null,
      dueAtMs,
    };
  }
  return null;
}

function scanSafety(text) {
  const errors = [];
  const ageMatches = [...text.matchAll(/\b(\d{1,2})\s*[- ]?year[- ]?old\b/gi)].map((match) => Number(match[1]));
  const shortAgeMatches = [...text.matchAll(/\b(\d{1,2})\s*(?:y\/o|yo)\b/gi)].map((match) => Number(match[1]));
  if (MINOR_RE.test(text) || [...ageMatches, ...shortAgeMatches].some((age) => age < 18)) errors.push(error("minor_involved", "Tasks involving minors are not allowed."));
  if (COERCION_RE.test(text) && SEXUAL_OR_SOCIAL_TARGET_RE.test(text)) errors.push(error("sexual_or_social_coercion", "Coercive sexual or social requests are not allowed."));
  if (HARM_RE.test(text) && PROTECTED_CLASS_RE.test(text)) errors.push(error("hate_targeting", "Targeting a protected class for harm is not allowed."));
  if (REAL_CRIME_RE.test(text) && (INSTRUCTION_RE.test(text) || /\b(?:real\s+world|real\s+life|actual)\b/i.test(text))) errors.push(error("real_world_crime_instructions", "Real-world crime instructions are not allowed."));
  return errors;
}

const makeResult = (ok, status, action, errors = []) => ({ ok, status, action, errors });

function internalValidate(candidate, context, { allowConfirmedMoney = false } = {}) {
  const value = candidate?.action && plainObject(candidate.action) ? candidate.action : candidate;
  const errors = [];
  if (!plainObject(value)) return makeResult(false, "rejected", null, [error("invalid_action", "Action must be an object.")]);
  const actionExtras = unexpectedKeys(value, ACTION_KEYS);
  if (actionExtras.length) errors.push(error("invalid_action_schema", "Action contains unsupported fields.", { fields: actionExtras }));
  if (value.version !== SCHEMA_VERSION) errors.push(error("invalid_action_version", `Action version must be ${SCHEMA_VERSION}.`));
  if (!INTENTS.has(value.intent)) errors.push(error("invalid_intent", "Action intent is not supported."));
  const sourceText = normalizeText(value.sourceText);
  if (!sourceText || sourceText.length > MAX_TEXT_LENGTH) errors.push(error("invalid_source_text", `sourceText must contain 1-${MAX_TEXT_LENGTH} characters.`));
  errors.push(...scanSafety(sourceText));

  let task = null;
  let itemSpec = null;
  if (value.task !== null && value.task !== undefined) {
    if (!plainObject(value.task)) errors.push(error("invalid_task", "task must be null or an object."));
    else {
      if (plainObject(value.task.item) || plainObject(value.task.itemSpec)) errors.push(error("unbounded_item_spec", "Dynamic item capability objects are forbidden; use an approved itemId only."));
      const extras = unexpectedKeys(value.task, TASK_KEYS);
      if (extras.length) errors.push(error("invalid_task_schema", "task contains unsupported fields.", { fields: extras }));
      if (!TASK_TYPES.has(value.task.type) || value.task.type !== value.intent) errors.push(error("invalid_task_type", "task.type must match a fetch_item or create_item intent."));
      itemSpec = context.registry.byId.get(value.task.itemId);
      if (!itemSpec) errors.push(error(IMPOSSIBLE_ITEM_RE.test(String(value.task.itemId)) ? "unbalanced_dynamic_item" : "unapproved_item", "The requested item is not server-approved.", { itemId: String(value.task.itemId ?? "") }));
      if (itemSpec && !itemSpec.taskTypes.includes(value.task.type)) errors.push(error("item_action_not_approved", "This item is not approved for that task type.", { itemId: itemSpec.id, taskType: value.task.type }));
      const quantity = Number(value.task.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || (itemSpec && quantity > itemSpec.maxQuantity)) errors.push(error("unbalanced_quantity", "Requested item quantity exceeds its server bound."));
      const summary = normalizeText(value.task.requestSummary);
      if (!summary || summary.length > 180) errors.push(error("invalid_request_summary", "requestSummary must contain 1-180 characters."));
      const requestedLabel = normalizeText(value.task.requestedLabel);
      if (requestedLabel && requestedLabel.length > 60) errors.push(error("invalid_requested_label", "requestedLabel must contain at most 60 characters."));
      task = itemSpec ? {
        type: value.task.type,
        itemId: itemSpec.id,
        quantity,
        requestSummary: summary,
        ...(requestedLabel ? { requestedLabel } : {}),
      } : null;
    }
  } else if (value.intent === "fetch_item" || value.intent === "create_item") {
    errors.push(error("missing_task", "Item actions require a task."));
  }

  let temporal = null;
  if (value.temporal !== null && value.temporal !== undefined) {
    if (!plainObject(value.temporal)) errors.push(error("invalid_temporal", "temporal must be null or an object."));
    else {
      const extras = unexpectedKeys(value.temporal, TEMPORAL_KEYS);
      if (extras.length) errors.push(error("invalid_temporal_schema", "temporal contains unsupported fields.", { fields: extras }));
      if (!TEMPORAL_KINDS.has(value.temporal.kind) || !TEMPORAL_ROLES.has(value.temporal.role) || !["tomorrow", "tonight"].includes(value.temporal.token)) errors.push(error("invalid_temporal", "Temporal reference is not supported."));
      if ((value.temporal.token === "tomorrow" && value.temporal.kind !== "relative_day") || (value.temporal.token === "tonight" && value.temporal.kind !== "day_window")) errors.push(error("invalid_temporal_pair", "Temporal token and kind do not match."));
      const offsetMs = value.temporal.offsetMs === null ? null : Number(value.temporal.offsetMs);
      const dueAtMs = value.temporal.dueAtMs === null ? null : Number(value.temporal.dueAtMs);
      if (offsetMs !== null && (!Number.isFinite(offsetMs) || offsetMs <= 0 || offsetMs > MAX_DEADLINE_MS)) errors.push(error("invalid_temporal_bound", "Temporal offset must be future-facing and within seven days."));
      if (dueAtMs !== null && !Number.isFinite(dueAtMs)) errors.push(error("invalid_due_time", "dueAtMs must be finite or null."));
      temporal = { token: value.temporal.token, kind: value.temporal.kind, role: value.temporal.role, offsetMs, dueAtMs };
    }
  }

  let social = null;
  if (value.social !== null && value.social !== undefined) {
    if (!plainObject(value.social)) errors.push(error("invalid_social_plan", "social must be null or an object."));
    else {
      const extras = unexpectedKeys(value.social, SOCIAL_KEYS);
      if (extras.length) errors.push(error("invalid_social_schema", "social contains unsupported fields.", { fields: extras }));
      const activity = normalizeText(value.social.activity).slice(0, 80);
      if (!activity) errors.push(error("invalid_social_activity", "A social activity is required."));
      if (value.social.publicMeeting !== true || value.social.adultConsentRequired !== true) errors.push(error("unsafe_social_plan", "Social plans must be public and require adult consent."));
      if (SOCIAL_PERSON_RE.test(sourceText) && value.social.consentLanguagePresent !== true) errors.push(error("consent_required", "The named adult must be asked and freely agree before a meeting task can run."));
      social = { activity, publicMeeting: true, adultConsentRequired: true, consentLanguagePresent: value.social.consentLanguagePresent === true };
    }
  } else if (value.intent === "social_plan") {
    errors.push(error("missing_social_plan", "social_plan requires social details."));
  }

  let money = null;
  if (value.money !== null && value.money !== undefined) {
    if (!plainObject(value.money)) errors.push(error("invalid_money", "money must be null or an object."));
    else {
      const extras = unexpectedKeys(value.money, MONEY_KEYS);
      if (extras.length) errors.push(error("invalid_money_schema", "money contains unsupported fields.", { fields: extras }));
      const amount = Number(value.money.amount);
      if (!Number.isInteger(amount) || amount < 1 || amount > MAX_CASH_OFFER || (itemSpec && amount > itemSpec.maxCashOffer)) errors.push(error("unbalanced_cash_offer", "Cash offer exceeds the server or item economy bound."));
      if (value.money.currency !== "USD" || value.money.direction !== "player_to_npc" || !MONEY_TIMINGS.has(value.money.timing)) errors.push(error("invalid_money_flow", "Only bounded player-to-NPC USD payments are allowed."));
      if (value.money.requiresConfirmation !== true) errors.push(error("confirmation_required", "Every cash transfer requires explicit player confirmation."));
      if (value.money.confirmed === true && !allowConfirmedMoney) errors.push(error("confirmation_not_authoritative", "Model or parsed data cannot self-confirm a cash transfer."));
      if (typeof value.money.confirmed !== "boolean") errors.push(error("invalid_confirmation", "money.confirmed must be a boolean."));
      money = {
        amount,
        currency: "USD",
        direction: "player_to_npc",
        timing: value.money.timing,
        requiresConfirmation: true,
        confirmed: allowConfirmedMoney && value.money.confirmed === true,
      };
    }
  } else if (value.intent === "give_money") {
    errors.push(error("missing_money", "give_money requires a bounded money object."));
  }

  if (task && !TASK_TYPES.has(value.intent)) errors.push(error("task_intent_mismatch", "Only item intents may contain a task."));
  if (social && value.intent !== "social_plan") errors.push(error("social_intent_mismatch", "Only social_plan may contain social details."));
  if (value.intent === "social_plan" && temporal?.role !== "social_window") errors.push(error("social_time_mismatch", "Social plan timing must use a social window."));
  if (task && temporal && temporal.role !== "deadline") errors.push(error("task_time_mismatch", "Item task timing must be a deadline."));
  if (value.intent === "time_reference" && (task || social || money)) errors.push(error("time_reference_payload", "A time_reference cannot carry task, social, or money effects."));
  if (value.intent === "none" && (task || social || temporal || money)) errors.push(error("none_intent_payload", "A none action cannot carry executable effects."));

  if (errors.length) return makeResult(false, "rejected", null, errors);
  const action = { version: SCHEMA_VERSION, intent: value.intent, sourceText, task, temporal, social, money };
  const status = action.intent === "none" ? "no_action" : action.money && !action.money.confirmed ? "needs_confirmation" : "ready";
  return makeResult(true, status, action, []);
}

function createParserContext(approvedItemSpecs) {
  const validated = validateApprovedItemSpecs(approvedItemSpecs);
  if (!validated.ok) throw new TypeError(`Invalid approved item specs: ${validated.errors.map((entry) => entry.code).join(", ")}`);
  return { specs: validated.items, registry: createRegistry(validated.items) };
}

export function createNpcLanguageActionApi({ approvedItemSpecs = DEFAULT_APPROVED_ITEM_SPECS } = {}) {
  const context = createParserContext(approvedItemSpecs);
  const confirmedActions = new WeakSet();

  const validate = (candidate) => internalValidate(candidate, context);

  const parse = (rawText, { nowMs = null } = {}) => {
    const sourceText = normalizeText(rawText);
    if (!sourceText || sourceText.length > MAX_TEXT_LENGTH) return makeResult(false, "rejected", null, [error("invalid_source_text", `Input must contain 1-${MAX_TEXT_LENGTH} characters.`)]);
    const safetyErrors = scanSafety(sourceText);
    if (safetyErrors.length) return makeResult(false, "rejected", null, safetyErrors);

    const fetchPhrase = requestedPhrase(sourceText, FETCH_RE);
    const createPhrase = requestedPhrase(sourceText, CREATE_RE);
    const phrase = fetchPhrase || createPhrase;
    const inferredTaskType = fetchPhrase ? "fetch_item" : createPhrase ? "create_item" : null;
    const socialRequested = SOCIAL_RE.test(sourceText) || SOCIAL_PERSON_RE.test(sourceText);
    const taskType = SOCIAL_PERSON_RE.test(phrase) ? null : inferredTaskType;
    const temporal = parseNpcTemporalExpression(sourceText, { nowMs, social: socialRequested });
    const money = parseNpcMoneyOffer(sourceText);

    if (money && (!Number.isInteger(money.amount) || money.amount < 1 || money.amount > MAX_CASH_OFFER)) return makeResult(false, "rejected", null, [error("unbalanced_cash_offer", "Cash offer must be a whole-dollar amount within the economy bound.")]);
    if (money?.direction === "npc_to_player") return makeResult(false, "rejected", null, [error("unbalanced_money_creation", "Dialogue cannot mint or transfer NPC cash to the player.")]);

    let task = null;
    if (taskType) {
      const matchedSpec = matchApprovedItem(phrase, context.registry);
      const spec = matchedSpec || context.registry.byId.get("collectible");
      if (!spec) {
        const code = IMPOSSIBLE_ITEM_RE.test(phrase) ? "unbalanced_dynamic_item" : "unapproved_item";
        return makeResult(false, "rejected", null, [error(code, "The requested item is not a bounded server-approved game item.", { requestedItem: phrase })]);
      }
      if (!spec.taskTypes.includes(taskType)) return makeResult(false, "rejected", null, [error("item_action_not_approved", "That item cannot be requested with this action type.", { itemId: spec.id, taskType })]);
      const quantity = parseRequestedQuantity((fetchPhrase || createPhrase).trim(), spec);
      if (quantity > spec.maxQuantity) return makeResult(false, "rejected", null, [error("unbalanced_quantity", "Requested quantity exceeds the approved item bound.", { itemId: spec.id, maxQuantity: spec.maxQuantity })]);
      if (money && money.amount > spec.maxCashOffer) return makeResult(false, "rejected", null, [error("unbalanced_cash_offer", "Cash offer exceeds the approved bound for this item.", { itemId: spec.id, maxCashOffer: spec.maxCashOffer })]);
      task = {
        type: taskType,
        itemId: spec.id,
        quantity,
        requestSummary: sourceText.slice(0, 180),
        ...(!matchedSpec ? { requestedLabel: boundedDynamicLabel(phrase) } : {}),
      };
    }

    let social = null;
    if (!task && socialRequested) {
      const consentLanguagePresent = CONSENT_RE.test(sourceText);
      if (SOCIAL_PERSON_RE.test(sourceText) && !consentLanguagePresent) return makeResult(false, "rejected", null, [error("consent_required", "Ask the consenting adult instead of ordering an NPC to deliver a person.")]);
      social = {
        activity: sourceText.slice(0, 80),
        publicMeeting: true,
        adultConsentRequired: true,
        consentLanguagePresent,
      };
    }

    let intent = task?.type || (social ? "social_plan" : money ? "give_money" : temporal ? "time_reference" : "none");
    const draft = { version: SCHEMA_VERSION, intent, sourceText, task, temporal, social, money };
    return internalValidate(draft, context);
  };

  const confirm = (candidate, confirmation = {}, options = {}) => {
    const firstPass = internalValidate(candidate, context);
    if (!firstPass.ok) return firstPass;
    if (!firstPass.action.money) return firstPass;
    const explicitlyConfirmed = confirmation === true || confirmation?.confirmed === true;
    if (!explicitlyConfirmed) return makeResult(false, "rejected", null, [error("explicit_confirmation_required", "The player must explicitly confirm the exact cash transfer.")]);
    const availableCash = Number(confirmation?.availableCash ?? options.availableCash ?? Number.POSITIVE_INFINITY);
    if (!Number.isFinite(availableCash) && availableCash !== Number.POSITIVE_INFINITY) return makeResult(false, "rejected", null, [error("invalid_available_cash", "availableCash must be finite when supplied.")]);
    if (availableCash < firstPass.action.money.amount) return makeResult(false, "rejected", null, [error("insufficient_cash", "The player does not have enough cash for this confirmed transfer.")]);
    const confirmed = {
      ...firstPass.action,
      money: { ...firstPass.action.money, confirmed: true },
    };
    const result = internalValidate(confirmed, context, { allowConfirmedMoney: true });
    if (result.ok && result.action) confirmedActions.add(result.action);
    return result;
  };

  const canExecute = (candidate) => {
    const action = candidate?.action && plainObject(candidate.action) ? candidate.action : candidate;
    const authoritativeConfirmation = plainObject(action) && action.money?.confirmed === true && confirmedActions.has(action);
    const value = internalValidate(action, context, { allowConfirmedMoney: authoritativeConfirmation });
    return value.ok === true && value.status === "ready" && (!value.action.money || authoritativeConfirmation);
  };

  return Object.freeze({
    parse,
    validate,
    confirm,
    canExecute,
    approvedItemSpecs: context.specs,
  });
}

export const npcLanguageActions = createNpcLanguageActionApi();
export const parseNpcLanguageAction = (...args) => npcLanguageActions.parse(...args);
export const validateNpcLanguageAction = (...args) => npcLanguageActions.validate(...args);
export const confirmNpcLanguageAction = (...args) => npcLanguageActions.confirm(...args);
export const canExecuteNpcLanguageAction = (...args) => npcLanguageActions.canExecute(...args);

export default npcLanguageActions;
