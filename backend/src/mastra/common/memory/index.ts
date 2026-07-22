import { Memory } from "@mastra/memory";

import { postgresStore } from "../../config/storage.js";

const WORKING_MEMORY_TEMPLATE = `# Caso del usuario

- Hechos y fechas relatados:
- Subcategorías detectadas:
- Intereses adicionales (otros temas mencionados):
- Datos de contacto ya aportados:
- Pedido de contacto ya realizado (sí/no):
- Preferencias de respuesta:
`;

/**
 * Main (FE-facing) agents: freeform Markdown working memory owned by the
 * agent (preferences, accumulated decisions). FE-sync state NEVER goes here —
 * it travels in RequestContext.
 */
export const sharedMemory = new Memory({
  storage: postgresStore,
  options: {
    lastMessages: 10,
    generateTitle: true,
    workingMemory: {
      enabled: true,
      scope: "thread",
      template: WORKING_MEMORY_TEMPLATE,
    },
  },
});

/** Sub-agents (experts): no working memory, short history. */
export const subagentMemory = new Memory({
  storage: postgresStore,
  options: {
    lastMessages: 10,
    workingMemory: { enabled: false },
  },
});

/** Workflow agents: stateless. */
export const workflowAgentMemory = new Memory({
  storage: postgresStore,
  options: {
    lastMessages: 0,
    workingMemory: { enabled: false },
  },
});
