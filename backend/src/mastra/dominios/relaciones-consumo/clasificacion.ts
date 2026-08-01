/**
 * Classification data for the relaciones-consumo domain, consumed by the
 * registry. Taxonomy source of truth: docs/dominio-consultas.md. Habilitada
 * el 2026-07-31 con el material del equipo legal (Ley 17.250, Decreto
 * 244/000, Ley 18.507 y el trámite ante el MEF; ver
 * docs/plans/2026-07-31-procesamiento-relaciones-consumo.md).
 */
export const relacionesConsumoClasificacion = {
  id: "relaciones-consumo" as const,
  nombre: "Relaciones de consumo",
  descripcion:
    "Derechos del consumidor frente a comercios y empresas: productos fallados, garantías, cambios y devoluciones, compras por internet, cobros y cláusulas abusivas, publicidad engañosa, y cómo reclamar ante Defensa del Consumidor (MEF) o la justicia.",
  seniales: [
    "Menciona una compra o un servicio contratado que salió mal: producto fallado, servicio incumplido, entrega que no llegó",
    "Habla de garantía, cambio, devolución del dinero o arrepentimiento de una compra (en el local o por internet)",
    "Relata problemas con una empresa: cobros indebidos, renovación automática, letra chica del contrato, publicidad que no se cumplió",
    "Quiere reclamar o denunciar a un comercio ante Defensa del Consumidor o pregunta cómo hacerlo",
  ],
  habilitada: true,
  subcategorias: [
    {
      id: "derechos-del-consumidor",
      nombre: "Derechos del consumidor",
      descripcion:
        "Garantías, cambios y devoluciones, productos defectuosos, incumplimiento del proveedor, compras a distancia y derecho de retracto, prácticas y cláusulas abusivas, publicidad engañosa, presupuestos de servicios.",
      habilitada: true,
    },
    {
      id: "procedimiento-mef-judicial",
      nombre: "Procedimiento ante MEF y poder judicial",
      descripcion:
        "Cómo reclamar: consulta, reclamo o denuncia ante el Área Defensa del Consumidor (MEF), la audiencia administrativa de conciliación, y el proceso judicial de pequeñas causas de consumo.",
      habilitada: true,
    },
  ],
};
