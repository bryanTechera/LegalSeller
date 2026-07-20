import type { AgentId, ReadOnlyState } from "../../../../models/index.js";
import { subcategoriasHabilitadas } from "../../registry.js";

export function subcategoriasLaboralSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  if (agentId !== "laboral") return null;
  const subcats = subcategoriasHabilitadas("laboral")
    .map((s) => `- ${s.id}: ${s.descripcion}`)
    .join("\n");
  return `<subcategorias>
Determiná la(s) subcategoría(s) del caso durante la conversación y registralas con registrar-caso apenas las detectes. Subcategorías habilitadas:
${subcats}
</subcategorias>`;
}
