import "server-only";

import type { CasoGestion } from "@prisma/client";
import { z } from "zod";

import { casosReales } from "@/lib/board/scope";
import { prisma } from "@/lib/prisma";

export interface CambioGestion {
  id: string;
  /** Estado previo; null cuando el evento no lo registró. */
  de: string | null;
  a: string;
  nota: string | null;
  por: string;
  createdAt: string;
}

export interface GestionCaso {
  estado: CasoGestion;
  nota: string | null;
  por: string | null;
  en: string | null;
  /** Cambios del más reciente al más viejo. */
  historial: CambioGestion[];
}

/**
 * El payload de un `CasoEvento` es Json sin tipar. Se parsea con un schema
 * laxo en vez de confiar en la forma: un evento escrito por una versión vieja
 * del código no puede tumbar la ficha entera. Los campos que faltan caen a un
 * valor neutro y la fila se muestra igual.
 */
const payloadSchema = z
  .object({
    de: z.string().nullish(),
    a: z.string().nullish(),
    nota: z.string().nullish(),
    por: z.string().nullish(),
  })
  .catch({});

function aCambio(evento: { id: string; payload: unknown; createdAt: Date }): CambioGestion {
  const payload = payloadSchema.parse(evento.payload);
  return {
    id: evento.id,
    de: payload.de ?? null,
    a: payload.a ?? "",
    nota: payload.nota ?? null,
    por: payload.por ?? "",
    createdAt: evento.createdAt.toISOString(),
  };
}

async function armarGestion(casoId: string): Promise<GestionCaso | null> {
  const [caso, eventos] = await Promise.all([
    prisma.caso.findFirst({
      where: { id: casoId, ...casosReales(null) },
      select: { gestion: true, gestionNota: true, gestionPor: true, gestionEn: true },
    }),
    prisma.casoEvento.findMany({
      where: { casoId, tipo: "GESTION" },
      orderBy: { createdAt: "desc" },
      select: { id: true, payload: true, createdAt: true },
    }),
  ]);
  if (!caso) return null;

  return {
    estado: caso.gestion,
    nota: caso.gestionNota,
    por: caso.gestionPor,
    en: caso.gestionEn?.toISOString() ?? null,
    historial: eventos.map(aCambio),
  };
}

/** La gestión vigente de un caso. `null` si no existe o es de una sesión de revisión. */
export async function leerGestion(casoId: string): Promise<GestionCaso | null> {
  return armarGestion(casoId);
}

/**
 * Cambia el estado de gestión y deja el rastro en `CasoEvento`.
 *
 * `previo` + `updateMany` + `create` van en una única `$transaction`: si el
 * `create` del evento falla después de que el `updateMany` ya commiteó, la
 * columna queda en un estado que ningún evento del historial explica (y un
 * cambio posterior escribiría un `de` mentiroso). Mismo patrón que
 * `registrarDatosCaso`/`asignarClasificacion` en `clasificacion.ts`. Leer
 * `previo` DENTRO de la transacción también cierra el TOCTOU de dos PATCH
 * concurrentes escribiendo dos eventos con el mismo `de`.
 *
 * El `updateMany` va guardado por `casosReales(null)` —y no un `update` por
 * id— para que el alcance sea parte de la escritura: un caso de sesión de
 * revisión no se gestiona ni conociendo su id. Si afecta 0 filas no se
 * escribe evento: un trail con eventos de casos que nadie tocó es peor que
 * no tenerlo.
 */
export async function actualizarGestion(params: {
  casoId: string;
  gestion: CasoGestion;
  nota?: string;
  por: string;
}): Promise<GestionCaso | null> {
  const nota = params.nota?.trim() ? params.nota.trim() : null;

  const escrito = await prisma.$transaction(async (tx) => {
    const previo = await tx.caso.findFirst({
      where: { id: params.casoId, ...casosReales(null) },
      select: { id: true, gestion: true },
    });
    if (!previo) return false;

    const { count } = await tx.caso.updateMany({
      where: { id: params.casoId, ...casosReales(null) },
      data: {
        gestion: params.gestion,
        gestionNota: nota,
        gestionPor: params.por,
        gestionEn: new Date(),
      },
    });
    if (count === 0) return false;

    await tx.casoEvento.create({
      data: {
        casoId: params.casoId,
        tipo: "GESTION",
        payload: { de: previo.gestion, a: params.gestion, nota, por: params.por },
      },
      select: { id: true, payload: true, createdAt: true },
    });
    return true;
  });
  if (!escrito) return null;

  return armarGestion(params.casoId);
}
