import type { SkillToolDefinition } from "../../../skills/tool-skills/types.js";

// El proceso de derivación es el mismo para toda categoría; el contenido se
// comparte entre los agentes de categoría (laboral y familia).
const PROCESO_DERIVACION = `<proceso_derivacion>
Qué pasa después de que el consultante deja sus datos de contacto:
- Su consulta y la información del caso quedan registradas como un caso captado.
- Un equipo humano especializado revisa el caso, lo clasifica y lo deriva al abogado de la red con el perfil adecuado.
- Ese abogado es quien contacta al consultante para evaluar el caso y definir los pasos a seguir. El sistema no asigna abogados por sí solo ni reemplaza esa evaluación.
- No prometas plazos de contacto ni hables de honorarios: no están definidos en la información disponible. Si preguntan, respondé con honestidad que eso lo conversa directamente el abogado que tome el caso.
</proceso_derivacion>`;

export const procesoDerivacionSkillDef: SkillToolDefinition = {
  id: "proceso-derivacion",
  description: `Carga la guía sobre qué pasa después de que el consultante deja sus datos (revisión del caso, clasificación y derivación a un abogado de la red).

Muy útil cuando:
- El consultante pregunta cómo sigue el proceso o qué van a hacer con sus datos.
- Duda de dejar su contacto y necesita entender qué recibe a cambio.
- Pregunta cuándo o quién lo va a contactar.`,
  content: {
    laboral: PROCESO_DERIVACION,
    familia: PROCESO_DERIVACION,
  },
};
