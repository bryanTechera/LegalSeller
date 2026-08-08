import { expect, test } from "@playwright/test";

import { iniciarSesionBoard } from "./helpers/sesion-board";

const SECRETO = process.env.AUTH_SECRET ?? "";

test.skip(!SECRETO, "AUTH_SECRET no seteada — E2E de casos deshabilitado");

test("el listado de captados muestra la columna Caso y abre el detalle con el resumen y el contacto", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await iniciarSesionBoard(page);

  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "Casos captados" })).toBeVisible({ timeout: 30_000 });

  const filas = page.locator("table").filter({ hasText: "Contacto" }).locator("tbody tr");
  const vacio = page.getByText("Sin casos captados en este rango.");
  await expect(filas.first().or(vacio)).toBeVisible({ timeout: 30_000 });

  if (await vacio.isVisible()) {
    test.skip(true, "Sin casos captados reales en la base de prueba");
  }

  const primeraFila = filas.first();
  const enlace = primeraFila.getByRole("link", { name: "Ver caso" });
  await expect(enlace).toBeVisible();
  await enlace.click();

  await expect(page).toHaveURL(/\/board\/casos\/.+/);
  await expect(page.getByRole("heading", { name: "Resumen del caso" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Contacto" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ver chat completo" })).toBeVisible();
});

test("se puede agregar una nota al caso y queda con autor y fecha tras recargar", async ({ page }) => {
  test.setTimeout(120_000);
  await iniciarSesionBoard(page);

  await page.goto("/board");
  const filas = page.locator("table").filter({ hasText: "Contacto" }).locator("tbody tr");
  const vacio = page.getByText("Sin casos captados en este rango.");
  await expect(filas.first().or(vacio)).toBeVisible({ timeout: 30_000 });
  if (await vacio.isVisible()) test.skip(true, "Sin casos captados reales en la base de prueba");

  await filas.first().getByRole("link", { name: "Ver caso" }).click();
  await expect(page).toHaveURL(/\/board\/casos\/.+/);
  await expect(page.getByRole("heading", { name: "Notas del equipo legal" })).toBeVisible({ timeout: 15_000 });

  const texto = `Nota de verificación E2E ${Date.now()}`;
  await page.getByLabel("Nueva nota").fill(texto);
  await page.getByRole("button", { name: "Agregar nota" }).click();

  await expect(page.getByText(texto)).toBeVisible({ timeout: 15_000 });

  await page.reload();
  await expect(page.getByText(texto)).toBeVisible({ timeout: 15_000 });
  // La nota persistida trae autor y fecha en la misma línea (formato "autor · fecha").
  const nota = page.locator("li").filter({ hasText: texto });
  await expect(nota.getByText(/·/)).toBeVisible();
});
