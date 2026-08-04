import type { ItemTimeline } from "@/lib/revision/timeline";

import { estimarCostoUsd } from "./costos";

/** Tools que no van al resumen: la del corpus tiene su propia solapa; la otra es ruido interno de Mastra. */
const TOOLS_OCULTAS = new Set(["buscar-documentos", "updateWorkingMemory"]);

export interface ToolResumida {
  tool: string;
  agente: string | null;
  conError: boolean;
}

export interface ResumenTecnico {
  agentes: string[];
  modelos: string[];
  tokensEntrada: number;
  tokensSalida: number;
  /** null cuando algún modelo no tiene precio en la tabla: reportar 0 escondería el caso. */
  costoUsd: number | null;
  tools: ToolResumida[];
}

export function resumirTecnico(timeline: ItemTimeline[]): ResumenTecnico {
  const agentes: string[] = [];
  const modelos: string[] = [];
  const tools: ToolResumida[] = [];
  let tokensEntrada = 0;
  let tokensSalida = 0;
  let costoUsd: number | null = 0;

  for (const item of timeline) {
    if (item.tipo === "turno-agente") {
      if (!agentes.includes(item.agente)) agentes.push(item.agente);
    } else if (item.tipo === "tool-call") {
      if (TOOLS_OCULTAS.has(item.tool)) continue;
      tools.push({ tool: item.tool, agente: item.agente, conError: item.error !== null && item.error !== undefined });
    } else if (item.tipo === "generacion") {
      tokensEntrada += item.tokensEntrada;
      tokensSalida += item.tokensSalida;
      if (item.modelo !== null && !modelos.includes(item.modelo)) modelos.push(item.modelo);
      const parcial = item.modelo === null ? null : estimarCostoUsd(item.modelo, item.tokensEntrada, item.tokensSalida);
      costoUsd = costoUsd === null || parcial === null ? null : costoUsd + parcial;
    }
  }

  return { agentes, modelos, tokensEntrada, tokensSalida, costoUsd, tools };
}
