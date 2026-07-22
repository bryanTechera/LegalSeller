/**
 * Runner de escenarios reproducibles (spec docs/plans/2026-07-22-sistema-
 * escenarios-reproducibles.md). Corre conversaciones guionadas contra los
 * endpoints de /revision del entorno objetivo (default: prod) y deja el
 * reporte en escenarios/corridas/. Proceso de uso: skill reproducir-escenario.
 */
import "dotenv/config";

import { parseArgs } from "node:util";

import { evaluarExpectativas } from "../src/lib/escenarios/expectativas";
import type { Corrida } from "../src/lib/escenarios/schema";
import { ClienteRevision } from "./escenario/cliente";
import { guardarCorrida, leerEscenario, localizarCorrida } from "./escenario/corridas";

const URL_DEFAULT = "https://frontend-production-1293.up.railway.app";
const NOMBRE_RUNNER = "Asistente técnico";
const USO = `Uso:
  pnpm escenario correr <slug> [--url <base>] [--clave <clave>] [--publicar]
  pnpm escenario continuar <sesionId> --mensaje "..." [--url] [--clave]
  pnpm escenario publicar <sesionId> [--url] [--clave]
  pnpm escenario listar [--borradores] [--url] [--clave]
`;

async function correr(cliente: ClienteRevision, url: string, slug: string, publicarAlFinal: boolean): Promise<void> {
  const escenario = leerEscenario(slug);
  await cliente.autenticar(NOMBRE_RUNNER);
  const inicio = new Date().toISOString();
  const sesion = await cliente.crearSesion(`[escenario] ${slug} — ${inicio}`);
  process.stdout.write(`Sesión ${sesion.id} creada (borrador) en ${url}\n`);
  const corrida: Corrida = {
    escenario: slug,
    titulo: escenario.titulo,
    url,
    sesionId: sesion.id,
    inicio,
    turnos: [],
    expectativas: [],
    caso: null,
  };
  try {
    for (const [indice, mensaje] of escenario.turnos.entries()) {
      process.stdout.write(`Turno ${String(indice + 1)}/${String(escenario.turnos.length)}…\n`);
      const resultado = await cliente.mandarMensaje(sesion.id, mensaje);
      corrida.turnos.push({ n: indice + 1, origen: "guion", usuario: mensaje, ...resultado });
      if (resultado.error !== undefined) {
        process.stderr.write(`Turno con error (${resultado.error}) — corto la corrida.\n`);
        break;
      }
    }
  } finally {
    corrida.caso = await cliente.getCaso(sesion.id).catch(() => null);
    corrida.expectativas = evaluarExpectativas(escenario.expectativas, corrida.turnos, corrida.caso);
    const base = guardarCorrida(corrida);
    const incumplidas = corrida.expectativas.filter((expectativa) => !expectativa.cumplida);
    process.stdout.write(`Reporte: ${base}.md\n`);
    if (incumplidas.length > 0) {
      process.stdout.write(
        `Expectativas incumplidas: ${incumplidas.map((expectativa) => expectativa.clave).join(", ")}\n`,
      );
    }
  }
  if (publicarAlFinal) {
    await cliente.publicar(sesion.id);
    process.stdout.write("Corrida publicada al listado del equipo legal.\n");
  }
}

async function continuar(cliente: ClienteRevision, sesionId: string, mensaje: string): Promise<void> {
  const localizada = localizarCorrida(sesionId);
  if (!localizada) throw new Error(`No hay corrida local para la sesión ${sesionId} en escenarios/corridas/`);
  const { corrida, base } = localizada;
  const escenario = leerEscenario(corrida.escenario);
  await cliente.autenticar(NOMBRE_RUNNER);
  const resultado = await cliente.mandarMensaje(sesionId, mensaje);
  corrida.turnos.push({ n: corrida.turnos.length + 1, origen: "improvisado", usuario: mensaje, ...resultado });
  corrida.caso = await cliente.getCaso(sesionId).catch(() => null);
  corrida.expectativas = evaluarExpectativas(escenario.expectativas, corrida.turnos, corrida.caso);
  guardarCorrida(corrida, base);
  process.stdout.write(`Turno improvisado agregado. Reporte: ${base}.md\n`);
}

async function listar(cliente: ClienteRevision, incluirBorradores: boolean): Promise<void> {
  await cliente.autenticar(NOMBRE_RUNNER);
  const sesiones = (await cliente.listarSesiones(incluirBorradores)).filter(
    (sesion) => sesion.origenRevision === "AUTONOMA",
  );
  if (sesiones.length === 0) {
    process.stdout.write("Sin corridas autónomas en el entorno objetivo.\n");
    return;
  }
  for (const sesion of sesiones) {
    const estado = sesion.borrador ? "[borrador]" : "[publicada]";
    process.stdout.write(`${sesion.id}  ${estado}  ${sesion.titulo ?? "(sin título)"}  ${sesion.actualizadaEn}\n`);
  }
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      url: { type: "string" },
      clave: { type: "string" },
      publicar: { type: "boolean", default: false },
      mensaje: { type: "string" },
      borradores: { type: "boolean", default: false },
    },
  });
  const [comando, argumento] = positionals;
  const url = values.url ?? process.env.ESCENARIO_URL ?? URL_DEFAULT;
  const clave = values.clave ?? process.env.REVISION_CLAVE;
  if (clave === undefined || clave === "") throw new Error(`Falta la clave: --clave o REVISION_CLAVE.\n${USO}`);
  const cliente = new ClienteRevision(url, clave);

  switch (comando) {
    case "correr": {
      if (argumento === undefined) throw new Error(USO);
      await correr(cliente, url, argumento, values.publicar ?? false);
      return;
    }
    case "continuar": {
      if (argumento === undefined || values.mensaje === undefined) throw new Error(USO);
      await continuar(cliente, argumento, values.mensaje);
      return;
    }
    case "publicar": {
      if (argumento === undefined) throw new Error(USO);
      await cliente.autenticar(NOMBRE_RUNNER);
      await cliente.publicar(argumento);
      process.stdout.write("Corrida publicada al listado del equipo legal.\n");
      return;
    }
    case "listar": {
      await listar(cliente, values.borradores ?? false);
      return;
    }
    default:
      throw new Error(USO);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`escenario falló: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
