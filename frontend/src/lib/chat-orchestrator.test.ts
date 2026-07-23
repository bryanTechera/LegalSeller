// @vitest-environment node
//
// This suite builds SSE fixtures via `new Blob([...]).stream()` — Node's Blob
// has `.stream()`, jsdom's polyfill (the project-wide default environment)
// does not. Nothing here touches the DOM, so pinning to node is safe and
// avoids ReadableStream-from-Blob support gaps in jsdom.
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted above imports (and above plain top-level
// `const`s, which would still be in the TDZ at that point) — vi.hoisted is
// the mechanism vitest provides to make these mock objects available to the
// factories below without hitting a "Cannot access before initialization".
const { clasificacion, dominios, agentService } = vi.hoisted(() => ({
  clasificacion: {
    getOrCreateConversation: vi.fn(),
    asignarClasificacion: vi.fn(),
    registrarDatosCaso: vi.fn(),
    corregirClasificacion: vi.fn(),
  },
  dominios: { subcategoriaUnica: vi.fn(), esCategoriaHabilitada: vi.fn() },
  agentService: { streamAgentMessage: vi.fn(), appendThreadMessages: vi.fn(), fetchAssistantTexts: vi.fn() },
}));

vi.mock("./clasificacion", () => clasificacion);
vi.mock("./dominios", () => dominios);
vi.mock("./agent-service", () => agentService);

import { orchestrateChatTurn } from "./chat-orchestrator";

function sseResponse(events: object[]): Response {
  const body = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
  return new Response(new Blob([body]).stream(), { headers: { "Content-Type": "text/event-stream" } });
}

async function drain(response: Response): Promise<string> {
  return new Response(response.body).text();
}

const asignacionLaboral = {
  type: "tool-call",
  payload: {
    toolName: "asignar-clasificacion",
    args: { categoria: "laboral", subcategoria: "despido", confianza: "alta", casoSensible: false, brief: "b" },
  },
};

describe("orchestrateChatTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clasificacion.asignarClasificacion.mockResolvedValue({ categoria: "laboral", aplicada: true });
    clasificacion.registrarDatosCaso.mockResolvedValue(undefined);
    agentService.appendThreadMessages.mockResolvedValue(undefined);
    agentService.fetchAssistantTexts.mockResolvedValue([]);
    dominios.subcategoriaUnica.mockResolvedValue("despido");
    dominios.esCategoriaHabilitada.mockResolvedValue(true);
  });

  it("con categoría asignada rutea directo al agente de categoría", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
    agentService.streamAgentMessage.mockResolvedValue(sseResponse([{ type: "text-delta", payload: { text: "hola" } }]));
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "y el aguinaldo?" });
    expect(agentService.streamAgentMessage).toHaveBeenCalledTimes(1);
    expect(agentService.streamAgentMessage.mock.calls[0][0]).toMatchObject({
      agentId: "laboral",
      pedidoContactoHecho: false,
    });
    expect(await drain(response)).toContain("hola");
  });

  it("deriva pedidoContactoHecho del historial cuando un mensaje del asistente ya pidió contacto", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
    agentService.fetchAssistantTexts.mockResolvedValue([
      "Tenés 180 días de protección. Si querés, dejame tu nombre y un teléfono así te contactamos.",
    ]);
    agentService.streamAgentMessage.mockResolvedValue(sseResponse([{ type: "text-delta", payload: { text: "ok" } }]));
    await orchestrateChatTurn({ sessionId: "s1", message: "cuanto tiempo tengo para reclamar?" });
    expect(agentService.streamAgentMessage.mock.calls[0][0]).toMatchObject({ pedidoContactoHecho: true });
  });

  it("si la lectura del historial falla asume pedidoContactoHecho false y no rompe el turno", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
    agentService.fetchAssistantTexts.mockRejectedValue(new Error("boom"));
    agentService.streamAgentMessage.mockResolvedValue(sseResponse([{ type: "text-delta", payload: { text: "ok" } }]));
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "hola de nuevo" });
    expect(await drain(response)).toContain("ok");
    expect(agentService.streamAgentMessage.mock.calls[0][0]).toMatchObject({ pedidoContactoHecho: false });
  });

  it("fast-path: clasifica, persiste, encadena al agente de categoría en el mismo turno", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: null });
    agentService.streamAgentMessage
      .mockResolvedValueOnce(sseResponse([asignacionLaboral])) // receptor: tool-call, no text
      .mockResolvedValueOnce(sseResponse([{ type: "text-delta", payload: { text: "Sobre tu despido..." } }]));
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "me despidieron sin pagarme" });
    const text = await drain(response);
    expect(text).toContain("Sobre tu despido...");
    expect(clasificacion.asignarClasificacion).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: "laboral", subcategoria: "despido" }),
    );
    // receptor readOnly + category agent normal:
    expect(agentService.streamAgentMessage.mock.calls[0][0]).toMatchObject({ agentId: "recepcion", memoryReadOnly: true });
    expect(agentService.streamAgentMessage.mock.calls[1][0]).toMatchObject({ agentId: "laboral", casoBrief: "b" });
    // degenerate-level shortcut recorded:
    expect(clasificacion.registrarDatosCaso).toHaveBeenCalledWith(
      expect.objectContaining({ subcategorias: ["despido"] }),
    );
  });

  it("slow-path: sin clasificación emite la pregunta del receptor y la appendea al thread", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: null });
    agentService.streamAgentMessage.mockResolvedValueOnce(
      sseResponse([{ type: "text-delta", payload: { text: "¿Hace cuánto trabajás ahí?" } }]),
    );
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "tengo un problema" });
    expect(await drain(response)).toContain("¿Hace cuánto trabajás ahí?");
    expect(agentService.appendThreadMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "tengo un problema" },
          { role: "assistant", content: "¿Hace cuánto trabajás ahí?" },
        ],
      }),
    );
  });

  it("escape: persiste la señal sin encadenar y appendea la despedida del receptor", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: null });
    clasificacion.asignarClasificacion.mockResolvedValue({ categoria: null, aplicada: false });
    agentService.streamAgentMessage.mockResolvedValueOnce(
      sseResponse([
        { type: "text-delta", payload: { text: "Eso no es algo que podamos ayudarte por acá." } },
        {
          type: "tool-call",
          payload: {
            toolName: "asignar-clasificacion",
            args: { categoria: "categoria-no-habilitada", temaDetectado: "sucesiones", confianza: "alta", casoSensible: false, brief: "b" },
          },
        },
      ]),
    );
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "quiero hacer una sucesión" });
    const text = await drain(response);

    expect(clasificacion.asignarClasificacion).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: "categoria-no-habilitada", temaDetectado: "sucesiones" }),
    );
    // no chaining to a category agent — only the receptor ran:
    expect(agentService.streamAgentMessage).toHaveBeenCalledTimes(1);
    expect(text).toContain("Eso no es algo que podamos ayudarte por acá.");
    expect(agentService.appendThreadMessages).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          { role: "user", content: "quiero hacer una sucesión" },
          { role: "assistant", content: "Eso no es algo que podamos ayudarte por acá." },
        ],
      }),
    );
  });

  it("el receptor observa registrar-caso durante un escape y persiste el contacto", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: null });
    clasificacion.asignarClasificacion.mockResolvedValue({ categoria: null, aplicada: false });
    agentService.streamAgentMessage.mockResolvedValueOnce(
      sseResponse([
        { type: "text-delta", payload: { text: "No atendemos ese tema, pero puedo derivarte." } },
        { type: "tool-call", payload: { toolName: "registrar-caso", args: { contactoNombre: "Bea", contactoTelefono: "098" } } },
        {
          type: "tool-call",
          payload: {
            toolName: "asignar-clasificacion",
            args: { categoria: "fuera-de-universo", temaDetectado: "impositivo", confianza: "alta", casoSensible: false, brief: "b" },
          },
        },
      ]),
    );
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "tengo un tema impositivo" });
    await drain(response);
    expect(clasificacion.registrarDatosCaso).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "s1", contactoNombre: "Bea", contactoTelefono: "098" }),
    );
    // still no chain — only the receptor ran:
    expect(agentService.streamAgentMessage).toHaveBeenCalledTimes(1);
  });

  it("casoSensible: true corta el camino al agente de categoría aunque esté habilitada", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: null });
    clasificacion.asignarClasificacion.mockResolvedValue({ categoria: "laboral", aplicada: true });
    agentService.streamAgentMessage.mockResolvedValueOnce(
      sseResponse([
        { type: "text-delta", payload: { text: "Entiendo la urgencia. Podés llamar a la línea de ayuda ahora mismo." } },
        {
          type: "tool-call",
          payload: {
            toolName: "asignar-clasificacion",
            args: { categoria: "laboral", subcategoria: "despido", confianza: "alta", casoSensible: true, brief: "b" },
          },
        },
      ]),
    );
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "me quiero morir por el despido" });
    const text = await drain(response);
    expect(agentService.streamAgentMessage).toHaveBeenCalledTimes(1);
    expect(text).toContain("Entiendo la urgencia. Podés llamar a la línea de ayuda ahora mismo.");
    expect(clasificacion.asignarClasificacion).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: "laboral", casoSensible: true }),
    );
  });

  it("categoría no habilitada observada se trata como señal, sin encadenar", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: null });
    clasificacion.asignarClasificacion.mockResolvedValue({ categoria: null, aplicada: false });
    dominios.esCategoriaHabilitada.mockResolvedValueOnce(false);
    agentService.streamAgentMessage.mockResolvedValueOnce(
      sseResponse([
        { type: "text-delta", payload: { text: "Todavía no cubrimos ese tema puntual." } },
        {
          type: "tool-call",
          payload: {
            toolName: "asignar-clasificacion",
            args: { categoria: "sucesiones", confianza: "alta", casoSensible: false, brief: "b" },
          },
        },
      ]),
    );
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "quiero hacer una sucesión" });
    const text = await drain(response);
    expect(agentService.streamAgentMessage).toHaveBeenCalledTimes(1);
    expect(text).toContain("Todavía no cubrimos ese tema puntual.");
    expect(clasificacion.asignarClasificacion).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: "categoria-no-habilitada", temaDetectado: "sucesiones" }),
    );
  });

  it("régimen: categoría deshabilitada después de persistida degrada con gracia", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
    dominios.esCategoriaHabilitada.mockResolvedValueOnce(false);
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "y ahora qué hago?" });
    const text = await drain(response);
    expect(agentService.streamAgentMessage).not.toHaveBeenCalled();
    expect(clasificacion.asignarClasificacion).not.toHaveBeenCalled();
    expect(text).toContain("Estamos actualizando la cobertura de ese tema");
  });

  it("observa registrar-caso en régimen y persiste los datos", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
    agentService.streamAgentMessage.mockResolvedValue(
      sseResponse([
        { type: "tool-call", payload: { toolName: "registrar-caso", args: { contactoNombre: "Ana", contactoTelefono: "099" } } },
        { type: "text-delta", payload: { text: "¡Gracias Ana!" } },
      ]),
    );
    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "soy Ana, 099..." }));
    expect(clasificacion.registrarDatosCaso).toHaveBeenCalledWith(
      expect.objectContaining({ contactoNombre: "Ana", contactoTelefono: "099" }),
    );
  });

  it("args de tool-call con forma inválida se descartan sin persistir ni romper el stream", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
    agentService.streamAgentMessage.mockResolvedValue(
      sseResponse([
        // subcategorias debería ser array de strings, no un string suelto:
        { type: "tool-call", payload: { toolName: "registrar-caso", args: { subcategorias: "despido" } } },
        { type: "text-delta", payload: { text: "listo" } },
      ]),
    );
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "..." });
    expect(await drain(response)).toContain("listo");
    expect(clasificacion.registrarDatosCaso).not.toHaveBeenCalled();
  });
});
