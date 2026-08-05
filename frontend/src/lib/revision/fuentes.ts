/**
 * Tipos y presentación de las búsquedas al corpus. Módulo PURO y sin
 * `server-only` a propósito: lo importa `PanelFuentes`, que es un client
 * component. La lectura de la base vive en `busquedas.ts`, que sí es
 * server-only.
 */

export interface FragmentoRecuperado {
  documentId: string;
  documentTitle: string;
  section: string | null;
  content: string;
  similarity: number;
}

/** `ilegible` = el span existe pero su shape no matchea lo que sabemos parsear. */
export type EstadoBusqueda = "ok" | "empty" | "error" | "ilegible";

export interface BusquedaCorpus {
  spanId: string;
  /** Respuesta del agente a la que pertenece; null = huérfana (turno sin mensaje). */
  messageId: string | null;
  agente: string | null;
  consulta: string;
  categoria: string | null;
  subcategorias: string[];
  estado: EstadoBusqueda;
  fragmentos: FragmentoRecuperado[];
  fecha: string;
}

export interface ResumenFuentes {
  consultas: number;
  fragmentos: number;
  /** Búsquedas que no volvieron `ok` (vacías, con error o ilegibles). */
  vacias: number;
}

/** Tope de `citaTexto` en `crearNotaSchema`. */
const MAX_CITA = 2000;

function recortar(texto: string, maximo: number): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length > maximo ? `${limpio.slice(0, Math.max(0, maximo - 1))}…` : limpio;
}

export function citaDeBusqueda(busqueda: BusquedaCorpus): string {
  return recortar(`Búsqueda: «${busqueda.consulta}»`, MAX_CITA);
}

export function citaDeFragmento(fragmento: FragmentoRecuperado): string {
  const seccion = fragmento.section ? ` — ${fragmento.section}` : "";
  const encabezado = `${fragmento.documentTitle}${seccion} (${fragmento.similarity.toFixed(2)}): `;
  const cuerpo = recortar(fragmento.content, MAX_CITA - encabezado.length - 2);
  return `${encabezado}«${cuerpo}»`;
}

/**
 * Fragmentos de mayor a menor score. El backend ya los devuelve ordenados,
 * pero el orden es lo que le da sentido a la numeración que ve el revisor:
 * lo garantizamos acá en vez de confiar en el productor.
 */
export function fragmentosPorScore(fragmentos: FragmentoRecuperado[]): FragmentoRecuperado[] {
  return [...fragmentos].sort((a, b) => b.similarity - a.similarity);
}

/** Línea de resumen de una búsqueda colapsada: cuántas fuentes trajo y cuál fue la mejor. */
export function resumenDeBusqueda(busqueda: BusquedaCorpus): string {
  if (busqueda.estado !== "ok" || busqueda.fragmentos.length === 0) return "sin resultados";
  const mejor = Math.max(...busqueda.fragmentos.map((fragmento) => fragmento.similarity));
  return `${plural(busqueda.fragmentos.length, "fragmento", "fragmentos")} · mejor ${mejor.toFixed(2)}`;
}

export function resumirPorRespuesta(busquedas: BusquedaCorpus[]): Map<string, ResumenFuentes> {
  const porMensaje = new Map<string, ResumenFuentes>();
  for (const busqueda of busquedas) {
    if (busqueda.messageId === null) continue;
    const actual = porMensaje.get(busqueda.messageId) ?? { consultas: 0, fragmentos: 0, vacias: 0 };
    porMensaje.set(busqueda.messageId, {
      consultas: actual.consultas + 1,
      fragmentos: actual.fragmentos + busqueda.fragmentos.length,
      vacias: actual.vacias + (busqueda.estado === "ok" ? 0 : 1),
    });
  }
  return porMensaje;
}

function plural(cantidad: number, singular: string, plural: string): string {
  return `${String(cantidad)} ${cantidad === 1 ? singular : plural}`;
}

export function textoDeMarca(resumen: ResumenFuentes): string {
  const consultas = plural(resumen.consultas, "consulta", "consultas");
  if (resumen.vacias === 0) {
    return `${consultas} · ${plural(resumen.fragmentos, "fragmento", "fragmentos")}`;
  }
  if (resumen.vacias === resumen.consultas) return `${consultas} · sin resultados`;
  return `${consultas} · ${String(resumen.vacias)} sin resultados`;
}
