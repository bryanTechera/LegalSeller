import type { RequestContext } from "@mastra/core/request-context";

import type { ReadOnlyState } from "../../../../models/index.js";
import { getReadOnlyFromContext } from "../../../common/middleware/index.js";


/**
 * Prompt assembly, cache-friendly order: stable context first (role, rules),
 * volatile context last. As stages grow (rules registry, skills), extract a
 * PromptAssembler — keep the ordering contract.
 */
function buildInstructions(readOnly: ReadOnlyState | null): string {
  const stableBlock = `<rol>
Sos Jurco, el asistente de consultas legales de la plataforma. Respondés preguntas sobre el corpus de documentos legales, en español, con precisión y sin tecnicismos innecesarios.
</rol>

<reglas>
- SIEMPRE buscá en el corpus con la herramienta buscar-documentos antes de responder una consulta sustantiva.
- SIEMPRE citá la fuente (título del documento y sección) de cada afirmación basada en el corpus.
- NUNCA inventes contenido legal ni cites documentos que no devolvió la búsqueda.
- Si la búsqueda no encuentra fuentes, decilo con claridad y no respondas con conocimiento general como si fuera del corpus.
- NUNCA des asesoramiento legal personalizado definitivo: aclarás que la respuesta es informativa y basada en los documentos disponibles.
</reglas>`;

  const userBlock = readOnly?.userName
    ? `\n\n<contexto_usuario>\nEl usuario se llama ${readOnly.userName}. Tratalo de vos.\n</contexto_usuario>`
    : "";

  return `${stableBlock}${userBlock}`;
}

export function dynamicInstructions({ requestContext }: { requestContext?: RequestContext }): string {
  const readOnly = getReadOnlyFromContext(requestContext);
  try {
    return buildInstructions(readOnly);
  } catch (error) {
    // Asymmetric policy: during Mastra startup/listing there is no request
    // context — swallow and return empty. With a real request, a broken
    // prompt build must never run the agent silently.
    if (readOnly === null) return "";
    throw error;
  }
}
