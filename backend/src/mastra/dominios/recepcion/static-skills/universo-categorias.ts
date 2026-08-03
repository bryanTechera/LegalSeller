import type { AgentId, ReadOnlyState } from "../../../../models/index.js";
import { CATEGORIAS, categoriasHabilitadas, subcategoriasHabilitadas } from "../../registry.js";

export function universoCategoriasSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  if (agentId !== "recepcion") return null;
  const habilitadas = categoriasHabilitadas()
    .map((c) => {
      // El schema de asignar-clasificacion solo expone los IDs de subcategoría;
      // sin estas descripciones el receptor adivina la frontera por el nombre
      // (p. ej. la pensión entre excónyuges caía en pension-tenencia-visitas).
      const subs = subcategoriasHabilitadas(c.id)
        .map((s) => `${s.id} (${s.descripcion})`)
        .join(" · ");
      const lineaSubs = subs.length > 0 ? `\n  Subcategorías: ${subs}` : "";
      return `- ${c.id}: ${c.descripcion} Señales: ${c.seniales.join("; ")}${lineaSubs}`;
    })
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
