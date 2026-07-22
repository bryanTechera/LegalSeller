import { ActivationRegistry, type RegistryItem } from "../common/activation-registry.js";
import { dimensionarFamiliaSkill } from "../dominios/familia/static-skills/dimensionar-familia.js";
import { subcategoriasFamiliaSkill } from "../dominios/familia/static-skills/subcategorias-familia.js";
import { dimensionarDespidoSkill } from "../dominios/laboral/static-skills/dimensionar-despido.js";
import { dimensionarRubrosSkill } from "../dominios/laboral/static-skills/dimensionar-rubros.js";
import { subcategoriasLaboralSkill } from "../dominios/laboral/static-skills/subcategorias-laboral.js";
import { universoCategoriasSkill } from "../dominios/recepcion/static-skills/universo-categorias.js";

const STATIC_SKILLS: readonly RegistryItem[] = [
  { id: "universo-categorias", fn: universoCategoriasSkill },
  { id: "subcategorias-laboral", fn: subcategoriasLaboralSkill },
  { id: "dimensionar-despido", fn: dimensionarDespidoSkill },
  { id: "dimensionar-rubros", fn: dimensionarRubrosSkill },
  { id: "subcategorias-familia", fn: subcategoriasFamiliaSkill },
  { id: "dimensionar-familia", fn: dimensionarFamiliaSkill },
];

export const staticSkillsRegistry = new ActivationRegistry("static-skills", STATIC_SKILLS);
