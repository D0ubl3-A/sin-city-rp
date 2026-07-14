import { expect, test } from "@playwright/test";
import {
  advanceNpcRelationship,
  calculateNpcBondDelta,
  createNpcRelationship,
  getNpcLoyaltyMeter,
  getNpcLoyaltyTier,
  NPC_LOYALTY_TIERS,
  sanitizeNpcRelationship,
} from "../src/npcRelationship.js";

test.describe("NPC loyalty and bond progression", () => {
  test("uses stable tier thresholds across the full -100 to 100 meter", () => {
    expect(getNpcLoyaltyTier(-100).key).toBe("nemesis");
    expect(getNpcLoyaltyTier(-75).key).toBe("hostile");
    expect(getNpcLoyaltyTier(-25).key).toBe("wary");
    expect(getNpcLoyaltyTier(0).label).toBe("Local Contact");
    expect(getNpcLoyaltyTier(20).key).toBe("familiar");
    expect(getNpcLoyaltyTier(40).key).toBe("trusted");
    expect(getNpcLoyaltyTier(60).key).toBe("loyal");
    expect(getNpcLoyaltyTier(80).key).toBe("inner_circle");
    expect(getNpcLoyaltyTier(999).key).toBe("inner_circle");
    expect(new Set(NPC_LOYALTY_TIERS.map((tier) => tier.key)).size).toBe(NPC_LOYALTY_TIERS.length);
  });

  test("combines time, trust, fear, reputation, and interaction quality deterministically", () => {
    const neutral = calculateNpcBondDelta({ event: "neutral" });
    const bonded = calculateNpcBondDelta({
      loyalty: 10,
      trust: 65,
      fear: 3,
      reputation: 40,
      elapsedMinutes: 90,
      interactionQuality: 0.8,
      event: "shared_activity",
    });
    const damaged = calculateNpcBondDelta({
      loyalty: 10,
      trust: -40,
      fear: 90,
      reputation: -50,
      elapsedMinutes: 10,
      interactionQuality: -1,
      event: "betrayal",
    });
    expect(neutral).toBe(0);
    expect(bonded).toBeGreaterThan(4);
    expect(damaged).toBeLessThan(-25);
    expect(calculateNpcBondDelta({ elapsedMinutes: 999_999, event: "neutral" }))
      .toBe(calculateNpcBondDelta({ elapsedMinutes: 180, event: "neutral" }));
  });

  test("builds loyalty over shared time and meaningful positive events", () => {
    const started = createNpcRelationship({ loyalty: 0, trust: 15, reputation: 5, lastInteractionAtMs: 1_000 });
    const afterTalk = advanceNpcRelationship(started, {
      event: "conversation",
      trustDelta: 8,
      interactionQuality: 0.7,
    }, { nowMs: 3_601_000 });
    const afterPromise = advanceNpcRelationship(afterTalk, {
      event: "kept_promise",
      trustDelta: 12,
      reputationDelta: 4,
      elapsedMinutes: 30,
      interactionQuality: 1,
    }, { nowMs: 5_401_000 });

    expect(afterTalk.loyalty).toBeGreaterThan(started.loyalty);
    expect(afterPromise.loyalty).toBeGreaterThan(afterTalk.loyalty);
    expect(afterPromise.trust).toBe(35);
    expect(afterPromise.bondedMinutes).toBe(90);
    expect(afterPromise.positiveInteractions).toBe(2);
    expect(afterPromise.lastInteractionAtMs).toBe(5_401_000);
    expect(afterPromise.tierKey).toBe(getNpcLoyaltyTier(afterPromise.loyalty).key);
  });

  test("betrayal and fear can break a bond without escaping loyalty bounds", () => {
    const trusted = createNpcRelationship({ loyalty: 92, trust: 80, fear: 0, reputation: 30 });
    const betrayed = advanceNpcRelationship(trusted, {
      event: "betrayal",
      trustDelta: -100,
      fearDelta: 100,
      reputationDelta: -60,
      interactionQuality: -1,
    }, { nowMs: 10_000 });
    expect(betrayed.loyalty).toBeLessThan(trusted.loyalty);
    expect(betrayed.negativeInteractions).toBe(1);

    let relationship = betrayed;
    for (let index = 0; index < 10; index += 1) {
      relationship = advanceNpcRelationship(relationship, { event: "violence", interactionQuality: -1 }, { nowMs: 20_000 + index });
    }
    expect(relationship.loyalty).toBe(-100);
    expect(relationship.tierKey).toBe("nemesis");
  });

  test("sanitizes persistence values and recomputes forged tier labels", () => {
    const restored = sanitizeNpcRelationship({
      version: 999,
      loyalty: 8_000,
      trust: "42.5",
      fear: -50,
      reputation: Number.NaN,
      bondedMinutes: Number.POSITIVE_INFINITY,
      positiveInteractions: 1.6,
      negativeInteractions: -10,
      lastInteractionAtMs: "12345",
      lastBondDelta: -1_000,
      tierKey: "inner_circle",
      tierLabel: "FORGED",
      arbitraryCapability: { infiniteLoyalty: true },
    });

    expect(restored).toEqual({
      version: 1,
      loyalty: 100,
      trust: 42.5,
      fear: 0,
      reputation: 0,
      bondedMinutes: 0,
      positiveInteractions: 2,
      negativeInteractions: 0,
      lastInteractionAtMs: 12_345,
      lastBondDelta: -100,
      tierKey: "inner_circle",
      tierLabel: "Inner Circle",
    });
    expect(restored).not.toHaveProperty("arbitraryCapability");
    expect(sanitizeNpcRelationship(JSON.parse(JSON.stringify(restored)))).toEqual(restored);
  });

  test("reports a UI-ready loyalty meter without mutating relationship state", () => {
    const state = createNpcRelationship({ loyalty: 35 });
    const snapshot = JSON.stringify(state);
    expect(getNpcLoyaltyMeter(state.loyalty)).toEqual({
      loyalty: 35,
      percent: 67.5,
      tierKey: "familiar",
      tierLabel: "Familiar",
    });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
