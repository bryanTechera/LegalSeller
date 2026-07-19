import { crearAgente } from "../../common/crear-agente.js";
import { subagentMemory } from "../../common/memory/index.js";
import { registrarCasoTool } from "../../tools/casos/registrar-caso-tool.js";
import { asignarClasificacionTool } from "../../tools/clasificacion/asignar-clasificacion-tool.js";

import { buildRecepcionInstructions } from "./instructions.js";

/**
 * Global receptor. Runs with memory readOnly (the BFF sends
 * memory.options.readOnly: true): reads thread history but persists nothing —
 * the category agent owns the durable turn (spec §7).
 */
export const recepcionAgent = crearAgente({
  id: "recepcion",
  name: "recepcionAgent",
  description: "Receptor global: conversa lo mínimo para clasificar la consulta en una categoría habilitada.",
  buildInstructions: buildRecepcionInstructions,
  buildTools: () => ({
    [asignarClasificacionTool.id]: asignarClasificacionTool,
    [registrarCasoTool.id]: registrarCasoTool,
  }),
  memory: subagentMemory,
  maxSteps: 5,
});
