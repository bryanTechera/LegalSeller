import { crearAgente } from "../../common/crear-agente.js";
import { sharedMemory } from "../../common/memory/index.js";
import { registrarCasoTool } from "../../tools/casos/registrar-caso-tool.js";
import { corregirClasificacionTool } from "../../tools/clasificacion/corregir-clasificacion-tool.js";
import { searchDocumentsTool } from "../../tools/documentos/buscar-documentos-tool.js";

import { buildLaboralInstructions } from "./instructions.js";

/** Category agent for Laboral: owns the conversation and the funnel (spec §4). */
export const laboralAgent = crearAgente({
  id: "laboral",
  name: "laboralAgent",
  description: "Agente principal de la categoría Laboral: evacúa dudas con citas del corpus y capta el caso.",
  buildInstructions: buildLaboralInstructions,
  buildTools: () => ({
    [searchDocumentsTool.id]: searchDocumentsTool,
    [registrarCasoTool.id]: registrarCasoTool,
    [corregirClasificacionTool.id]: corregirClasificacionTool,
  }),
  memory: sharedMemory,
});
