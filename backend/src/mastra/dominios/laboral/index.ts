import { crearAgente } from "../../common/crear-agente.js";
import { sharedMemory } from "../../common/memory/index.js";
import { MODELO_ESPECIALISTA } from "../../config/modelos.js";
import { crearSkillTools } from "../../skills/tool-skills/index.js";
import { derivarTemaTool } from "../../tools/casos/derivar-tema-tool.js";
import { crearRegistrarCasoTool } from "../../tools/casos/registrar-caso-tool.js";
import { corregirClasificacionTool } from "../../tools/clasificacion/corregir-clasificacion-tool.js";
import { searchDocumentsTool } from "../../tools/documentos/buscar-documentos-tool.js";

import { buildLaboralInstructions } from "./instructions.js";

const registrarCasoTool = crearRegistrarCasoTool("laboral");

/** Category agent for Laboral: owns the conversation and the funnel (spec §4). */
export const laboralAgent = crearAgente({
  id: "laboral",
  name: "laboralAgent",
  description: "Agente principal de la categoría Laboral: evacúa dudas con citas del corpus y capta el caso.",
  buildInstructions: buildLaboralInstructions,
  buildTools: (readOnly) => ({
    [searchDocumentsTool.id]: searchDocumentsTool,
    [registrarCasoTool.id]: registrarCasoTool,
    [corregirClasificacionTool.id]: corregirClasificacionTool,
    [derivarTemaTool.id]: derivarTemaTool,
    ...crearSkillTools("laboral", readOnly),
  }),
  model: MODELO_ESPECIALISTA,
  memory: sharedMemory,
});
