import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());

test.describe("NPC GPT intelligence contract", () => {
  test("defaults the server brain to gpt-4o-mini and sends durable mind context", () => {
    const server = readFileSync(resolve(root, "npcAiServer.js"), "utf8");
    const client = readFileSync(resolve(root, "src/main.js"), "utf8");
    expect(server).toContain('process.env.OPENAI_NPC_MODEL || "gpt-4o-mini"');
    expect(server).toContain("mind:");
    expect(server).toContain("history:");
    expect(client).toContain('fetch("/api/npc-think"');
    expect(client).toContain("mind: npcMindFor(npc)");
    expect(client).toContain("history: conversationTurnsFor(npc)");
  });

  test("durable NPC memories are bounded and saved", () => {
    const client = readFileSync(resolve(root, "src/main.js"), "utf8");
    expect(client).toContain("sanitizeNpcMindMemory");
    expect(client).toContain("npcMinds");
    expect(client).toContain("rememberNpcMind(npc, turn.memory)");
  });
});
