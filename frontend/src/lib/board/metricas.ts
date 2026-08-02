import "server-only";

import { listarCaptados, type CasoCaptado } from "./captados";
import { calcularAgente, calcularVolumen, type Latencia, type UsoModelo, type UsoTool, type Volumen } from "./metricas-agente";
import { calcularDemanda, calcularFunnel, type Demanda, type Funnel } from "./metricas-funnel";
import { fechaDesde, type Rango } from "./rango";

export interface Metricas {
  rango: Rango;
  funnel: Funnel;
  demanda: Demanda;
  agente: { modelos: UsoModelo[]; tools: UsoTool[]; latencia: Latencia };
  volumen: Volumen;
  captados: CasoCaptado[];
}

/**
 * Todo corre en paralelo: la latencia del endpoint es la de la query más
 * lenta, no la suma de todas.
 */
export async function calcularMetricas(rango: Rango): Promise<Metricas> {
  const desde = fechaDesde(rango);
  const [funnel, demanda, agente, volumen, captados] = await Promise.all([
    calcularFunnel(desde),
    calcularDemanda(desde),
    calcularAgente(desde),
    calcularVolumen(desde),
    listarCaptados(desde),
  ]);
  return { rango, funnel, demanda, agente, volumen, captados };
}
