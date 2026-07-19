import type { AgentId, ReadOnlyState } from "../../../../models/index.js";
import { CATEGORIAS, categoriasHabilitadas } from "../../registry.js";

export function universoCategoriasSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  if (agentId !== "recepcion") return null;
  const habilitadas = categoriasHabilitadas()
    .map((c) => `- ${c.id}: ${c.descripcion} Señales: ${c.seniales.join("; ")}`)
    .join("\n");
  const noHabilitadas = CATEGORIAS.filter((c) => !c.habilitada)
    .map((c) => `- ${c.nombre}: ${c.descripcion}`)
    .join("\n");
  return `<categorias_habilitadas>
${habilitadas}
</categorias_habilitadas>

<temas_aun_no_cubiertos>
${noHabilitadas}
</temas_aun_no_cubiertos>`;
}
