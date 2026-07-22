import { z } from "zod";

/**
 * Contrato de un escenario reproducible (frontend/escenarios/<slug>.json).
 * La persona es la base para improvisar turnos en personaje; los turnos son
 * el guion base reproducible (spec 2026-07-22-sistema-escenarios-reproducibles §2).
 */
export const expectativasSchema = z.object({
  clasificacion: z
    .object({ categoria: z.string().min(1), subcategoria: z.string().min(1).optional() })
    .optional(),
  llamoBuscarDocumentos: z.boolean().optional(),
  casoCaptado: z.boolean().optional(),
  contactoRegistrado: z.boolean().optional(),
});
export type Expectativas = z.infer<typeof expectativasSchema>;

export const escenarioSchema = z.object({
  titulo: z.string().min(1),
  descripcion: z.string().optional(),
  persona: z.string().min(1),
  turnos: z.array(z.string().min(1)).min(1),
  expectativas: expectativasSchema.optional(),
});
export type Escenario = z.infer<typeof escenarioSchema>;

export interface ToolCallCorrida {
  toolName: string;
  args: Record<string, unknown>;
}

export interface TurnoCorrida {
  n: number;
  origen: "guion" | "improvisado";
  usuario: string;
  respuesta: string;
  toolCalls: ToolCallCorrida[];
  latenciaPrimerByteMs: number;
  latenciaTotalMs: number;
  error?: string;
}

/** Snapshot del Caso que devuelve GET /api/revision/sesiones/:id. */
export interface CasoCorrida {
  estado: string;
  categoria: string | null;
  subcategorias: string[];
  resumen: unknown;
  contactoNombre: string | null;
  contactoTelefono: string | null;
  contactoEmail: string | null;
  eventos: { tipo: string; payload: unknown; createdAt: string }[];
}

export interface ExpectativaResultado {
  clave: string;
  esperado: unknown;
  obtenido: unknown;
  cumplida: boolean;
}

/** El sesionId ES el Conversation.id (misma fila). */
export interface Corrida {
  escenario: string;
  titulo: string;
  url: string;
  sesionId: string;
  inicio: string;
  turnos: TurnoCorrida[];
  expectativas: ExpectativaResultado[];
  caso: CasoCorrida | null;
}
