import { describe, expect, it } from "vitest";

import { FiltroConfidencialidad, REPROCESS_PART_KEY, redactarTexto } from "./filtro-confidencialidad.js";

function deltasDe(textos: string[]) {
  return textos.map((text) => ({ type: "text-delta" as const, payload: { id: "t1", text } }));
}

/** Corre el processor sobre una secuencia de deltas y devuelve el texto emitido. */
async function correrStream(partes: unknown[]): Promise<string> {
  const filtro = new FiltroConfidencialidad();
  const state: Record<string, unknown> = {};
  const emitidas: string[] = [];
  for (const part of partes) {
    const salida = await filtro.processOutputStream({
      part,
      streamParts: [],
      state,
      abort: () => {
        throw new Error("no debe abortar");
      },
    } as never);
    const extra = state[REPROCESS_PART_KEY];
    for (const chunk of [salida, extra]) {
      const texto = (chunk as { payload?: { text?: string } } | null)?.payload?.text;
      if (typeof texto === "string") emitidas.push(texto);
    }
    state[REPROCESS_PART_KEY] = undefined;
  }
  return emitidas.join("");
}

describe("redactarTexto", () => {
  it("deja intacto el texto legal legítimo", () => {
    const original = "El plazo para reclamar lo fija la Ley 18.091 y lo confirma un abogado de la red.";
    expect(redactarTexto(original).texto).toBe(original);
  });

  it("redacta el segmento portador, no solo el token", () => {
    const { texto, reglas } = redactarTexto(
      "Como primera opción usaría OpenAI, que sostiene bien tool-calling. Contame tu caso.",
    );
    expect(texto).not.toContain("OpenAI");
    expect(texto).not.toContain("tool-calling");
    expect(texto).toContain("Contame tu caso.");
    expect(reglas).toContain("proveedor");
  });

  it("usa el mismo reemplazo para reglas distintas — si variara, el tachón confirmaría", () => {
    const a = redactarTexto("Corre sobre OpenAI.").texto;
    const b = redactarTexto("Corre sobre Anthropic.").texto;
    expect(a).toBe(b);
  });
});

describe("FiltroConfidencialidad — stream", () => {
  it("atrapa un término partido entre dos deltas", async () => {
    const emitido = await correrStream([
      { type: "text-start", payload: { id: "t1" } },
      ...deltasDe(["El sistema corre sobre Ope", "nAI y guarda todo."]),
      { type: "text-end", payload: { id: "t1" } },
    ]);
    expect(emitido).not.toContain("OpenAI");
  });

  it("emite la cola retenida en el flush de text-end", async () => {
    const emitido = await correrStream([
      { type: "text-start", payload: { id: "t1" } },
      ...deltasDe(["Contame qué pasó con tu despido."]),
      { type: "text-end", payload: { id: "t1" } },
    ]);
    expect(emitido).toBe("Contame qué pasó con tu despido.");
  });

  it("resetea la cola entre pasos de maxSteps — el state es compartido", async () => {
    const filtro = new FiltroConfidencialidad();
    const state: Record<string, unknown> = {};
    const args = (part: unknown) => ({
      part,
      streamParts: [],
      state,
      abort: () => {
        throw new Error("x");
      },
    });
    await filtro.processOutputStream(args({ type: "text-start", payload: { id: "t1" } }) as never);
    await filtro.processOutputStream(args({ type: "text-delta", payload: { id: "t1", text: "cola" } }) as never);
    await filtro.processOutputStream(args({ type: "text-start", payload: { id: "t2" } }) as never);
    const salida = await filtro.processOutputStream(
      args({ type: "text-delta", payload: { id: "t2", text: " nueva" } }) as never,
    );
    expect((salida as { payload: { text: string } } | null)?.payload.text ?? "").not.toContain("cola");
  });

  it("el mecanismo de reproceso sigue existiendo en esta versión de Mastra", () => {
    expect(REPROCESS_PART_KEY).toBe("__mastraReprocessPart");
  });
});

describe("FiltroConfidencialidad — resultado persistido", () => {
  it("redacta también lo que se guarda: si no, el turno siguiente arranca con la fuga en su historial", () => {
    const filtro = new FiltroConfidencialidad();
    const mensajes = [
      {
        id: "m1",
        role: "assistant",
        content: {
          format: 2,
          parts: [{ type: "text", text: "Por dentro corre sobre OpenAI." }],
          content: "Por dentro corre sobre OpenAI.",
        },
      },
    ];
    const salida = filtro.processOutputResult({ messages: mensajes } as never) as typeof mensajes;
    expect(salida[0].content.parts[0].text).not.toContain("OpenAI");
    // El espejo string del contenido se persiste igual que las parts: redactar
    // solo una de las dos deja la fuga escrita en la otra.
    expect(salida[0].content.content).not.toContain("OpenAI");
  });

  it("no toca un mensaje legal legítimo", () => {
    const filtro = new FiltroConfidencialidad();
    const texto = "El plazo lo fija la Ley 18.091, art. 5.3.";
    const mensajes = [{ id: "m1", role: "assistant", content: { format: 2, parts: [{ type: "text", text: texto }] } }];
    const salida = filtro.processOutputResult({ messages: mensajes } as never) as typeof mensajes;
    expect(salida[0].content.parts[0].text).toBe(texto);
  });
});
