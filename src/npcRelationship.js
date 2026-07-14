const RELATIONSHIP_VERSION = 1;
const MAX_BONDED_MINUTES = 525_600;
const MAX_MINUTES_PER_UPDATE = 180;
const MAX_INTERACTION_COUNT = 1_000_000;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const round2 = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const plainObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finiteNumber = (value, fallback = 0) => {
  if (typeof value === "string" && value.trim() === "") return fallback;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};
const bounded = (value, fallback, minimum, maximum) => clamp(finiteNumber(value, fallback), minimum, maximum);
const boundedInteger = (value, fallback, minimum, maximum) => Math.round(bounded(value, fallback, minimum, maximum));

export const NPC_RELATIONSHIP_VERSION = RELATIONSHIP_VERSION;
export const NPC_RELATIONSHIP_LIMITS = Object.freeze({
  loyaltyMinimum: -100,
  loyaltyMaximum: 100,
  maxBondedMinutes: MAX_BONDED_MINUTES,
  maxMinutesPerUpdate: MAX_MINUTES_PER_UPDATE,
  maxInteractionCount: MAX_INTERACTION_COUNT,
});

export const NPC_LOYALTY_TIERS = Object.freeze([
  Object.freeze({ key: "nemesis", label: "Nemesis", minimum: -100 }),
  Object.freeze({ key: "hostile", label: "Hostile", minimum: -75 }),
  Object.freeze({ key: "distrustful", label: "Distrustful", minimum: -50 }),
  Object.freeze({ key: "wary", label: "Wary", minimum: -25 }),
  Object.freeze({ key: "local_contact", label: "Local Contact", minimum: 0 }),
  Object.freeze({ key: "familiar", label: "Familiar", minimum: 20 }),
  Object.freeze({ key: "trusted", label: "Trusted", minimum: 40 }),
  Object.freeze({ key: "loyal", label: "Loyal", minimum: 60 }),
  Object.freeze({ key: "inner_circle", label: "Inner Circle", minimum: 80 }),
]);

export const NPC_BOND_EVENT_WEIGHTS = Object.freeze({
  neutral: 0,
  greeting: 0.25,
  conversation: 0.5,
  gift: 1.5,
  shared_activity: 2,
  completed_favor: 5,
  kept_promise: 6,
  rescue: 10,
  bribe: -1,
  insult: -4,
  threat: -8,
  failed_promise: -10,
  betrayal: -30,
  violence: -40,
});

export function clampNpcLoyalty(value) {
  return round2(bounded(value, 0, -100, 100));
}

export function getNpcLoyaltyTier(value) {
  const loyalty = clampNpcLoyalty(value);
  for (let index = NPC_LOYALTY_TIERS.length - 1; index >= 0; index -= 1) {
    if (loyalty >= NPC_LOYALTY_TIERS[index].minimum) return NPC_LOYALTY_TIERS[index];
  }
  return NPC_LOYALTY_TIERS[0];
}

export function getNpcLoyaltyMeter(value) {
  const loyalty = clampNpcLoyalty(value);
  const tier = getNpcLoyaltyTier(loyalty);
  return Object.freeze({
    loyalty,
    percent: round2((loyalty + 100) / 2),
    tierKey: tier.key,
    tierLabel: tier.label,
  });
}

/**
 * Accepts untrusted persisted relationship data and returns the only fields the
 * game is allowed to restore. The tier is always derived from loyalty so stale
 * or forged labels cannot survive a save/load cycle.
 */
export function sanitizeNpcRelationship(value = {}) {
  const source = plainObject(value) ? value : {};
  const loyalty = clampNpcLoyalty(source.loyalty);
  const tier = getNpcLoyaltyTier(loyalty);
  const lastInteraction = finiteNumber(source.lastInteractionAtMs, Number.NaN);
  return {
    version: RELATIONSHIP_VERSION,
    loyalty,
    trust: round2(bounded(source.trust, 0, -100, 100)),
    fear: round2(bounded(source.fear, 0, 0, 100)),
    reputation: round2(bounded(source.reputation, 0, -100, 100)),
    bondedMinutes: round2(bounded(source.bondedMinutes, 0, 0, MAX_BONDED_MINUTES)),
    positiveInteractions: boundedInteger(source.positiveInteractions, 0, 0, MAX_INTERACTION_COUNT),
    negativeInteractions: boundedInteger(source.negativeInteractions, 0, 0, MAX_INTERACTION_COUNT),
    lastInteractionAtMs: Number.isFinite(lastInteraction) && lastInteraction >= 0
      ? Math.min(Number.MAX_SAFE_INTEGER, Math.round(lastInteraction))
      : null,
    lastBondDelta: round2(bounded(source.lastBondDelta, 0, -100, 100)),
    tierKey: tier.key,
    tierLabel: tier.label,
  };
}

export function createNpcRelationship(initial = {}) {
  return sanitizeNpcRelationship(initial);
}

/**
 * Calculates one deterministic bond event. Time is capped per update to stop
 * clock changes or long offline periods from instantly maxing loyalty.
 */
export function calculateNpcBondDelta({
  loyalty = 0,
  trust = 0,
  fear = 0,
  reputation = 0,
  elapsedMinutes = 0,
  interactionQuality = 0,
  event = "conversation",
} = {}) {
  const safeLoyalty = clampNpcLoyalty(loyalty);
  const safeTrust = bounded(trust, 0, -100, 100);
  const safeFear = bounded(fear, 0, 0, 100);
  const safeReputation = bounded(reputation, 0, -100, 100);
  const safeMinutes = bounded(elapsedMinutes, 0, 0, MAX_MINUTES_PER_UPDATE);
  const safeQuality = bounded(interactionQuality, 0, -1, 1);
  const eventWeight = Object.hasOwn(NPC_BOND_EVENT_WEIGHTS, event)
    ? NPC_BOND_EVENT_WEIGHTS[event]
    : NPC_BOND_EVENT_WEIGHTS.neutral;

  const positiveTrust = Math.max(0, safeTrust) / 100;
  const positiveReputation = Math.max(0, safeReputation) / 100;
  const timeContribution = (safeMinutes / 60) * (0.25 + positiveTrust * 0.55 + positiveReputation * 0.2);
  const socialContribution = safeQuality * 2.5;
  const trustContribution = safeTrust * 0.008;
  const fearContribution = safeFear * -0.012;
  const reputationContribution = safeReputation * 0.004;
  let delta = timeContribution + socialContribution + trustContribution + fearContribution + reputationContribution + eventWeight;

  // High loyalty takes longer to deepen while major betrayals still matter.
  if (delta > 0) delta *= 1 - Math.max(0, safeLoyalty) / 140;
  else if (delta < 0) delta *= 1 - Math.max(0, -safeLoyalty) / 240;
  return round2(clamp(delta, -50, 25));
}

export function advanceNpcRelationship(current, signal = {}, { nowMs = null } = {}) {
  const previous = sanitizeNpcRelationship(current);
  const safeSignal = plainObject(signal) ? signal : {};
  const safeNow = finiteNumber(nowMs, Number.NaN);
  const computedElapsed = Number.isFinite(safeNow) && previous.lastInteractionAtMs !== null
    ? Math.max(0, (safeNow - previous.lastInteractionAtMs) / 60_000)
    : 0;
  const elapsedMinutes = Object.hasOwn(safeSignal, "elapsedMinutes")
    ? bounded(safeSignal.elapsedMinutes, 0, 0, MAX_MINUTES_PER_UPDATE)
    : bounded(computedElapsed, 0, 0, MAX_MINUTES_PER_UPDATE);
  const trust = round2(bounded(previous.trust + bounded(safeSignal.trustDelta, 0, -100, 100), previous.trust, -100, 100));
  const fear = round2(bounded(previous.fear + bounded(safeSignal.fearDelta, 0, -100, 100), previous.fear, 0, 100));
  const reputation = round2(bounded(previous.reputation + bounded(safeSignal.reputationDelta, 0, -100, 100), previous.reputation, -100, 100));
  const event = Object.hasOwn(NPC_BOND_EVENT_WEIGHTS, safeSignal.event) ? safeSignal.event : "neutral";
  const delta = calculateNpcBondDelta({
    loyalty: previous.loyalty,
    trust,
    fear,
    reputation,
    elapsedMinutes,
    interactionQuality: safeSignal.interactionQuality,
    event,
  });
  const hadInteraction = event !== "neutral" || elapsedMinutes > 0 || finiteNumber(safeSignal.interactionQuality, 0) !== 0;

  return sanitizeNpcRelationship({
    loyalty: previous.loyalty + delta,
    trust,
    fear,
    reputation,
    bondedMinutes: previous.bondedMinutes + elapsedMinutes,
    positiveInteractions: previous.positiveInteractions + (hadInteraction && delta > 0 ? 1 : 0),
    negativeInteractions: previous.negativeInteractions + (hadInteraction && delta < 0 ? 1 : 0),
    lastInteractionAtMs: Number.isFinite(safeNow) && safeNow >= 0 ? safeNow : previous.lastInteractionAtMs,
    lastBondDelta: delta,
  });
}

export default Object.freeze({
  create: createNpcRelationship,
  sanitize: sanitizeNpcRelationship,
  advance: advanceNpcRelationship,
  calculateDelta: calculateNpcBondDelta,
  tierFor: getNpcLoyaltyTier,
  meterFor: getNpcLoyaltyMeter,
});
