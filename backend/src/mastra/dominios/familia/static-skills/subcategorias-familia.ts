import type { AgentId, ReadOnlyState } from "../../../../models/index.js";
import { subcategoriasHabilitadas } from "../../registry.js";

export function subcategoriasFamiliaSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  if (agentId !== "familia") return null;
  const subcats = subcategoriasHabilitadas("familia")
    .map((s) => `- ${s.id}: ${s.descripcion}`)
    .join("\n");
  return `<subcategorias>
Determiná la(s) subcategoría(s) del caso durante la conversación y registralas con registrar-caso apenas las detectes. Un caso de familia puede abarcar varias a la vez (un divorcio con hijos suele sumar pensión, tenencia y visitas). Temas de familia sin subcategoría propia (adopción, filiación y partidas, identidad de género, capacidad y curatela) no llevan subcategoría: registrá los hechos igual en el brief. Subcategorías habilitadas:
${subcats}
</subcategorias>`;
}
