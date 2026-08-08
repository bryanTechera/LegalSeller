import { randomUUID } from "node:crypto";

import { PrismaClient } from "@prisma/client";

/**
 * Caso propio del E2E, creado y borrado por el test.
 *
 * Existe porque el board, por diseño, solo muestra casos de consultantes
 * REALES (`esRevision: false`): tomar "la primera fila" para escribirle una
 * nota significa escribir sobre el legajo de una persona, y `NotaCaso` es
 * append-only y no tiene borrado por UI. Cada corrida dejaba ahí una nota que
 * un abogado iba a leer — y con `DATABASE_URL` apuntando a Railway, en
 * producción.
 *
 * La conversación se crea con `esRevision: false` a propósito: es lo que la
 * hace visible para el board, que es justamente lo que el test ejercita. Lo
 * que la vuelve inocua no es el flag sino el borrado en el `finally`, y que el
 * test nunca toque una fila que no creó él.
 *
 * Sin transcript en `mastra_messages`, la vista resuelve la síntesis como
 * "sin-sintesis" sin llamar al modelo: el test de notas no gasta una
 * generación ni depende del backend de IA.
 */
export interface CasoDePrueba {
  casoId: string;
  conversationId: string;
  contarNotas: () => Promise<number>;
  borrar: () => Promise<void>;
}

export async function crearCasoDePrueba(): Promise<CasoDePrueba> {
  const prisma = new PrismaClient();
  const marca = randomUUID();

  try {
    const conversation = await prisma.conversation.create({
      data: {
        sessionId: `e2e-caso-${marca}`,
        threadId: `e2e-caso-${marca}`,
        categoria: "laboral",
        esRevision: false,
      },
      select: { id: true },
    });

    const caso = await prisma.caso.create({
      data: {
        conversationId: conversation.id,
        categoria: "laboral",
        subcategorias: ["despido"],
        estado: "CAPTADO",
        contactoNombre: "Consultante E2E",
        contactoTelefono: "099000000",
      },
      select: { id: true },
    });

    return {
      casoId: caso.id,
      conversationId: conversation.id,
      // La aserción de persistencia va contra la base y no contra la UI: es lo
      // que el test dice verificar, y no depende de cuándo revalide el cliente.
      contarNotas: () => prisma.notaCaso.count({ where: { casoId: caso.id } }),
      // El borrado va por la conversación: Caso, NotaCaso y SintesisCaso
      // cuelgan de ella en cascada, así que no queda nada suelto.
      borrar: async () => {
        try {
          await prisma.conversation.delete({ where: { id: conversation.id } });
        } finally {
          await prisma.$disconnect();
        }
      },
    };
  } catch (error) {
    await prisma.$disconnect();
    throw error;
  }
}
