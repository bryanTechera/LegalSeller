import { crearAgente } from "../../common/crear-agente.js";
import { sharedMemory } from "../../common/memory/index.js";
import { MODELO_ESPECIALISTA } from "../../config/modelos.js";
import { crearSkillTools } from "../../skills/tool-skills/index.js";
import { registrarCasoTool } from "../../tools/casos/registrar-caso-tool.js";
import { corregirClasificacionTool } from "../../tools/clasificacion/corregir-clasificacion-tool.js";
import { searchDocumentsTool } from "../../tools/documentos/buscar-documentos-tool.js";

import { buildRelacionesConsumoInstructions } from "./instructions.js";

/** Category agent for Relaciones de consumo: owns the conversation and the funnel (spec §4). */
export const relacionesConsumoAgent = crearAgente({
  id: "relaciones-consumo",
  name: "relacionesConsumoAgent",
  description:
    "Agente principal de la categoría Relaciones de consumo: evacúa dudas con citas del corpus y capta el caso.",
  buildInstructions: buildRelacionesConsumoInstructions,
  buildTools: (readOnly) => ({
    [searchDocumentsTool.id]: searchDocumentsTool,
    [registrarCasoTool.id]: registrarCasoTool,
    [corregirClasificacionTool.id]: corregirClasificacionTool,
    ...crearSkillTools("relaciones-consumo", readOnly),
  }),
  model: MODELO_ESPECIALISTA,
  memory: sharedMemory,
});
