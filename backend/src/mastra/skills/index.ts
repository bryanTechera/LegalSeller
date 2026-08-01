import { ActivationRegistry, type RegistryItem } from "../common/activation-registry.js";
import { dimensionarArrendamientoSkill } from "../dominios/arrendamiento-desalojo/static-skills/dimensionar-arrendamiento.js";
import { subcategoriasArrendamientoSkill } from "../dominios/arrendamiento-desalojo/static-skills/subcategorias-arrendamiento.js";
import { dimensionarFamiliaSkill } from "../dominios/familia/static-skills/dimensionar-familia.js";
import { subcategoriasFamiliaSkill } from "../dominios/familia/static-skills/subcategorias-familia.js";
import { dimensionarDespidoSkill } from "../dominios/laboral/static-skills/dimensionar-despido.js";
import { dimensionarRubrosSkill } from "../dominios/laboral/static-skills/dimensionar-rubros.js";
import { regimenesEspecialesSkill } from "../dominios/laboral/static-skills/regimenes-especiales.js";
import { subcategoriasLaboralSkill } from "../dominios/laboral/static-skills/subcategorias-laboral.js";
import { universoCategoriasSkill } from "../dominios/recepcion/static-skills/universo-categorias.js";

const STATIC_SKILLS: readonly RegistryItem[] = [
  { id: "universo-categorias", fn: universoCategoriasSkill },
  { id: "subcategorias-laboral", fn: subcategoriasLaboralSkill },
  { id: "dimensionar-despido", fn: dimensionarDespidoSkill },
  { id: "dimensionar-rubros", fn: dimensionarRubrosSkill },
  { id: "regimenes-especiales", fn: regimenesEspecialesSkill },
  { id: "subcategorias-familia", fn: subcategoriasFamiliaSkill },
  { id: "dimensionar-familia", fn: dimensionarFamiliaSkill },
  { id: "subcategorias-arrendamiento", fn: subcategoriasArrendamientoSkill },
  { id: "dimensionar-arrendamiento", fn: dimensionarArrendamientoSkill },
];

export const staticSkillsRegistry = new ActivationRegistry("static-skills", STATIC_SKILLS);
