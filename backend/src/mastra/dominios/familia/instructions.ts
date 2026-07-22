import type { ReadOnlyState } from "../../../models/index.js";
import { bloqueContextoTemporal } from "../../common/contexto-temporal.js";
import { rulesRegistry } from "../../rules/index.js";
import { staticSkillsRegistry } from "../../skills/index.js";

/**
 * Category agent for Familia (spec §4). Thin composer over the registries,
 * same shape as buildLaboralInstructions: rules inicio → static skills →
 * rules final (captación con recencia) → volatile blocks. Content changes
 * are gated by `pnpm evals`.
 */
export function buildFamiliaInstructions(readOnly: ReadOnlyState | null): string {
  const rules = rulesRegistry.execute(readOnly, "familia");
  const skills = staticSkillsRegistry.execute(readOnly, "familia");

  const briefBlock = readOnly?.casoBrief
    ? `\n\n<caso_recabado>\nLo que el usuario ya contó (NO re-preguntar nada de esto):\n${readOnly.casoBrief}\n</caso_recabado>`
    : "";
  const userBlock = readOnly?.userName
    ? `\n\n<contexto_usuario>\nEl usuario se llama ${readOnly.userName}. Tratalo de vos.\n</contexto_usuario>`
    : "";

  const bloques = [rules.inicio, skills.inicio, skills.final, rules.final].filter((b) => b !== "");
  return `${bloques.join("\n\n")}${briefBlock}${userBlock}${bloqueContextoTemporal()}`;
}
