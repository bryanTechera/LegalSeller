import type { AgentId, ReadOnlyState } from "../../../../models/index.js";
import { subcategoriasHabilitadas } from "../../registry.js";

export function subcategoriasArrendamientoSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  if (agentId !== "arrendamiento-desalojo") return null;
  const subcats = subcategoriasHabilitadas("arrendamiento-desalojo")
    .map((s) => `- ${s.id}: ${s.descripcion}`)
    .join("\n");
  return `<subcategorias>
Determiná la(s) subcategoría(s) del caso durante la conversación y registralas con registrar-caso apenas las detectes. Un caso puede abarcar varias a la vez (un desalojo por falta de pago suele sumar el cobro de los alquileres adeudados). Las tres subcategorías de desalojo se distinguen por el régimen del contrato: determiná el régimen (destino, garantía, sometimiento expreso a la Ley 19.889) antes de registrar una de ellas; mientras el régimen no esté claro, registrá los hechos en el brief sin subcategoría de desalojo. Subcategorías habilitadas:
${subcats}
</subcategorias>`;
}
