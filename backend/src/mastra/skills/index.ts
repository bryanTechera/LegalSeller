import { ActivationRegistry, type RegistryItem } from "../common/activation-registry.js";
import { dimensionarFamiliaSkill } from "../dominios/familia/static-skills/dimensionar-familia.js";
import { subcategoriasFamiliaSkill } from "../dominios/familia/static-skills/subcategorias-familia.js";
import { dimensionarDespidoSkill } from "../dominios/laboral/static-skills/dimensionar-despido.js";
import { dimensionarRubrosSkill } from "../dominios/laboral/static-skills/dimensionar-rubros.js";
import { regimenesEspecialesSkill } from "../dominios/laboral/static-skills/regimenes-especiales.js";
import { subcategoriasLaboralSkill } from "../dominios/laboral/static-skills/subcategorias-laboral.js";
import { universoCategoriasSkill } from "../dominios/recepcion/static-skills/universo-categorias.js";
import { dimensionarConsumoSkill } from "../dominios/relaciones-consumo/static-skills/dimensionar-consumo.js";
import { subcategoriasConsumoSkill } from "../dominios/relaciones-consumo/static-skills/subcategorias-consumo.js";

const STATIC_SKILLS: readonly RegistryItem[] = [
  { id: "universo-categorias", fn: universoCategoriasSkill },
  { id: "subcategorias-laboral", fn: subcategoriasLaboralSkill },
  { id: "dimensionar-despido", fn: dimensionarDespidoSkill },
  { id: "dimensionar-rubros", fn: dimensionarRubrosSkill },
  { id: "regimenes-especiales", fn: regimenesEspecialesSkill },
  { id: "subcategorias-familia", fn: subcategoriasFamiliaSkill },
  { id: "dimensionar-familia", fn: dimensionarFamiliaSkill },
  { id: "subcategorias-consumo", fn: subcategoriasConsumoSkill },
  { id: "dimensionar-consumo", fn: dimensionarConsumoSkill },
];

export const staticSkillsRegistry = new ActivationRegistry("static-skills", STATIC_SKILLS);
