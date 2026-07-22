import { crearAgente } from "../../common/crear-agente.js";
import { sharedMemory } from "../../common/memory/index.js";
import { crearSkillTools } from "../../skills/tool-skills/index.js";
import { registrarCasoTool } from "../../tools/casos/registrar-caso-tool.js";
import { corregirClasificacionTool } from "../../tools/clasificacion/corregir-clasificacion-tool.js";
import { searchDocumentsTool } from "../../tools/documentos/buscar-documentos-tool.js";

import { buildFamiliaInstructions } from "./instructions.js";

/** Category agent for Familia: owns the conversation and the funnel (spec §4). */
export const familiaAgent = crearAgente({
  id: "familia",
  name: "familiaAgent",
  description: "Agente principal de la categoría Familia: evacúa dudas con citas del corpus y capta el caso.",
  buildInstructions: buildFamiliaInstructions,
  buildTools: (readOnly) => ({
    [searchDocumentsTool.id]: searchDocumentsTool,
    [registrarCasoTool.id]: registrarCasoTool,
    [corregirClasificacionTool.id]: corregirClasificacionTool,
    ...crearSkillTools("familia", readOnly),
  }),
  memory: sharedMemory,
});
