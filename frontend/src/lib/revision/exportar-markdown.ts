import type { NotaConRespuestas } from "./notas";
import type { ItemTimeline } from "./timeline";

const MAX_PAYLOAD_CHARS = 4000;

function json(valor: unknown): string {
  const texto = JSON.stringify(valor, null, 1) ?? "null";
  if (texto.length <= MAX_PAYLOAD_CHARS) return texto;
  return `${texto.slice(0, MAX_PAYLOAD_CHARS)}\n[truncado: ${String(texto.length - MAX_PAYLOAD_CHARS)} chars omitidos]`;
}

function formatearNota(nota: NotaConRespuestas): string {
  const lineas = [
    `> **NOTA ${nota.id} (${nota.estado})** — ${nota.autor} — ${nota.createdAt}`,
    ...(nota.citaTexto ? [`> Cita: "${nota.citaTexto}"`] : []),
    `> ${nota.texto}`,
    ...nota.respuestas.map((r) => `> - [${r.origen}] ${r.autor} (${r.createdAt}): ${r.texto}`),
  ];
  return lineas.join("\n");
}

/**
 * Markdown de una sesión para el review con Claude Code: timeline completa
 * (mensajes, agente por turno, tool calls con input/output, tokens) con las
 * notas del experto insertadas junto al mensaje exacto que anotan (spec §7).
 */
export function formatearSesionMarkdown(params: {
  sesion: { id: string; titulo: string | null; creadaPor: string | null };
  timeline: ItemTimeline[];
  notas: NotaConRespuestas[];
}): string {
  const { sesion, timeline, notas } = params;
  const notasPorMensaje = new Map<string, NotaConRespuestas[]>();
  for (const nota of notas) {
    if (!nota.messageId) continue;
    const lista = notasPorMensaje.get(nota.messageId) ?? [];
    lista.push(nota);
    notasPorMensaje.set(nota.messageId, lista);
  }

  const secciones: string[] = [
    `# Sesión de revisión: ${sesion.titulo ?? "(sin título)"}`,
    `- conversationId: ${sesion.id}`,
    `- Creada por: ${sesion.creadaPor ?? "—"}`,
    `- Notas: ${String(notas.length)} (${String(notas.filter((n) => n.estado === "ABIERTA").length)} abiertas)`,
    "",
    "## Timeline",
  ];

  for (const item of timeline) {
    if (item.tipo === "mensaje") {
      const rol = item.rol === "user" ? "CONSULTANTE (experto probando)" : "ASISTENTE";
      secciones.push(`### [${rol}] ${item.fecha} — messageId: ${item.id}`, "", item.texto, "");
      for (const nota of notasPorMensaje.get(item.id) ?? []) {
        secciones.push(formatearNota(nota), "");
      }
    } else if (item.tipo === "turno-agente") {
      secciones.push(`_agente en turno: ${item.agente}_`, "");
    } else if (item.tipo === "tool-call") {
      secciones.push(
        `#### tool-call: ${item.tool}${item.agente ? ` (agente: ${item.agente})` : ""} — ${item.fecha}`,
        "```json",
        `// input\n${json(item.input)}`,
        `// output\n${json(item.output)}`,
        ...(item.error ? [`// error\n${json(item.error)}`] : []),
        "```",
        "",
      );
    } else {
      secciones.push(`_generación: ${item.modelo ?? "?"} · ${String(item.tokensEntrada)} in / ${String(item.tokensSalida)} out_`, "");
    }
  }

  secciones.push("## Notas generales");
  const generales = notas.filter((nota) => !nota.messageId);
  if (generales.length === 0) secciones.push("(ninguna)");
  for (const nota of generales) secciones.push(formatearNota(nota), "");

  return secciones.join("\n");
}
