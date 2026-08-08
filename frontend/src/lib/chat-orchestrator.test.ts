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
const { clasificacion, dominios, agentService, casosSintesis } = vi.hoisted(() => ({
  clasificacion: {
    getOrCreateConversation: vi.fn(),
    asignarClasificacion: vi.fn(),
    registrarDatosCaso: vi.fn(),
    corregirClasificacion: vi.fn(),
    registrarIntentoExtraccion: vi.fn(),
    resolverCasoActivo: vi.fn(),
    abrirOReactivarCaso: vi.fn(),
    abrirCasoFueraDeCobertura: vi.fn(),
  },
  dominios: { subcategoriaUnica: vi.fn(), esCategoriaHabilitada: vi.fn() },
  agentService: { streamAgentMessage: vi.fn(), appendThreadMessages: vi.fn(), fetchAssistantTexts: vi.fn() },
  casosSintesis: { asegurarSintesis: vi.fn() },
}));

vi.mock("./clasificacion", () => clasificacion);
vi.mock("./dominios", () => dominios);
vi.mock("./agent-service", () => agentService);
vi.mock("./casos/sintesis", () => casosSintesis);

import { logger } from "@/utils/logger";

import { asegurarSintesis } from "./casos/sintesis";
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
    vi.resetAllMocks();
    clasificacion.asignarClasificacion.mockResolvedValue({ categoria: "laboral", aplicada: true });
    clasificacion.registrarDatosCaso.mockResolvedValue(undefined);
    clasificacion.registrarIntentoExtraccion.mockResolvedValue(undefined);
    clasificacion.resolverCasoActivo.mockResolvedValue(null);
    agentService.appendThreadMessages.mockResolvedValue(undefined);
    agentService.fetchAssistantTexts.mockResolvedValue([]);
    dominios.subcategoriaUnica.mockResolvedValue("despido");
    dominios.esCategoriaHabilitada.mockResolvedValue(true);
    casosSintesis.asegurarSintesis.mockResolvedValue({ estado: "ok" });
  });

  it("con categoría asignada rutea directo al agente de categoría", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    agentService.streamAgentMessage.mockResolvedValue(sseResponse([{ type: "text-delta", payload: { text: "hola" } }]));
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "y el aguinaldo?" });
    expect(agentService.streamAgentMessage).toHaveBeenCalledTimes(1);
    expect(agentService.streamAgentMessage.mock.calls[0][0]).toMatchObject({
      agentId: "laboral",
      pedidoContactoHecho: false,
    });
    expect(await drain(response)).toContain("hola");
  });

  it("rutea por el caso activo, no por Conversation.categoria", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "familia",
      estado: "CAPTADO",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    dominios.esCategoriaHabilitada.mockResolvedValue(true);
    agentService.streamAgentMessage.mockResolvedValue(sseResponse([{ type: "text-delta", payload: { text: "hola" } }]));

    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "consulta" }));

    expect(agentService.streamAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "familia", contactoRegistrado: true }),
    );
  });

  it("con el contacto ya registrado no escanea el historial: el dato manda sobre el pedido", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "familia", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "familia",
      estado: "CAPTADO",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    agentService.streamAgentMessage.mockResolvedValue(sseResponse([{ type: "text-delta", payload: { text: "hola" } }]));

    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "consulta" }));

    expect(agentService.fetchAssistantTexts).not.toHaveBeenCalled();
    expect(agentService.streamAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ contactoRegistrado: true, pedidoContactoHecho: false }),
    );
  });

  it("el pedido ignorado sale del historial, no del estado del caso (hallazgo del review final)", async () => {
    // Sin contacto el Caso queda EN_CONVERSACION, así que derivar la señal de
    // `estado === "CAPTADO"` la apagaba justo en el escenario para el que fue
    // escrita: el usuario ignoró el pedido y siguió preguntando.
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    agentService.fetchAssistantTexts.mockResolvedValue([
      "Te explico lo de la indemnización. ¿Me dejás tu teléfono así te contactan?",
    ]);
    agentService.streamAgentMessage.mockResolvedValue(sseResponse([{ type: "text-delta", payload: { text: "hola" } }]));

    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "y los días de licencia?" }));

    expect(agentService.streamAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ pedidoContactoHecho: true, contactoRegistrado: false }),
    );
  });

  it("si la lectura del historial falla, el turno sigue asumiendo que no se pidió", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    agentService.fetchAssistantTexts.mockRejectedValue(new Error("mastra caído"));
    agentService.streamAgentMessage.mockResolvedValue(sseResponse([{ type: "text-delta", payload: { text: "hola" } }]));

    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "consulta" }));

    expect(agentService.streamAgentMessage).toHaveBeenCalledWith(
      expect.objectContaining({ pedidoContactoHecho: false }),
    );
  });

  it("observa derivar-tema y corre el receptor sobre el mismo mensaje", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    dominios.esCategoriaHabilitada.mockResolvedValue(true);
    dominios.subcategoriaUnica.mockResolvedValue(null);
    agentService.streamAgentMessage
      .mockResolvedValueOnce(
        sseResponse([
          { type: "tool-call", payload: { toolName: "derivar-tema", args: { tema: "me chocaron el auto" } } },
          { type: "text-delta", payload: { text: "puente" } },
        ]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          {
            type: "tool-call",
            payload: { toolName: "asignar-clasificacion", args: { categoria: "transito", brief: "choque" } },
          },
        ]),
      );

    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "también me chocaron" }));

    expect(agentService.streamAgentMessage).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ agentId: "recepcion", message: "también me chocaron", memoryReadOnly: true }),
    );
    expect(clasificacion.abrirOReactivarCaso).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "s1", categoria: "transito" }),
    );
  });

  it("falso positivo del agente: el receptor clasifica igual y no se abre caso", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    dominios.esCategoriaHabilitada.mockResolvedValue(true);
    agentService.streamAgentMessage
      .mockResolvedValueOnce(
        sseResponse([{ type: "tool-call", payload: { toolName: "derivar-tema", args: { tema: "licencias" } } }]),
      )
      .mockResolvedValueOnce(
        sseResponse([
          { type: "tool-call", payload: { toolName: "asignar-clasificacion", args: { categoria: "laboral" } } },
        ]),
      );

    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "y las licencias?" }));

    expect(clasificacion.abrirOReactivarCaso).not.toHaveBeenCalled();
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

  // Mismo blindaje que registrar-caso, por prevención: hoy el receptor corre
  // Gemini y omite los opcionales, así que esta ruta nunca falló en
  // producción. Queda a un cambio de modelo de repetir el bug — y acá el
  // descarte es peor todavía, porque sin clasificación el turno no encadena al
  // agente de categoría y la conversación entera se queda sin caso.
  it("la clasificación con opcionales en null se persiste igual", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: null });
    agentService.streamAgentMessage
      .mockResolvedValueOnce(
        sseResponse([
          {
            type: "tool-call",
            payload: {
              toolName: "asignar-clasificacion",
              args: {
                brief: "Despido en período de prueba.",
                categoria: "laboral",
                confianza: "alta",
                casoSensible: false,
                subcategoria: "despido",
                temaDetectado: null,
              },
            },
          },
        ]),
      )
      .mockResolvedValueOnce(sseResponse([{ type: "text-delta", payload: { text: "Sobre tu despido..." } }]));

    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "me despidieron a prueba" }));

    expect(clasificacion.asignarClasificacion).toHaveBeenCalledWith(
      expect.objectContaining({ categoria: "laboral", subcategoria: "despido" }),
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
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    dominios.esCategoriaHabilitada.mockResolvedValueOnce(false);
    const response = await orchestrateChatTurn({ sessionId: "s1", message: "y ahora qué hago?" });
    const text = await drain(response);
    expect(agentService.streamAgentMessage).not.toHaveBeenCalled();
    expect(clasificacion.asignarClasificacion).not.toHaveBeenCalled();
    expect(text).toContain("Estamos actualizando la cobertura de ese tema");
  });

  it("observa registrar-caso en régimen y persiste los datos", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
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

  // Regresión (conversación real cmshuemeu0001sb02s3pjd6kh, 2026-08-06): los
  // agentes de categoría corren GPT-5.6 desde el 2026-08-02 y mandan los
  // opcionales que no tienen como `null` explícito, no omitidos. Con
  // `.optional()` puro, un solo `contactoEmail: null` invalidaba el objeto
  // entero y el observador descartaba la llamada COMPLETA — se perdían el
  // nombre y el teléfono que venían al lado, con la tool devolviendo `ok`.
  it("los opcionales en null no descartan el contacto que viene al lado", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    agentService.streamAgentMessage.mockResolvedValue(
      sseResponse([
        {
          type: "tool-call",
          payload: {
            toolName: "registrar-caso",
            args: {
              hechos: "Dejó datos para derivación.",
              contactoEmail: null,
              subcategorias: ["despido", "rubros-laborales"],
              contactoNombre: "Michael Pintos",
              contactoTelefono: "098 652 262",
            },
          },
        },
        { type: "text-delta", payload: { text: "Gracias, Michael." } },
      ]),
    );

    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "Michael Pintos\n098 652 262" }));

    expect(clasificacion.registrarDatosCaso).toHaveBeenCalledWith(
      expect.objectContaining({
        contactoNombre: "Michael Pintos",
        contactoTelefono: "098 652 262",
        subcategorias: ["despido", "rubros-laborales"],
      }),
    );
  });

  it("args de tool-call con forma inválida se descartan sin persistir ni romper el stream", async () => {
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
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

  // El descarte es silencioso por diseño (nunca romper el stream del usuario),
  // así que el log es la ÚNICA señal de que un turno perdió datos. Sin el campo
  // que falló, el warn no distingue "el modelo cambió de shape" de "payload
  // adversarial" — fue lo que dejó correr 4 días el bug de los null. Van las
  // rutas y los códigos de Zod, nunca los valores: son PII del consultante.
  it("el descarte por forma inválida reporta qué campo falló", async () => {
    const warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
    clasificacion.resolverCasoActivo.mockResolvedValue({
      id: "k1",
      categoria: "laboral",
      estado: "EN_CONVERSACION",
      origen: "DOMINIO",
      correccionAplicada: false,
    });
    agentService.streamAgentMessage.mockResolvedValue(
      sseResponse([
        {
          type: "tool-call",
          payload: {
            toolName: "registrar-caso",
            args: { subcategorias: "despido", contactoNombre: "Michael Pintos" },
          },
        },
      ]),
    );

    await drain(await orchestrateChatTurn({ sessionId: "s1", message: "..." }));

    expect(warn).toHaveBeenCalledWith(
      "tool-call args failed validation",
      expect.objectContaining({ toolName: "registrar-caso", campos: ["subcategorias"] }),
    );
    // El valor descartado es PII: se reporta la ruta, nunca el contenido.
    expect(JSON.stringify(warn.mock.calls)).not.toContain("Michael Pintos");
    warn.mockRestore();
  });

  describe("bifurcación del transporte", () => {
    // El ruteo va por el Caso activo, no por Conversation.categoria: sin este
    // mock el turno cae al receptor y nunca llega a pipeCategoryTurn.
    function casoActivoLaboral(): void {
      clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
      clasificacion.resolverCasoActivo.mockResolvedValue({
        id: "k1",
        categoria: "laboral",
        estado: "EN_CONVERSACION",
        origen: "DOMINIO",
        correccionAplicada: false,
      });
    }

    function turnoDeCategoria(): void {
      casoActivoLaboral();
      agentService.streamAgentMessage.mockResolvedValue(
        sseResponse([
          { type: "tool-call", payload: { toolName: "buscar-documentos", args: { categoria: "laboral" } } },
          { type: "text-delta", payload: { text: "hola" } },
        ]),
      );
    }

    it("el chat público no reenvía los tool-call al browser", async () => {
      turnoDeCategoria();
      const emitido = await drain(await orchestrateChatTurn({ sessionId: "s1", message: "hola" }));
      expect(emitido).not.toContain("tool-call");
      expect(emitido).not.toContain("buscar-documentos");
    });

    it("el chat público sí reenvía el texto", async () => {
      turnoDeCategoria();
      const emitido = await drain(await orchestrateChatTurn({ sessionId: "s1", message: "hola" }));
      expect(emitido).toContain("text-delta");
      expect(emitido).toContain("hola");
    });

    it("el chat público reenvía un error genérico: sin él la burbuja queda vacía y sin retry", async () => {
      casoActivoLaboral();
      agentService.streamAgentMessage.mockResolvedValue(
        sseResponse([{ type: "error", payload: { error: "detalle interno del backend" } }]),
      );
      const emitido = await drain(await orchestrateChatTurn({ sessionId: "s1", message: "hola" }));
      expect(emitido).toContain("error");
      expect(emitido).not.toContain("detalle interno del backend");
    });

    it("revisión conserva los eventos completos: el runner de escenarios los necesita", async () => {
      turnoDeCategoria();
      const emitido = await drain(
        await orchestrateChatTurn({ sessionId: "s1", message: "hola", eventosCompletos: true }),
      );
      expect(emitido).toContain("tool-call");
      expect(emitido).toContain("buscar-documentos");
    });

    it("con eventosCompletos el texto no se duplica: ya viaja dentro del raw", async () => {
      turnoDeCategoria();
      const emitido = await drain(
        await orchestrateChatTurn({ sessionId: "s1", message: "hola", eventosCompletos: true }),
      );
      expect(emitido.match(/"text":"hola"/g) ?? []).toHaveLength(1);
    });

    it("persiste el intento de extracción y no reenvía la señal al browser", async () => {
      clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
      agentService.streamAgentMessage.mockResolvedValue(
        sseResponse([
          { type: "data-confidencialidad", data: { reglas: ["proveedor"] } },
          { type: "text-delta", payload: { text: "listo" } },
        ]),
      );
      const emitido = await drain(await orchestrateChatTurn({ sessionId: "s1", message: "hola" }));
      // Decirle al atacante qué regla saltó es confirmarle qué preguntó bien.
      expect(emitido).not.toContain("data-confidencialidad");
      expect(emitido).not.toContain("proveedor");
      expect(clasificacion.registrarIntentoExtraccion).toHaveBeenCalledWith({
        sessionId: "s1",
        reglas: ["proveedor"],
      });
    });

    it("una señal sin reglas no escribe nada", async () => {
      clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
      agentService.streamAgentMessage.mockResolvedValue(
        sseResponse([{ type: "data-confidencialidad", data: {} }]),
      );
      await drain(await orchestrateChatTurn({ sessionId: "s1", message: "hola" }));
      expect(clasificacion.registrarIntentoExtraccion).not.toHaveBeenCalled();
    });

    it("los tool-call se siguen observando aunque no se reenvíen", async () => {
      clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral" });
      agentService.streamAgentMessage.mockResolvedValue(
        sseResponse([
          { type: "tool-call", payload: { toolName: "registrar-caso", args: { contactoNombre: "Ana" } } },
          { type: "text-delta", payload: { text: "listo" } },
        ]),
      );
      const emitido = await drain(await orchestrateChatTurn({ sessionId: "s1", message: "hola" }));
      expect(emitido).not.toContain("registrar-caso");
      expect(clasificacion.registrarDatosCaso).toHaveBeenCalled();
    });
  });

  describe("síntesis del caso al captar", () => {
    it("genera la síntesis del caso cuando el turno dejó el contacto", async () => {
      clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
      clasificacion.resolverCasoActivo.mockResolvedValue({
        id: "k1",
        categoria: "laboral",
        estado: "EN_CONVERSACION",
        origen: "DOMINIO",
        correccionAplicada: false,
      });
      clasificacion.registrarDatosCaso.mockResolvedValue({ casoId: "caso-1", captado: true });
      agentService.streamAgentMessage.mockResolvedValue(
        sseResponse([
          { type: "tool-call", payload: { toolName: "registrar-caso", args: { contactoTelefono: "099111222" } } },
          { type: "text-delta", payload: { text: "listo" } },
        ]),
      );

      const respuesta = await orchestrateChatTurn({ sessionId: "s1", message: "mi tel es 099111222" });
      await new Response(respuesta.body).text(); // drena el stream

      expect(asegurarSintesis).toHaveBeenCalledWith("caso-1");
    });

    // El disparo es "al captar", una sola vez: si corriera en cada turno con caso,
    // sería una llamada de modelo por turno — lo que el spec descartó por costo.
    it("no genera la síntesis en un turno que no captó contacto", async () => {
      clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
      clasificacion.resolverCasoActivo.mockResolvedValue({
        id: "k1",
        categoria: "laboral",
        estado: "EN_CONVERSACION",
        origen: "DOMINIO",
        correccionAplicada: false,
      });
      clasificacion.registrarDatosCaso.mockResolvedValue({ casoId: "caso-1", captado: false });
      agentService.streamAgentMessage.mockResolvedValue(
        sseResponse([
          { type: "tool-call", payload: { toolName: "registrar-caso", args: { hechos: "Trabajó 6 años" } } },
          { type: "text-delta", payload: { text: "listo" } },
        ]),
      );

      const respuesta = await orchestrateChatTurn({ sessionId: "s1", message: "trabajé 6 años ahí" });
      await new Response(respuesta.body).text();

      expect(asegurarSintesis).not.toHaveBeenCalled();
    });

    // La síntesis es una comodidad: su falla no puede romper el turno del chat.
    it("un fallo de la síntesis no rompe el stream", async () => {
      clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: "laboral", casoActivoId: "k1" });
      clasificacion.resolverCasoActivo.mockResolvedValue({
        id: "k1",
        categoria: "laboral",
        estado: "EN_CONVERSACION",
        origen: "DOMINIO",
        correccionAplicada: false,
      });
      clasificacion.registrarDatosCaso.mockResolvedValue({ casoId: "caso-1", captado: true });
      vi.mocked(asegurarSintesis).mockRejectedValue(new Error("backend caído"));
      agentService.streamAgentMessage.mockResolvedValue(
        sseResponse([
          { type: "tool-call", payload: { toolName: "registrar-caso", args: { contactoTelefono: "099111222" } } },
          { type: "text-delta", payload: { text: "listo" } },
        ]),
      );

      const respuesta = await orchestrateChatTurn({ sessionId: "s1", message: "mi tel es 099111222" });
      const texto = await new Response(respuesta.body).text();

      expect(texto).toContain("data:");
    });

    // registrar-caso también corre desde el turno del receptor (captación
    // fuera de cobertura antes de que exista clasificación) — ese camino
    // dispara la síntesis igual que el del agente de categoría.
    it("dispara la síntesis cuando el receptor mismo captó el contacto", async () => {
      clasificacion.getOrCreateConversation.mockResolvedValue({ id: "c1", categoria: null });
      clasificacion.asignarClasificacion.mockResolvedValue({ categoria: null, aplicada: false });
      clasificacion.registrarDatosCaso.mockResolvedValue({ casoId: "caso-9", captado: true });
      agentService.streamAgentMessage.mockResolvedValueOnce(
        sseResponse([
          { type: "text-delta", payload: { text: "No atendemos ese tema, pero puedo derivarte." } },
          {
            type: "tool-call",
            payload: { toolName: "registrar-caso", args: { contactoNombre: "Bea", contactoTelefono: "098" } },
          },
          {
            type: "tool-call",
            payload: {
              toolName: "asignar-clasificacion",
              args: {
                categoria: "fuera-de-universo",
                temaDetectado: "impositivo",
                confianza: "alta",
                casoSensible: false,
                brief: "b",
              },
            },
          },
        ]),
      );

      await drain(await orchestrateChatTurn({ sessionId: "s1", message: "tengo un tema impositivo" }));

      expect(asegurarSintesis).toHaveBeenCalledWith("caso-9");
    });
  });
});
