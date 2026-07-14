import { defineConfig, loadEnv } from "vite";
import { createNpcAiMiddleware } from "./npcAiServer.js";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  if (env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY) process.env.OPENAI_API_KEY = env.OPENAI_API_KEY;
  if (env.OPENAI_NPC_MODEL && !process.env.OPENAI_NPC_MODEL) process.env.OPENAI_NPC_MODEL = env.OPENAI_NPC_MODEL;
  return {
  build: {
    copyPublicDir: process.env.SIN_CITY_COPY_PUBLIC !== "0",
  },
  plugins: [
    {
      name: "sin-city-openai-npc-ai",
      configureServer(server) {
        server.middlewares.use(createNpcAiMiddleware());
      },
    },
  ],
  };
});
