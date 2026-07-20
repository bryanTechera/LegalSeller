import { ActivationRegistry, type RegistryItem } from "../common/activation-registry.js";
import { dimensionarDespidoSkill } from "../dominios/laboral/static-skills/dimensionar-despido.js";
import { subcategoriasLaboralSkill } from "../dominios/laboral/static-skills/subcategorias-laboral.js";
import { universoCategoriasSkill } from "../dominios/recepcion/static-skills/universo-categorias.js";

const STATIC_SKILLS: readonly RegistryItem[] = [
  { id: "universo-categorias", fn: universoCategoriasSkill },
  { id: "subcategorias-laboral", fn: subcategoriasLaboralSkill },
  { id: "dimensionar-despido", fn: dimensionarDespidoSkill },
];

export const staticSkillsRegistry = new ActivationRegistry("static-skills", STATIC_SKILLS);
