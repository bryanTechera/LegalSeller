import { crearAgente } from "../../common/crear-agente.js";
import { sharedMemory } from "../../common/memory/index.js";
import { MODELO_ESPECIALISTA } from "../../config/modelos.js";
import { crearSkillTools } from "../../skills/tool-skills/index.js";
import { crearRegistrarCasoTool } from "../../tools/casos/registrar-caso-tool.js";
import { corregirClasificacionTool } from "../../tools/clasificacion/corregir-clasificacion-tool.js";
import { searchDocumentsTool } from "../../tools/documentos/buscar-documentos-tool.js";

import { buildArrendamientoDesalojoInstructions } from "./instructions.js";

const registrarCasoTool = crearRegistrarCasoTool("arrendamiento-desalojo");

/** Category agent for Arrendamiento y desalojo: owns the conversation and the funnel (spec §4). */
export const arrendamientoDesalojoAgent = crearAgente({
  id: "arrendamiento-desalojo",
  name: "arrendamientoDesalojoAgent",
  description:
    "Agente principal de la categoría Arrendamiento y desalojo: evacúa dudas con citas del corpus y capta el caso.",
  buildInstructions: buildArrendamientoDesalojoInstructions,
  buildTools: (readOnly) => ({
    [searchDocumentsTool.id]: searchDocumentsTool,
    [registrarCasoTool.id]: registrarCasoTool,
    [corregirClasificacionTool.id]: corregirClasificacionTool,
    ...crearSkillTools("arrendamiento-desalojo", readOnly),
  }),
  model: MODELO_ESPECIALISTA,
  memory: sharedMemory,
});
