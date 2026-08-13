import { expect, test } from "@playwright/test";

import { crearCasoDePrueba } from "./helpers/caso-de-prueba";
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

  // El chat se abre DENTRO de la ficha: cambia la columna principal y nada
  // más. Si en vez de eso navegara al tab Chats, el contacto desaparecería.
  await page.getByRole("link", { name: "Ver chat completo" }).click();
  await expect(page).toHaveURL(/\?vista=chat$/);
  await expect(page.getByRole("heading", { name: "Conversación" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "Resumen del caso" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "Contacto" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Gestionar" })).toBeVisible();

  // La conversación scrollea por dentro: si estirara la página, una charla
  // larga se llevaría el contacto y la gestión fuera de la vista.
  await expect(page.locator("ol > li").first()).toBeVisible({ timeout: 15_000 });
  const lista = await page.locator("ol").first().evaluate((el) => ({
    overflow: getComputedStyle(el).overflowY,
    entraEnPantalla: el.clientHeight <= window.innerHeight,
  }));
  expect(lista).toEqual({ overflow: "auto", entraEnPantalla: true });

  // Y el mismo control vuelve.
  await page.getByRole("link", { name: "Ver resumen del caso" }).click();
  await expect(page.getByRole("heading", { name: "Resumen del caso" })).toBeVisible({ timeout: 15_000 });
});

// El test escribe, así que trabaja sobre un caso propio y lo borra al final.
// La versión anterior le agregaba la nota al primer caso del listado — que por
// el guard `casosReales` es el legajo de una persona real, en una tabla
// append-only y sin borrado por UI.
test("se puede agregar una nota al caso y queda con autor y fecha tras recargar", async ({ page }) => {
  test.setTimeout(120_000);
  const caso = await crearCasoDePrueba();

  try {
    await iniciarSesionBoard(page);

    await page.goto(`/board/casos/${caso.casoId}`);
    await expect(page.getByRole("heading", { name: "Notas del equipo legal" })).toBeVisible({ timeout: 30_000 });

    const texto = `Nota de verificación E2E ${Date.now()}`;
    await page.getByLabel("Nueva nota").fill(texto);

    // El POST se espera explícitamente. `getByText(texto)` a secas matchea el
    // valor del propio textarea, así que pasaba sin que la nota existiera y el
    // reload cancelaba el request en vuelo: el test no podía fallar por lo que
    // dice medir. La nota se busca dentro de su <li>, no en cualquier lado.
    const guardado = page.waitForResponse(
      (respuesta) =>
        respuesta.url().includes(`/casos/${caso.casoId}/notas`) && respuesta.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Agregar nota" }).click();
    expect((await guardado).status()).toBe(201);

    await expect(page.locator("li").filter({ hasText: texto })).toBeVisible({ timeout: 15_000 });
    expect(await caso.contarNotas()).toBe(1);

    await page.reload();
    const nota = page.locator("li").filter({ hasText: texto });
    await expect(nota).toBeVisible({ timeout: 30_000 });
    // La nota persistida trae autor y fecha en la misma línea (formato "autor · fecha").
    await expect(nota.getByText(/·/)).toBeVisible();
  } finally {
    await caso.borrar();
  }
});
