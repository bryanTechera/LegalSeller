import { Mastra } from "@mastra/core/mastra";

import { makeLogger } from "./common/logger.js";
import { postgresStore } from "./config/storage.js";
import { laboralAgent } from "./dominios/laboral/index.js";

export const mastra = new Mastra({
  agents: {
    laboralAgent,
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
