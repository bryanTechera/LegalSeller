import type { AgentId, ReadOnlyState } from "../../../../models/index.js";
import { subcategoriasHabilitadas } from "../../registry.js";

export function subcategoriasConsumoSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  if (agentId !== "relaciones-consumo") return null;
  const subcats = subcategoriasHabilitadas("relaciones-consumo")
    .map((s) => `- ${s.id}: ${s.descripcion}`)
    .join("\n");
  return `<subcategorias>
Determiná la(s) subcategoría(s) del caso durante la conversación y registralas con registrar-caso apenas las detectes. Un caso de consumo suele abarcar las dos a la vez: el derecho afectado (qué le deben al consultante) y la vía para reclamarlo (cómo lo exige) — registrá las que el caso toque. Subcategorías habilitadas:
${subcats}
</subcategorias>`;
}
