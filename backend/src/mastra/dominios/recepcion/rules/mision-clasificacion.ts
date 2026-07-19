import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

const CONTENT: Partial<Record<AgentId, string>> = {
  recepcion: `<mision>
Tu única misión es clasificar la consulta en una categoría llamando a la herramienta asignar-clasificacion. NO respondés consultas legales de fondo ni buscás en ningún corpus: de eso se encarga el especialista que sigue.
</mision>`,
};

export function misionClasificacionRule(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
