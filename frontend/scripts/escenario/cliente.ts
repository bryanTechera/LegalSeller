/**
 * Cliente HTTP del runner contra los endpoints de /revision. HTTP puro:
 * funciona contra cualquier entorno con la clave correcta, sin DATABASE_URL
 * ni server local. Sin imports server-only.
 */
import type { CasoCorrida, ToolCallCorrida } from "../../src/lib/escenarios/schema";
import { createSseLineSplitter, parseSseData } from "../../src/utils/sse";

export interface RespuestaTurno {
  respuesta: string;
  toolCalls: ToolCallCorrida[];
  latenciaPrimerByteMs: number;
  latenciaTotalMs: number;
  error?: string;
}

export interface SesionListado {
  id: string;
  titulo: string | null;
  creadaPor: string | null;
  origenRevision: "EXPERTO" | "AUTONOMA" | null;
  borrador: boolean;
  actualizadaEn: string;
}

export class ClienteRevision {
  private cookie = "";

  constructor(
    private readonly baseUrl: string,
    private readonly clave: string,
  ) {}

  async autenticar(nombre: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/revision/acceso`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: this.clave, nombre }),
    });
    if (!response.ok) {
      throw new Error(`Acceso a revisión falló (${String(response.status)}): ¿clave correcta para ${this.baseUrl}?`);
    }
    const setCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith("ls_experto="));
    if (!setCookie) throw new Error("El acceso no devolvió la cookie de experto");
    this.cookie = setCookie.split(";")[0] ?? "";
  }

  async crearSesion(titulo: string): Promise<{ id: string }> {
    const payload = await this.json("POST", "/api/revision/sesiones", { titulo, origen: "autonoma" });
    return (payload as { sesion: { id: string } }).sesion;
  }

  async publicar(sesionId: string): Promise<void> {
    await this.json("PATCH", `/api/revision/sesiones/${sesionId}`, { borrador: false });
  }

  async listarSesiones(incluirBorradores: boolean): Promise<SesionListado[]> {
    const query = incluirBorradores ? "?borradores=1" : "";
    const payload = await this.json("GET", `/api/revision/sesiones${query}`);
    return (payload as { sesiones: SesionListado[] }).sesiones;
  }

  async getCaso(sesionId: string): Promise<CasoCorrida | null> {
    const payload = await this.json("GET", `/api/revision/sesiones/${sesionId}`);
    return (payload as { caso: CasoCorrida | null }).caso;
  }

  /** Turno de chat: SSE con texto, tool-calls y latencias. 429 → espera y reintenta una vez. */
  async mandarMensaje(sesionId: string, message: string): Promise<RespuestaTurno> {
    const inicio = Date.now();
    let response = await this.fetchMensaje(sesionId, message);
    if (response.status === 429) {
      const espera = Number(response.headers.get("retry-after") ?? "60");
      process.stdout.write(`Rate limit del entorno: esperando ${String(espera)}s antes de reintentar…\n`);
      await new Promise((resolve) => setTimeout(resolve, espera * 1000));
      response = await this.fetchMensaje(sesionId, message);
    }
    if (!response.ok || !response.body) {
      return {
        respuesta: "",
        toolCalls: [],
        latenciaPrimerByteMs: 0,
        latenciaTotalMs: Date.now() - inicio,
        error: `HTTP ${String(response.status)}`,
      };
    }

    const splitter = createSseLineSplitter();
    const decoder = new TextDecoder();
    const toolCalls: ToolCallCorrida[] = [];
    let primerByteMs = 0;
    let texto = "";
    let error: string | undefined;
    for await (const chunk of response.body) {
      if (primerByteMs === 0) primerByteMs = Date.now() - inicio;
      for (const data of splitter(decoder.decode(chunk, { stream: true }))) {
        const event = parseSseData(data);
        if (!event) continue;
        if (event.kind === "text") texto += event.text;
        else if (event.kind === "tool-call") toolCalls.push({ toolName: event.toolName, args: event.args });
        else error = event.message;
      }
    }
    return {
      respuesta: texto,
      toolCalls,
      latenciaPrimerByteMs: primerByteMs,
      latenciaTotalMs: Date.now() - inicio,
      ...(error === undefined ? {} : { error }),
    };
  }

  private fetchMensaje(sesionId: string, message: string): Promise<Response> {
    return fetch(`${this.baseUrl}/api/revision/sesiones/${sesionId}/mensajes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: this.cookie },
      body: JSON.stringify({ message }),
    });
  }

  private async json(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: { "Content-Type": "application/json", Cookie: this.cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`${method} ${path} → HTTP ${String(response.status)}`);
    return response.json();
  }
}
