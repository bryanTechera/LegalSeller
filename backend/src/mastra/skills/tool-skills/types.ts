import type { AgentId, ReadOnlyState } from "../../../models/index.js";

export interface SkillToolDefinition {
  /** kebab-case español; la tool Mastra se publica como `guia-<id>`. */
  id: string;
  /** Triggers de invocación ("Muy útil cuando..."). String único o por agente. */
  description: string | Partial<Record<AgentId, string>>;
  /** Conocimiento por agente. Sin key para un agente = la tool no existe para él. */
  content: Partial<Record<AgentId, string>>;
  /** Activación condicional sobre el estado; ausente = siempre disponible. */
  shouldActivate?: (readOnly: ReadOnlyState | null) => boolean;
}
