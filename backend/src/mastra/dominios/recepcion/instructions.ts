import type { ReadOnlyState } from "../../../models/index.js";
import { rulesRegistry } from "../../rules/index.js";
import { staticSkillsRegistry } from "../../skills/index.js";

/**
 * Global receptor: single conversational classifier (spec §3). Thin composer
 * over the registries (spec 2026-07-19-sistema-skills-rules §4.4): rules
 * inicio → static skills inicio → static skills final → rules final →
 * volatile blocks. Knowledge-final precedes rules-final so behavioral
 * directives keep recency. Content changes are gated by `pnpm evals` (the
 * byte-identity migration gate was removed with the first deliberate content
 * change, per its documented lifecycle).
 */
export function buildRecepcionInstructions(readOnly: ReadOnlyState | null): string {
  const rules = rulesRegistry.execute(readOnly, "recepcion");
  const skills = staticSkillsRegistry.execute(readOnly, "recepcion");

  const userBlock = readOnly?.userName
    ? `\n\n<contexto_usuario>\nEl usuario se llama ${readOnly.userName}. Tratalo de vos.\n</contexto_usuario>`
    : "";

  const bloques = [rules.inicio, skills.inicio, skills.final, rules.final].filter((b) => b !== "");
  return `${bloques.join("\n\n")}${userBlock}`;
}
