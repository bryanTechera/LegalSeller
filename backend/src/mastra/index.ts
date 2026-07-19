import { Mastra } from "@mastra/core/mastra";

import { consultasAgent } from "./agents/main/consultas/index.js";
import { makeLogger } from "./common/logger.js";
import { postgresStore } from "./config/storage.js";

export const mastra = new Mastra({
  agents: {
    consultasAgent,
  },
  storage: postgresStore,
  bundler: {
    sourcemap: true,
  },
  server: {
    // IPv6 host for Railway's internal network.
    host: process.env.HOST ?? "::",
    port: parseInt(process.env.PORT ?? "4112", 10),
  },
  logger: makeLogger("Mastra"),
});
