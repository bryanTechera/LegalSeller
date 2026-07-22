import { ActivationRegistry, type RegistryItem } from "../common/activation-registry.js";
import { captacionCasoRule } from "../dominios/comunes/rules/captacion-caso.js";
import { identidadJurcoRule } from "../dominios/comunes/rules/identidad-jurco.js";
import { conductaFamiliaRule } from "../dominios/familia/rules/conducta-familia.js";
import { rolEspecialistaFamiliaRule } from "../dominios/familia/rules/rol-especialista-familia.js";
import { conductaLaboralRule } from "../dominios/laboral/rules/conducta-laboral.js";
import { rolEspecialistaLaboralRule } from "../dominios/laboral/rules/rol-especialista-laboral.js";
import { casoSensibleRule } from "../dominios/recepcion/rules/caso-sensible.js";
import { conduccionTriageRule } from "../dominios/recepcion/rules/conduccion-triage.js";
import { misionClasificacionRule } from "../dominios/recepcion/rules/mision-clasificacion.js";

/**
 * Global registration order IS prompt order (spec §4.1); each agent's subset
 * preserves it. captacion-caso goes "final": behavioral goal with recency,
 * after the knowledge blocks (spec §4.4).
 */
const RULES: readonly RegistryItem[] = [
  { id: "identidad-jurco", fn: identidadJurcoRule, critical: true },
  { id: "caso-sensible", fn: casoSensibleRule, critical: true },
  { id: "mision-clasificacion", fn: misionClasificacionRule },
  { id: "conduccion-triage", fn: conduccionTriageRule },
  { id: "rol-especialista-laboral", fn: rolEspecialistaLaboralRule },
  { id: "conducta-laboral", fn: conductaLaboralRule, critical: true },
  { id: "rol-especialista-familia", fn: rolEspecialistaFamiliaRule },
  { id: "conducta-familia", fn: conductaFamiliaRule, critical: true },
  { id: "captacion-caso", fn: captacionCasoRule, posicion: "final" },
];

export const CRITICAL_RULE_IDS = RULES.filter((r) => r.critical === true).map((r) => r.id);

export const rulesRegistry = new ActivationRegistry("rules", RULES);
