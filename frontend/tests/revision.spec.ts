import { expect, test } from "@playwright/test";

import { iniciarSesionBoard } from "./helpers/sesion-board";

const CLAVE = process.env.REVISION_CLAVE ?? "";
const SECRETO = process.env.AUTH_SECRET ?? "";

test.skip(!CLAVE || !SECRETO, "Faltan REVISION_CLAVE o AUTH_SECRET — E2E de revisión deshabilitado");

test("ciclo de revisión: sesión → chat → nota inline → responder → resolver", async ({ page }) => {
  // 240s: el turno real de agente solo (sin board-auth.spec.ts compitiendo por
  // el mismo backend, ver commit b6cf691) ronda 108s — 120s dejaba un margen
  // demasiado fino y fallaba en el primer intento, pasando recién en el retry.
  test.setTimeout(240_000);

  await iniciarSesionBoard(page);
  await page.goto("/board/revision");

  await expect(page.getByRole("heading", { name: "Sesiones de revisión" })).toBeVisible();
  await page.getByLabel("Título de la nueva sesión").fill("E2E despido");
  await page.getByRole("button", { name: "Nueva sesión de revisión" }).click();

  await page.getByLabel("Mensaje de prueba").fill("Hola, me despidieron sin causa después de 6 años");
  await page.getByLabel("Enviar la consulta").click();

  // Tras el turno, el transcript persistido se recarga con messageId reales.
  const respuesta = page.getByLabel("Respuesta del asistente").last();
  await expect(respuesta).toBeVisible({ timeout: 90_000 });

  // Nota inline por mensaje: el "+" del gutter aparece al hover (GitHub-style).
  await respuesta.hover();
  await page.getByLabel("Dejar nota en este mensaje").last().click();
  await page.getByLabel("Texto de la nota").fill("Nota E2E: revisar esta respuesta");
  await page.getByRole("button", { name: "Guardar nota" }).click();

  await expect(page.getByText("Nota E2E: revisar esta respuesta")).toBeVisible();
  await expect(page.getByText("Abierta", { exact: true })).toBeVisible();

  // Responder el hilo y resolverlo — resuelto colapsa a una línea.
  await page.getByRole("button", { name: "Responder…" }).click();
  await page.getByLabel("Responder la nota").fill("Anotado, lo revisamos");
  await page.getByRole("button", { name: "Responder", exact: true }).click();
  await expect(page.getByText("Anotado, lo revisamos")).toBeVisible();
  await page.getByRole("button", { name: "Resolver" }).click();
  await expect(page.getByText(/Resuelta · 1 respuesta/)).toBeVisible();
});
