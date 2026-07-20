import { ActivationRegistry, type RegistryItem } from "../common/activation-registry.js";
import { subcategoriasLaboralSkill } from "../dominios/laboral/static-skills/subcategorias-laboral.js";
import { universoCategoriasSkill } from "../dominios/recepcion/static-skills/universo-categorias.js";

const STATIC_SKILLS: readonly RegistryItem[] = [
  { id: "universo-categorias", fn: universoCategoriasSkill },
  { id: "subcategorias-laboral", fn: subcategoriasLaboralSkill },
];

export const staticSkillsRegistry = new ActivationRegistry("static-skills", STATIC_SKILLS);
