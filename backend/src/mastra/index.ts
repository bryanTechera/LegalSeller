import { Mastra } from "@mastra/core/mastra";
import { registerApiRoute } from "@mastra/core/server";
import { Observability, MastraStorageExporter } from "@mastra/observability";

import { makeLogger } from "./common/logger.js";
import { postgresStore } from "./config/storage.js";
import { buildDominiosPayload } from "./dominios/api-dominios.js";
import { arrendamientoDesalojoAgent } from "./dominios/arrendamiento-desalojo/index.js";
import { familiaAgent } from "./dominios/familia/index.js";
import { laboralAgent } from "./dominios/laboral/index.js";
import { recepcionAgent } from "./dominios/recepcion/index.js";
import { relacionesConsumoAgent } from "./dominios/relaciones-consumo/index.js";
import { transitoAgent } from "./dominios/transito/index.js";
import { manejarPedidoDeSintesis } from "./sintesis/manejar-pedido-sintesis.js";

export const mastra = new Mastra({
  agents: {
    recepcionAgent,
    laboralAgent,
    familiaAgent,
    transitoAgent,
    arrendamientoDesalojoAgent,
    relacionesConsumoAgent,
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
      // Igual que /dominios: fuera del prefijo `/api`, que Mastra rechaza al
      // boot para rutas custom. Lo consume el BFF (`agent-service.ts`), nunca
      // el browser. El dispatch vive en manejarPedidoDeSintesis — testeable
      // sin server — para que este handler quede como cableado puro.
      registerApiRoute("/sintesis-caso", {
        method: "POST",
        handler: async (c) => {
          const { resultado, status } = await manejarPedidoDeSintesis(() => c.req.json());
          return c.json(resultado, status);
        },
      }),
    ],
  },
  logger: makeLogger("Mastra"),
});
