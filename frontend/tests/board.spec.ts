import { expect, test } from "@playwright/test";

import { iniciarSesionBoard } from "./helpers/sesion-board";

const SECRETO = process.env.AUTH_SECRET ?? "";

test.skip(!SECRETO, "AUTH_SECRET no seteada — E2E del board deshabilitado");

test("el board lista chats y abre el detalle", async ({ page }) => {
  test.setTimeout(120_000);
  await iniciarSesionBoard(page);

  await page.goto("/board/chats");
  await expect(page.getByRole("heading", { name: "Chats" })).toBeVisible();

  // La tabla la llena SWR después del fetch: contar antes de que resuelva da
  // siempre 0 y hace que el test se saltee solo con un motivo falso.
  const filas = page.locator("tbody tr");
  const vacio = page.getByText("No hay conversaciones en este rango.");
  await expect(filas.first().or(vacio)).toBeVisible({ timeout: 30_000 });

  if (await vacio.isVisible()) {
    test.skip(true, "Sin conversaciones reales en la base de prueba");
  }

  await filas.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/board\/chats\/.+/);
});

test("el detalle del chat muestra las fuentes del corpus", async ({ page }) => {
  test.setTimeout(120_000);
  await iniciarSesionBoard(page);

  await page.goto("/board/chats");
  const filas = page.locator("tbody tr");
  const vacio = page.getByText("No hay conversaciones en este rango.");
  await expect(filas.first().or(vacio)).toBeVisible({ timeout: 30_000 });
  if (await vacio.isVisible()) test.skip(true, "Sin conversaciones reales en la base de prueba");

  await filas.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/board\/chats\/.+/);

  // El caso y las notas de la conversación no viven en una solapa: se ven
  // sin tocar nada, con la solapa Fuentes activa.
  await expect(page.getByRole("heading", { name: "Caso" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Nota sobre la conversación" })).toBeVisible();

  // Sin mensaje elegido el panel no carga fuentes.
  await expect(page.getByText(/Elegí una respuesta del agente/)).toBeVisible();

  // Clic en la respuesta del agente que tiene marca de consultas — esa
  // marca ("N consultas · ...") sólo aparece bajo mensajes del asistente
  // con búsquedas asociadas (DetalleChat.tsx / resumirPorRespuesta). Puede
  // no haber ninguna si el chat no consultó el corpus o si todas las
  // búsquedas quedaron huérfanas (sin messageId), caso en el que se saltea
  // con motivo explícito.
  const respuestaConMarca = page.locator("li").filter({ hasText: /\d+ (consulta|consultas) ·/ }).first();
  if ((await respuestaConMarca.count()) === 0) {
    test.skip(true, "Ninguna respuesta del chat de prueba tiene marca de consultas al corpus");
  }
  await respuestaConMarca.getByRole("button").first().click();
  await expect(page.getByText("Consulta del agente").first()).toBeVisible();
  await expect(respuestaConMarca).toHaveAttribute("data-seleccionada", "true");

  // La otra solapa es el detalle del mismo mensaje elegido.
  await page.getByRole("tab", { name: /Notas del mensaje/ }).click();
  await expect(page.getByRole("button", { name: "Nota sobre este mensaje" })).toBeVisible();

  await page.getByRole("button", { name: "Quitar selección" }).click();
  await expect(respuestaConMarca).not.toHaveAttribute("data-seleccionada", "true");
});
