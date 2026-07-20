import { Mastra } from "@mastra/core/mastra";
import { registerApiRoute } from "@mastra/core/server";
import { Observability, MastraStorageExporter } from "@mastra/observability";

import { makeLogger } from "./common/logger.js";
import { postgresStore } from "./config/storage.js";
import { buildDominiosPayload } from "./dominios/api-dominios.js";
import { laboralAgent } from "./dominios/laboral/index.js";
import { recepcionAgent } from "./dominios/recepcion/index.js";

export const mastra = new Mastra({
  agents: {
    recepcionAgent,
    laboralAgent,
  },
  storage: postgresStore,
  observability: new Observability({
    configs: {
      default: {
        serviceName: "legalseller-backend",
        exporters: [new MastraStorageExporter()],
      },
    },
  }),
  bundler: {
    sourcemap: true,
  },
  server: {
    // IPv6 host for Railway's internal network.
    host: process.env.HOST ?? "::",
    port: parseInt(process.env.PORT ?? "4112", 10),
    apiRoutes: [
      // NOTE: custom routes can't live under the built-in `/api` prefix (Mastra
      // rejects it at boot — see docs/guia-codificacion-backend.md §3). Route
      // lives at /dominios; Task 10's BFF fetch must target that, not /api/dominios.
      registerApiRoute("/dominios", {
        method: "GET",
        handler: (c) => c.json(buildDominiosPayload()),
      }),
    ],
  },
  logger: makeLogger("Mastra"),
});
