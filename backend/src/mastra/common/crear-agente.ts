import { gateway } from "@ai-sdk/gateway";
import { Agent, type ToolsInput } from "@mastra/core/agent";
import type { RequestContext } from "@mastra/core/request-context";
import type { Memory } from "@mastra/memory";

import type { ReadOnlyState } from "../../models/index.js";

import { getReadOnlyFromContext } from "./middleware/index.js";

export interface CrearAgenteParams {
  id: string;
  name: string;
  description: string;
  buildInstructions: (readOnly: ReadOnlyState | null) => string;
  buildTools: (readOnly: ReadOnlyState | null) => Record<string, unknown>;
  memory?: Memory;
  model?: string;
  maxSteps?: number;
  maxRetries?: number;
}

/**
 * Wraps `buildInstructions` with the asymmetric null-guard (guia-codificacion-
 * backend §3): during Mastra startup/listing there is no request context —
 * swallow a throw and return empty instructions. With a real request
 * (`readOnly` resolved), a broken prompt build must never run the agent
 * silently — rethrow.
 *
 * Exported as a pure function — rather than only inline inside `crearAgente`
 * — so the null-guard is testable directly: the installed `@mastra/core`'s
 * public `Agent.getInstructions()` wraps the dynamic-instructions function
 * with its own validation and throws `MastraError` whenever the resolved
 * value is falsy, so it can never observe an empty-string result to assert
 * against (see crear-agente.test.ts for the contingency this triggers).
 */
export function buildDynamicInstructions(buildInstructions: (readOnly: ReadOnlyState | null) => string) {
  return function dynamicInstructions({ requestContext }: { requestContext?: RequestContext }): string {
    const readOnly = getReadOnlyFromContext(requestContext);
    try {
      return buildInstructions(readOnly);
    } catch (error) {
      if (readOnly === null) return "";
      throw error;
    }
  };
}

/**
 * Agent factory that bakes the Mastra v1 production gotchas exactly once
 * (guia-codificacion-backend §3): maxSteps must live in defaultOptions,
 * temperature must be explicit with gateway+Gemini, provider order pinned for
 * implicit caching, and dynamic instructions get the asymmetric null-guard
 * (startup/listing has no request context — swallow; a real request must
 * never run the agent with a silently broken prompt).
 */
export function crearAgente(params: CrearAgenteParams): Agent {
  const {
    id,
    name,
    description,
    buildInstructions,
    buildTools,
    memory,
    model = "google/gemini-3-flash",
    maxSteps = 10,
    maxRetries = 3,
  } = params;

  const dynamicInstructions = buildDynamicInstructions(buildInstructions);

  function dynamicTools({ requestContext }: { requestContext?: RequestContext }): ToolsInput {
    // The public contract widens tool sets to `Record<string, unknown>` so
    // the factory stays decoupled from per-agent tool types; callers hand in
    // actual Mastra tools, so the cast to Mastra's own `ToolsInput` at this
    // boundary is safe.
    return buildTools(getReadOnlyFromContext(requestContext)) as ToolsInput;
  }

  function dynamicOptions() {
    return {
      maxSteps,
      modelSettings: { temperature: 1 },
      providerOptions: { gateway: { order: ["google", "vertex"] } },
    };
  }

  return new Agent({
    id,
    name,
    description,
    instructions: dynamicInstructions,
    tools: dynamicTools,
    ...(memory ? { memory } : {}),
    model: gateway(model),
    maxRetries,
    defaultOptions: dynamicOptions,
  });
}
