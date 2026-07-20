import type { ReadOnlyState } from "../../../models/index.js";
import { bloqueContextoTemporal } from "../../common/contexto-temporal.js";
import { rulesRegistry } from "../../rules/index.js";
import { staticSkillsRegistry } from "../../skills/index.js";

/**
 * Category agent for Laboral (spec §4). Thin composer over the registries
 * (spec 2026-07-19-sistema-skills-rules §4.4): rules inicio → static skills
 * inicio → static skills final → rules final (captación con recencia) →
 * volatile blocks. Knowledge-final precedes rules-final so behavioral
 * directives keep recency. Content changes are gated by `pnpm evals` (the
 * byte-identity migration gate was removed with the first deliberate content
 * change, per its documented lifecycle).
 */
export function buildLaboralInstructions(readOnly: ReadOnlyState | null): string {
  const rules = rulesRegistry.execute(readOnly, "laboral");
  const skills = staticSkillsRegistry.execute(readOnly, "laboral");

  const briefBlock = readOnly?.casoBrief
    ? `\n\n<caso_recabado>\nLo que el usuario ya contó (NO re-preguntar nada de esto):\n${readOnly.casoBrief}\n</caso_recabado>`
    : "";
  const userBlock = readOnly?.userName
    ? `\n\n<contexto_usuario>\nEl usuario se llama ${readOnly.userName}. Tratalo de vos.\n</contexto_usuario>`
    : "";

  const bloques = [rules.inicio, skills.inicio, skills.final, rules.final].filter((b) => b !== "");
  return `${bloques.join("\n\n")}${briefBlock}${userBlock}${bloqueContextoTemporal()}`;
}
