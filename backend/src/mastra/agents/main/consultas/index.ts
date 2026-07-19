import { gateway } from "@ai-sdk/gateway";
import { Agent } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";

import { sharedMemory } from "../../../common/memory/index.js";
import { getReadOnlyFromContext } from "../../../common/middleware/index.js";

import { dynamicInstructions } from "./instructions.js";
import { buildTools } from "./tools.js";


function dynamicTools({ requestContext }: { requestContext?: RequestContext }) {
  return buildTools(getReadOnlyFromContext(requestContext));
}

function dynamicOptions() {
  return {
    // maxSteps must live here — Mastra v1 drops it from the constructor.
    maxSteps: 10,
    modelSettings: {
      // Explicit: the gateway defaults to 0 and Gemini 3 loops at temperature 0.
      temperature: 1,
    },
    providerOptions: {
      gateway: {
        // Pin provider order so Gemini implicit caching applies.
        order: ["google", "vertex"],
      },
    },
  };
}

export const consultasAgent = new Agent({
  id: "consultas",
  name: "consultasAgent",
  description:
    "Agente principal de consultas: responde preguntas de usuarios sobre el corpus de documentos legales, citando fuentes.",
  instructions: dynamicInstructions,
  memory: sharedMemory,
  tools: dynamicTools,
  model: gateway("google/gemini-3-flash"),
  maxRetries: 3,
  defaultOptions: dynamicOptions,
});
