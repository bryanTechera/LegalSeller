import { describe, expect, it } from "vitest";

import type { NotaConRespuestas } from "./notas";
import type { ItemTimeline } from "./timeline";

import { formatearSesionMarkdown } from "./exportar-markdown";

const sesion = { id: "c1", titulo: "Despido con certificación", creadaPor: "Dra. García" };
const timeline: ItemTimeline[] = [
  { tipo: "mensaje", id: "m1", rol: "user", texto: "me despidieron estando certificado", fecha: "2026-07-20T10:00:00.000Z" },
  { tipo: "turno-agente", spanId: "s1", agente: "laboral", fecha: "2026-07-20T10:00:05.000Z" },
  { tipo: "tool-call", spanId: "s2", tool: "buscar-documentos", agente: "laboral", input: { query: "despido certificado" }, output: { chunks: ["..."] }, error: null, fecha: "2026-07-20T10:00:10.000Z" },
  { tipo: "generacion", spanId: "s3", modelo: "gemini-3-flash", tokensEntrada: 100, tokensSalida: 50, fecha: "2026-07-20T10:00:15.000Z" },
  { tipo: "mensaje", id: "m2", rol: "assistant", texto: "Te corresponde el despido especial…", fecha: "2026-07-20T10:00:20.000Z" },
];
const notas: NotaConRespuestas[] = [
  {
    id: "n1", messageId: "m2", citaTexto: "despido especial", autor: "Dra. García",
    texto: "Falta citar el artículo", estado: "ABIERTA", createdAt: "2026-07-20T11:00:00.000Z",
    respuestas: [{ id: "r1", origen: "DEV", autor: "equipo-dev", texto: "Lo estamos viendo", createdAt: "2026-07-20T12:00:00.000Z" }],
  },
  { id: "n2", messageId: null, citaTexto: null, autor: "Dra. García", texto: "En general muy robótico", estado: "ABIERTA", createdAt: "2026-07-20T11:05:00.000Z", respuestas: [] },
];

describe("formatearSesionMarkdown", () => {
  const md = formatearSesionMarkdown({ sesion, timeline, notas });

  it("encabeza con la sesión y sus IDs", () => {
    expect(md).toContain("# Sesión de revisión: Despido con certificación");
    expect(md).toContain("c1");
    expect(md).toContain("Dra. García");
  });

  it("la nota anclada aparece INMEDIATAMENTE después de su mensaje, con estado, id y respuestas", () => {
    const posMensaje = md.indexOf("Te corresponde el despido especial");
    const posNota = md.indexOf("Falta citar el artículo");
    const posSiguienteSeccion = md.indexOf("## Notas generales");
    expect(posMensaje).toBeGreaterThan(-1);
    expect(posNota).toBeGreaterThan(posMensaje);
    expect(posNota).toBeLessThan(posSiguienteSeccion);
    expect(md).toContain("n1");
    expect(md).toContain("ABIERTA");
    expect(md).toContain("Lo estamos viendo");
  });

  it("incluye tool calls con input/output y las notas generales al final", () => {
    expect(md).toContain("buscar-documentos");
    expect(md).toContain("despido certificado");
    expect(md).toContain("## Notas generales");
    expect(md).toContain("En general muy robótico");
  });

  it("una nota anclada a un messageId ausente de la timeline no se pierde", () => {
    const huerfana: NotaConRespuestas[] = [
      { id: "n9", messageId: "m-inexistente", citaTexto: null, autor: "Dra. García", texto: "Nota huérfana", estado: "ABIERTA", createdAt: "2026-07-20T11:10:00.000Z", respuestas: [] },
    ];
    const md = formatearSesionMarkdown({ sesion, timeline, notas: huerfana });
    expect(md).toContain("## Notas ancladas a mensajes no reconstruidos");
    expect(md).toContain("Nota huérfana");
  });

  it("trunca payloads de tools gigantes con un marcador explícito", () => {
    const gigante = { chunks: "x".repeat(10_000) };
    const conGigante = formatearSesionMarkdown({
      sesion,
      timeline: [{ tipo: "tool-call", spanId: "s9", tool: "buscar-documentos", agente: "laboral", input: {}, output: gigante, error: null, fecha: "2026-07-20T10:00:10.000Z" }],
      notas: [],
    });
    expect(conGigante).toContain("[truncado:");
    expect(conGigante.length).toBeLessThan(9_000);
  });
});
