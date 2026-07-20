import { expect, test } from "@playwright/test";

const CLAVE = process.env.REVISION_CLAVE ?? "";

test.skip(!CLAVE, "REVISION_CLAVE no seteada — E2E de revisión deshabilitado");

test("ciclo de revisión: acceso → sesión nueva → chat → nota anclada", async ({ page }) => {
  await page.goto("/revision");

  await page.getByLabel("Tu nombre").fill("Dra. E2E");
  await page.getByLabel("Clave de acceso").fill(CLAVE);
  await page.getByRole("button", { name: "Entrar" }).click();

  await expect(page.getByRole("heading", { name: "Sesiones de revisión" })).toBeVisible();
  await page.getByLabel("Título de la nueva sesión").fill("E2E despido");
  await page.getByRole("button", { name: "Nueva sesión de revisión" }).click();

  await page.getByLabel("Mensaje de prueba").fill("Hola, me despidieron sin causa después de 6 años");
  await page.getByRole("button", { name: "Enviar" }).click();

  // Tras el turno, el transcript persistido se recarga con messageId reales.
  await expect(page.getByRole("button", { name: "Dejar nota" }).first()).toBeVisible({ timeout: 90_000 });

  await page.getByRole("button", { name: "Dejar nota" }).last().click();
  await page.getByLabel("Texto de la nota").fill("Nota E2E: revisar esta respuesta");
  await page.getByRole("button", { name: "Guardar nota" }).click();

  await expect(page.getByText("Nota E2E: revisar esta respuesta")).toBeVisible();
  await expect(page.getByText("Abierta — esperando al equipo")).toBeVisible();
});
