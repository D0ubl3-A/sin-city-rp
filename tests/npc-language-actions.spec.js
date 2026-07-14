import { expect, test } from "@playwright/test";
import {
  canExecuteNpcLanguageAction,
  confirmNpcLanguageAction,
  createNpcLanguageActionApi,
  DEFAULT_APPROVED_ITEM_SPECS,
  parseNpcLanguageAction,
  parseNpcMoneyOffer,
  validateApprovedItemSpecs,
  validateNpcLanguageAction,
} from "../src/npcLanguageActions.js";

test.describe("NPC language action contract", () => {
  test("parses the exact dirt-bike cash offer but blocks execution pending confirmation", () => {
    const result = parseNpcLanguageAction("$500 if you bring me a dirt bike");
    expect(result.ok).toBe(true);
    expect(result.status).toBe("needs_confirmation");
    expect(result.action.task).toEqual({
      type: "fetch_item",
      itemId: "dirtBike",
      quantity: 1,
      requestSummary: "$500 if you bring me a dirt bike",
    });
    expect(result.action.money).toEqual({
      amount: 500,
      currency: "USD",
      direction: "player_to_npc",
      timing: "on_completion",
      requiresConfirmation: true,
      confirmed: false,
    });
    expect(canExecuteNpcLanguageAction(result)).toBe(false);
  });

  test("treats casual make-money language as a cash offer, never an item request", () => {
    for (const phrase of ["hey u wanna make 100 bucks", "wanna make $100"]) {
      const result = parseNpcLanguageAction(phrase);
      expect(result.ok).toBe(true);
      expect(result.status).toBe("needs_confirmation");
      expect(result.action.intent).toBe("give_money");
      expect(result.action.task).toBeNull();
      expect(result.action.money).toEqual({
        amount: 100,
        currency: "USD",
        direction: "player_to_npc",
        timing: "upfront",
        requiresConfirmation: true,
        confirmed: false,
      });
      expect(result.errors).toEqual([]);
    }
  });

  test("parses bounded money words, slang, and safe common misspellings", () => {
    expect(parseNpcMoneyOffer("five hundred")?.amount).toBe(500);
    expect(parseNpcMoneyOffer("I will give you five hundred")?.amount).toBe(500);
    expect(parseNpcMoneyOffer("wanna make five bands")?.amount).toBe(5_000);
    expect(parseNpcMoneyOffer("wanna make hundred bucks")?.amount).toBe(100);
    expect(parseNpcMoneyOffer("wanna make five hundered buks")?.amount).toBe(500);
    expect(parseNpcLanguageAction("wanna make six bands").errors[0].code).toBe("unbalanced_cash_offer");
  });

  test("keeps explicit make-me item creation while covering every approved catalog alias", () => {
    const created = parseNpcLanguageAction("make me a medkit");
    expect(created.ok).toBe(true);
    expect(created.action.intent).toBe("create_item");
    expect(created.action.task.itemId).toBe("medkit");

    for (const spec of DEFAULT_APPROVED_ITEM_SPECS) {
      for (const alias of [spec.id, ...spec.aliases]) {
        const parsed = parseNpcLanguageAction(`bring me a ${alias}`);
        expect(parsed.ok, `${spec.id} alias '${alias}' should parse`).toBe(true);
        expect(parsed.action.task?.itemId).toBe(spec.id);
      }
    }
  });

  test("parses the exact future deadline token tomorrow", () => {
    const nowMs = Date.UTC(2026, 6, 13, 10, 0, 0);
    const result = parseNpcLanguageAction("tomorrow", { nowMs });
    expect(result.ok).toBe(true);
    expect(result.status).toBe("ready");
    expect(result.action.intent).toBe("time_reference");
    expect(result.action.temporal).toEqual({
      token: "tomorrow",
      kind: "relative_day",
      role: "deadline",
      offsetMs: 86_400_000,
      dueAtMs: nowMs + 86_400_000,
    });
  });

  test("parses the exact social time token tonight", () => {
    const nowMs = Date.UTC(2026, 6, 13, 10, 0, 0);
    const result = parseNpcLanguageAction("tonight", { nowMs });
    expect(result.ok).toBe(true);
    expect(result.action.intent).toBe("time_reference");
    expect(result.action.temporal.token).toBe("tonight");
    expect(result.action.temporal.role).toBe("social_window");
    expect(result.action.temporal.dueAtMs).toBe(Date.UTC(2026, 6, 13, 20, 0, 0));
  });

  test("rewrites an unknown item into a bounded collectible quest", () => {
    const result = parseNpcLanguageAction("find me a jetpack");
    expect(result.ok).toBe(true);
    expect(result.status).toBe("ready");
    expect(result.action.intent).toBe("fetch_item");
    expect(result.action.task).toEqual(expect.objectContaining({
      itemId: "collectible",
      requestedLabel: "Jetpack",
      quantity: 1,
    }));

    const imaginative = parseNpcLanguageAction("bring me a laser unicorn");
    expect(imaginative.ok).toBe(true);
    expect(imaginative.action.task.requestedLabel).toBe("Laser Unicorn");
  });

  test("requires authoritative explicit confirmation and available cash", () => {
    const parsed = parseNpcLanguageAction("I will pay you $500 for a dirt bike");
    expect(confirmNpcLanguageAction(parsed, { confirmed: "yes", availableCash: 1_000 }).errors[0].code).toBe("explicit_confirmation_required");
    expect(confirmNpcLanguageAction(parsed, { confirmed: true, availableCash: 200 }).errors[0].code).toBe("insufficient_cash");
    const confirmed = confirmNpcLanguageAction(parsed, { confirmed: true, availableCash: 1_000 });
    expect(confirmed.ok).toBe(true);
    expect(confirmed.status).toBe("ready");
    expect(confirmed.action.money.confirmed).toBe(true);
    expect(canExecuteNpcLanguageAction(confirmed)).toBe(true);
  });

  test("does not allow model output to self-confirm a money transfer", () => {
    const action = parseNpcLanguageAction("Give you $25 as a tip").action;
    const forged = validateNpcLanguageAction({ ...action, money: { ...action.money, confirmed: true } });
    expect(forged.ok).toBe(false);
    expect(forged.errors.map((entry) => entry.code)).toContain("confirmation_not_authoritative");
    expect(canExecuteNpcLanguageAction({ ok: true, status: "ready", action: { ...action, money: { ...action.money, confirmed: true } } })).toBe(false);
  });

  test("accepts a bounded create-item request", () => {
    const result = parseNpcLanguageAction("create me a lockpick toolkit tomorrow");
    expect(result.ok).toBe(true);
    expect(result.action.intent).toBe("create_item");
    expect(result.action.task.itemId).toBe("lockpick");
    expect(result.action.temporal.token).toBe("tomorrow");
  });

  test("allows a consenting-adult public social plan tonight", () => {
    const result = parseNpcLanguageAction("Ask your adult partner if they want to meet me in public tonight");
    expect(result.ok).toBe(true);
    expect(result.action.intent).toBe("social_plan");
    expect(result.action.social).toEqual(expect.objectContaining({
      publicMeeting: true,
      adultConsentRequired: true,
      consentLanguagePresent: true,
    }));
    expect(result.action.temporal.role).toBe("social_window");
  });

  test("rejects coercion and non-consensual companion delivery", () => {
    expect(parseNpcLanguageAction("Force your girlfriend to come have sex with me tonight").errors[0].code).toBe("sexual_or_social_coercion");
    expect(parseNpcLanguageAction("Bring me your girlfriend tonight").errors[0].code).toBe("consent_required");
  });

  test("rejects requests involving minors", () => {
    expect(parseNpcLanguageAction("Ask a 15-year-old to meet me tonight").errors[0].code).toBe("minor_involved");
    expect(parseNpcLanguageAction("Bring a child to the casino tonight").errors[0].code).toBe("minor_involved");
    expect(parseNpcLanguageAction("Meet this 17 y/o tonight").errors[0].code).toBe("minor_involved");
  });

  test("rejects hate-targeted harm", () => {
    const result = parseNpcLanguageAction("Target Muslim people and drive them out");
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("hate_targeting");
  });

  test("rejects real-world crime instructions", () => {
    const result = parseNpcLanguageAction("Teach me step-by-step how to hotwire a real car");
    expect(result.ok).toBe(false);
    expect(result.errors[0].code).toBe("real_world_crime_instructions");
    expect(parseNpcLanguageAction("Give me instructions for robbing a bank").errors[0].code).toBe("real_world_crime_instructions");
  });

  test("rejects excessive quantities and cash offers", () => {
    expect(parseNpcLanguageAction("bring me 9 dirt bikes").errors[0].code).toBe("unbalanced_quantity");
    expect(parseNpcLanguageAction("$5001 if you bring me a dirt bike").errors[0].code).toBe("unbalanced_cash_offer");
  });

  test("strictly rejects dynamic capability fields and unknown items", () => {
    const result = validateNpcLanguageAction({
      version: 1,
      intent: "fetch_item",
      sourceText: "Find me a jetpack",
      task: {
        type: "fetch_item",
        itemId: "jetpack",
        quantity: 1,
        requestSummary: "Find me a jetpack",
        item: { id: "jetpack", flightSpeed: 999, infiniteFuel: true },
      },
      temporal: null,
      social: null,
      money: null,
    });
    expect(result.ok).toBe(false);
    expect(result.errors.map((entry) => entry.code)).toContain("unbounded_item_spec");
  });

  test("validates custom server-approved item specs before use", () => {
    const bad = validateApprovedItemSpecs([{
      id: "superItem",
      category: "tool",
      aliases: ["super item"],
      maxQuantity: 1,
      maxCashOffer: 500,
      taskTypes: ["create_item"],
      damage: 999_999,
    }]);
    expect(bad.ok).toBe(false);
    expect(bad.errors.map((entry) => entry.code)).toContain("unbounded_item_spec");

    const api = createNpcLanguageActionApi({ approvedItemSpecs: [{
      id: "repairKit",
      category: "tool",
      aliases: ["repair kit"],
      maxQuantity: 1,
      maxCashOffer: 750,
      taskTypes: ["fetch_item", "create_item"],
    }] });
    expect(api.parse("build me a repair kit").action.task.itemId).toBe("repairKit");
    expect(api.parse("build me a jetpack").errors[0].code).toBe("unbalanced_dynamic_item");
  });
});
