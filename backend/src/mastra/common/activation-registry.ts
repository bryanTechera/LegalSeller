import type { AgentId, ReadOnlyState } from "../../models/index.js";

import { fallbackLogger } from "./logger.js";

export interface RegistryItem {
  id: string;
  fn: (readOnly: ReadOnlyState | null, agentId: AgentId) => string | null;
  /** Si fn tira, el prompt NO se construye (el agente no corre con safety rota). */
  critical?: boolean;
  /** "final" = después de las static skills, con recencia (default "inicio"). */
  posicion?: "inicio" | "final";
}

export interface ExecuteResult {
  inicio: string;
  final: string;
  activatedIds: string[];
  failedIds: string[];
}

/**
 * Generic activation registry (spec §4.1, colar's pattern). Concatenates the
 * non-null blocks in registration order with a blank line. Critical failures
 * rethrow (combined with crearAgente's asymmetric null-guard: startup swallows,
 * a real request aborts); non-critical failures are observable in failedIds —
 * never a silent omission.
 */
export class ActivationRegistry {
  constructor(
    private readonly nombre: string,
    private readonly items: readonly RegistryItem[],
  ) {}

  execute(readOnly: ReadOnlyState | null, agentId: AgentId): ExecuteResult {
    const inicio: string[] = [];
    const final: string[] = [];
    const activatedIds: string[] = [];
    const failedIds: string[] = [];

    for (const item of this.items) {
      let content: string | null;
      try {
        content = item.fn(readOnly, agentId);
      } catch (error) {
        if (item.critical === true) {
          const detalle = error instanceof Error ? error.message : String(error);
          throw new Error(`Item crítico "${item.id}" del registry "${this.nombre}" falló al construir el prompt: ${detalle}`);
        }
        failedIds.push(item.id);
        // PinoLogger de @mastra/loggers tipa warn(message, args) — mensaje PRIMERO
        // (a diferencia de pino nativo; ver logger.test.ts:100 para el idioma del repo).
        fallbackLogger.warn("Item de registry falló; se omite del prompt", {
          registry: this.nombre,
          itemId: item.id,
          agentId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (content === null) continue;
      activatedIds.push(item.id);
      (item.posicion === "final" ? final : inicio).push(content);
    }

    return { inicio: inicio.join("\n\n"), final: final.join("\n\n"), activatedIds, failedIds };
  }
}
