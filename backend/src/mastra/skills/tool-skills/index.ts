import { createTool } from "@mastra/core/tools";
import { z } from "zod";

import type { AgentId, ReadOnlyState } from "../../../models/index.js";
import { procesoDerivacionSkillDef } from "../../dominios/laboral/tool-skills/proceso-derivacion.js";

import type { SkillToolDefinition } from "./types.js";

const TOOL_SKILLS: readonly SkillToolDefinition[] = [procesoDerivacionSkillDef];

/**
 * Contract per spec §4.6 / repo rule: a tool never throws in execute — it
 * degrades to { status: "error", mensaje }. With the current seeds the error
 * branch is unreachable by construction (content is a pre-resolved constant),
 * but the schema keeps the contract explicit for the first tool skill that
 * resolves dynamic content.
 */
const outputSchema = z.union([
  z.object({ status: z.literal("ok"), contenido: z.string() }),
  z.object({ status: z.literal("error"), mensaje: z.string() }),
]);

/**
 * Materializes the active tool-skill definitions for an agent as Mastra tools
 * named `guia-<id>` (spec §4.6). The execute closure returns pre-resolved
 * static content, so nothing can throw at call time (repo rule: tools never
 * throw in execute — here satisfied by construction).
 */
export function crearSkillTools(agentId: AgentId, readOnly: ReadOnlyState | null): Record<string, unknown> {
  const tools: Record<string, unknown> = {};
  for (const def of TOOL_SKILLS) {
    const contenido = def.content[agentId];
    if (contenido === undefined) continue;
    if (def.shouldActivate !== undefined && !def.shouldActivate(readOnly)) continue;
    const description = typeof def.description === "string" ? def.description : def.description[agentId];
    if (description === undefined) continue;
    const toolId = `guia-${def.id}`;
    tools[toolId] = createTool({
      id: toolId,
      description,
      outputSchema,
      // eslint-disable-next-line @typescript-eslint/require-await
      execute: async () => ({ status: "ok" as const, contenido }),
    });
  }
  return tools;
}
