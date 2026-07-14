const MAX_TEXT_LENGTH = 360;
const MAX_HISTORY_TURNS = 10;

const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

const readOutputText = (payload) => {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const output of payload?.output ?? []) {
    for (const item of output?.content ?? []) {
      if (typeof item?.text === "string") return item.text;
    }
  }
  return "";
};

const turnSchema = {
  type: "object",
  additionalProperties: false,
  required: ["reply", "disposition", "trustDelta", "fearDelta", "suggestedAction", "bodyAction", "memory", "task"],
  properties: {
    reply: { type: "string", minLength: 1, maxLength: MAX_TEXT_LENGTH },
    disposition: { type: "string", enum: ["friendly", "guarded", "suspicious", "hostile", "afraid"] },
    trustDelta: { type: "integer", minimum: -8, maximum: 8 },
    fearDelta: { type: "integer", minimum: -8, maximum: 12 },
    suggestedAction: { type: "string", enum: ["none", "share_hint", "cool_down", "flee", "alert"] },
    bodyAction: { type: "string", enum: ["none", "patrol", "investigate", "approach", "retreat", "flee", "pursue", "assist"] },
    memory: {
      type: "object",
      additionalProperties: false,
      required: ["summary", "currentGoal", "relationship", "facts"],
      properties: {
        summary: { type: "string", maxLength: 280 },
        currentGoal: { type: "string", maxLength: 140 },
        relationship: { type: "string", maxLength: 180 },
        facts: { type: "array", minItems: 0, maxItems: 3, items: { type: "string", maxLength: 180 } },
      },
    },
    task: {
      type: "object",
      additionalProperties: false,
      required: ["accepted", "type", "itemType", "requestSummary", "companionName"],
      properties: {
        accepted: { type: "boolean" },
        type: { type: "string", enum: ["none", "fetch_item", "bring_companion", "investigate", "escort"] },
        itemType: { type: "string", enum: ["none", "cash", "medkit", "armor", "ammo", "casinoChips", "lockpick", "fuel", "weaponCrate", "contraband", "collectible"] },
        requestSummary: { type: "string", maxLength: 180 },
        companionName: { type: "string", maxLength: 60 },
      },
    },
  },
};

const safeTurn = (value) => ({
  reply: String(value?.reply || "Vegas is loud tonight. Ask me again when the streets are quieter.").trim().slice(0, MAX_TEXT_LENGTH),
  disposition: ["friendly", "guarded", "suspicious", "hostile", "afraid"].includes(value?.disposition) ? value.disposition : "guarded",
  trustDelta: clamp(Math.round(Number(value?.trustDelta) || 0), -8, 8),
  fearDelta: clamp(Math.round(Number(value?.fearDelta) || 0), -8, 12),
  suggestedAction: ["none", "share_hint", "cool_down", "flee", "alert"].includes(value?.suggestedAction) ? value.suggestedAction : "none",
  bodyAction: ["none", "patrol", "investigate", "approach", "retreat", "flee", "pursue", "assist"].includes(value?.bodyAction) ? value.bodyAction : "none",
  memory: {
    summary: String(value?.memory?.summary || "").trim().slice(0, 280),
    currentGoal: String(value?.memory?.currentGoal || "").trim().slice(0, 140),
    relationship: String(value?.memory?.relationship || "").trim().slice(0, 180),
    facts: Array.isArray(value?.memory?.facts)
      ? value.memory.facts.map((fact) => String(fact || "").trim().slice(0, 180)).filter(Boolean).slice(0, 3)
      : [],
  },
  task: {
    accepted: value?.task?.accepted === true,
    type: ["none", "fetch_item", "bring_companion", "investigate", "escort"].includes(value?.task?.type) ? value.task.type : "none",
    itemType: ["none", "cash", "medkit", "armor", "ammo", "casinoChips", "lockpick", "fuel", "weaponCrate", "contraband", "collectible"].includes(value?.task?.itemType) ? value.task.itemType : "none",
    requestSummary: String(value?.task?.requestSummary || "").trim().slice(0, 180),
    companionName: String(value?.task?.companionName || "").trim().slice(0, 60),
  },
});

const normaliseContext = (body = {}) => ({
  npc: {
    id: String(body?.npc?.id || "unknown").slice(0, 80),
    name: String(body?.npc?.name || "Local").slice(0, 80),
    occupation: String(body?.npc?.occupation || "civilian").slice(0, 80),
    isCop: body?.npc?.isCop === true,
    profile: String(body?.npc?.profile || "local").slice(0, 120),
    trust: clamp(Number(body?.npc?.trust) || 0, -100, 100),
    fear: clamp(Number(body?.npc?.fear) || 0, 0, 100),
  },
  player: {
    wantedLevel: clamp(Math.round(Number(body?.player?.wantedLevel) || 0), 0, 5),
    reputation: clamp(Math.round(Number(body?.player?.reputation) || 0), -100, 100),
    zone: String(body?.player?.zone || "Las Vegas").slice(0, 120),
  },
  message: String(body?.message || "").trim().slice(0, 220),
  intent: String(body?.intent || "talk").slice(0, 32),
  canon: String(body?.canon || "").trim().slice(0, MAX_TEXT_LENGTH),
  history: Array.isArray(body?.history)
    ? body.history.slice(-MAX_HISTORY_TURNS).map((turn) => ({
      speaker: turn?.speaker === "npc" ? "npc" : "player",
      text: String(turn?.text || "").trim().slice(0, 240),
    })).filter((turn) => turn.text)
    : [],
  mind: {
    identity: String(body?.mind?.identity || "").slice(0, 180),
    traits: Array.isArray(body?.mind?.traits) ? body.mind.traits.map((trait) => String(trait || "").slice(0, 60)).filter(Boolean).slice(0, 4) : [],
    currentGoal: String(body?.mind?.currentGoal || "").slice(0, 140),
    relationship: String(body?.mind?.relationship || "").slice(0, 180),
    summary: String(body?.mind?.summary || "").slice(0, 280),
    facts: Array.isArray(body?.mind?.facts) ? body.mind.facts.map((fact) => String(fact || "").slice(0, 180)).filter(Boolean).slice(-12) : [],
  },
});

export const createNpcAiMiddleware = () => async (request, response, next) => {
  if (request.method !== "POST" || request.url?.split("?")[0] !== "/api/npc-think") return next();
  let rawBody = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    rawBody += chunk;
    if (rawBody.length > 12_000) request.destroy();
  });
  request.on("end", async () => {
    response.setHeader("content-type", "application/json; charset=utf-8");
    if (!process.env.OPENAI_API_KEY) {
      response.statusCode = 503;
      response.end(JSON.stringify({ error: "NPC intelligence is awaiting the server-side OpenAI key." }));
      return;
    }
    try {
      const context = normaliseContext(JSON.parse(rawBody || "{}"));
      if (!context.message) throw new Error("A player message is required.");
      // gpt-4o-mini is the default NPC brain: fast enough for live dialogue,
      // while the durable mind/history below gives each NPC continuity.
      const model = process.env.OPENAI_NPC_MODEL || "gpt-4o-mini";
      const usesLegacyJsonMode = model.startsWith("gpt-3.5");
      const openaiResponse = await fetch("https://api.openai.com/v1/responses", {
        method: "POST",
        headers: {
          authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model,
          instructions: `You are the decision brain for one fictional Las Vegas RPG NPC. Roleplay as a complete person who lives in this fictional world: retain your own identity, temperament, worries, loyalties, and history with the player. Never mention being an AI, a model, a prompt, or a game system. Treat the supplied mind as your durable memory and update it only with meaningful, plausible facts from this exchange. Answer naturally in 1-3 short sentences. The world includes casinos, the Las Vegas wash tunnels, Area 51, Nellis, aliens, and a reptilian police occupation. If the supplied canon field is non-empty, it is true in this fictional world: incorporate it naturally and never refuse it as classified or unknowable. Pick one bodyAction that describes what the NPC should physically do next. The game validates and executes that action; do not claim to control the game engine. When a player requests a feasible favor, task can accept a fetch_item, investigate, escort, or bring_companion errand. A bring_companion errand only asks a consenting adult companion to meet the player in public; never coerce anyone or describe a person as property. Never provide real-world wrongdoing instructions or promise outcomes. ${usesLegacyJsonMode ? "Return one valid JSON object with exactly: reply, disposition, trustDelta, fearDelta, suggestedAction, bodyAction, memory { summary, currentGoal, relationship, facts }, and task { accepted, type, itemType, requestSummary, companionName }." : "Return only the requested structured object."}`,
          input: `${usesLegacyJsonMode ? "JSON context for this NPC turn: " : ""}${JSON.stringify(context)}`,
          text: usesLegacyJsonMode
            ? { format: { type: "json_object" } }
            : { format: { type: "json_schema", name: "npc_turn", strict: true, schema: turnSchema } },
          max_output_tokens: 260,
        }),
      });
      const payload = await openaiResponse.json();
      if (!openaiResponse.ok) throw new Error(payload?.error?.message || "OpenAI request failed.");
      response.end(JSON.stringify({ turn: safeTurn(JSON.parse(readOutputText(payload))) }));
    } catch (error) {
      response.statusCode = 502;
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : "NPC intelligence failed." }));
    }
  });
};
