import type { AgentId, ReadOnlyState } from "../../../../models/index.js";

/**
 * SKILL: Dimensionar un caso de consumo.
 * Heurísticas de práctica derivadas del material del equipo legal (Ley
 * 17.250, Decreto 244/000, Ley 18.507 y el trámite ante el MEF, 2026-07-31).
 * Los datos normativos (plazos, montos, requisitos, vías) viven en el corpus
 * RAG — la skill solo refiere conceptos y manda a buscar-documentos.
 */
const CONTENT: Partial<Record<AgentId, string>> = {
  "relaciones-consumo": `<dimensionar_consumo>
Criterios de práctica para dimensionar un caso de consumo. Los datos normativos exactos (plazos, montos, requisitos de cada vía) viven en el material de respaldo: traelos con buscar-documentos y usalos como base de tu explicación.

Antes de calcular consecuencias, situá el caso: qué compró o contrató, cuándo (fecha de compra y de entrega — los plazos de esta materia son cortos y corren desde ahí), a quién (un comercio o empresa identificable; una venta entre particulares no es relación de consumo y cambia todo el encuadre), qué salió mal, y qué busca el consultante — el cambio, la devolución del dinero, la reparación o el resarcimiento de un daño. La elección entre esas salidas es del consumidor, no del proveedor: si el comercio le impone un vale de compra o "solo cambio, no devolución", ese es justamente un punto a trabajar.

Datos que un abogado necesita — relevalos a medida que la conversación los toque, sin interrogar:
- La prueba de la compra: factura, ticket, recibo, comprobante de pago electrónico, capturas de la publicación o del chat con el vendedor. Sin prueba de la relación de consumo el reclamo se debilita; recomendá conservarla siempre.
- Si ya reclamó ante el proveedor, cuándo, por qué medio y qué le respondieron. El reclamo documentado ante el proveedor incide en el cómputo de los plazos — el detalle está en el material de respaldo — y su respuesta (o el silencio) define el paso siguiente.
- El monto en juego: orienta la vía de reclamo (las vías judiciales de consumo distinguen por monto) y cuánto amerita escalar el caso.
- En compras a distancia (internet, teléfono, redes): la fecha de entrega y si el producto está sin uso — el derecho a arrepentirse tiene ventana corta, condiciones y excepciones que hay que verificar en el material antes de afirmarlo.
- En renovaciones automáticas (gimnasios, emergencias médicas, suscripciones): la fecha en que se produjo la renovación — la ventana para pedir la baja corre desde ahí.

Señales de urgencia — si aparecen, priorizá que el consultante actúe a tiempo: una compra reciente con defecto (el plazo por vicio aparente es breve y corre desde la entrega), una renovación automática recién producida, una audiencia o citación ya fijada, o un producto que presenta un riesgo para la salud o seguridad.

La escalera habitual de reclamo va del reclamo documentado ante el proveedor a la conciliación administrativa ante Defensa del Consumidor, y de ahí a la vía judicial; cada peldaño tiene sus requisitos y tiempos en el material de respaldo. Errores comunes del consultante que conviene corregir con tacto: no guardar la factura, dejar pasar los plazos esperando la buena voluntad del comercio, aceptar la primera salida que el proveedor impone, y creer que un producto usado, en oferta o comprado por internet queda fuera de la protección.
</dimensionar_consumo>`,
};

export function dimensionarConsumoSkill(_readOnly: ReadOnlyState | null, agentId: AgentId): string | null {
  return CONTENT[agentId] ?? null;
}
