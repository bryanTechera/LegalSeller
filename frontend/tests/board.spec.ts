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

  // «Expandir» le da la columna entera al panel del mensaje.
  await page.getByRole("button", { name: "Expandir" }).click();
  await expect(page.getByRole("heading", { name: "Caso" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nota sobre la conversación" })).toBeHidden();
  await page.getByRole("button", { name: "Contraer" }).click();
  await expect(page.getByRole("button", { name: "Nota sobre la conversación" })).toBeVisible();

  await page.getByRole("tab", { name: "Fuentes" }).click();
  await page.getByRole("button", { name: "Quitar selección" }).click();
  await expect(respuestaConMarca).not.toHaveAttribute("data-seleccionada", "true");
});

test("la bandeja de casos abre la ficha y guarda la gestión", async ({ page }) => {
  test.setTimeout(120_000);
  await iniciarSesionBoard(page);

  await page.goto("/board/casos");
  await expect(page.getByRole("heading", { name: "Casos" })).toBeVisible();

  // La tabla la llena SWR después del fetch: contar antes de que resuelva da
  // siempre 0 y hace que el test se saltee solo con un motivo falso.
  const filas = page.locator("tbody tr");
  const vacio = page.getByText("No hay casos con estos filtros.");
  await expect(filas.first().or(vacio)).toBeVisible({ timeout: 30_000 });

  if (await vacio.isVisible()) {
    test.skip(true, "Sin casos captados en la base de prueba");
  }

  await filas.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/board\/casos\/.+/);

  // La ficha genera la síntesis con IA al abrirse cuando no la tiene: el botón
  // de gestión se renderiza igual, no espera por eso.
  const gestionar = page.getByRole("button", { name: "Gestionar" });
  await expect(gestionar).toBeVisible({ timeout: 30_000 });

  // Esta fila es la primera de la bandeja REAL (esRevision = false): un lead
  // de un consultante de verdad, no un fixture. El PATCH que este test
  // dispara queda escrito en la base de prueba, así que hay que devolver el
  // caso a como estaba — de lo contrario el test marca a un consultante real
  // como "contactado" y el equipo lo saltea creyendo que alguien ya lo llamó
  // (el CasoEvento de auditoría queda igual, es append-only y está bien que
  // así sea; lo que no puede quedar es la gestión vigente pisada).
  const ETIQUETAS = ["Nuevo", "Contactado", "Derivado", "Descartado"] as const;

  /** El modal abre con el estado vigente seleccionado: eso lo delata. */
  async function estadoVigente(): Promise<(typeof ETIQUETAS)[number]> {
    const dialogo = page.getByRole("dialog");
    for (const etiqueta of ETIQUETAS) {
      if ((await dialogo.getByRole("button", { name: etiqueta }).getAttribute("aria-pressed")) === "true") {
        return etiqueta;
      }
    }
    // Todo caso tiene gestión (el default es "Nuevo"), así que siempre hay un
    // botón presionado — el fallback es solo para no colgar el test si un
    // cambio de UI rompe aria-pressed en vez de fallar con un mensaje claro.
    return "Nuevo";
  }

  async function guardarGestion(destino: (typeof ETIQUETAS)[number]) {
    const dialogo = page.getByRole("dialog");
    await dialogo.getByRole("button", { name: destino }).click();
    await dialogo.getByRole("button", { name: "Guardar cambio" }).click();
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 15_000 });
  }

  await gestionar.click();
  const original = await estadoVigente();
  const destino = ETIQUETAS.find((etiqueta) => etiqueta !== original)!;

  try {
    await guardarGestion(destino);
    await expect(page.getByText(`Gestión: ${destino}`)).toBeVisible({ timeout: 15_000 });

    // El cambio tiene que sobrevivir a la recarga: si solo vive en el estado
    // del cliente, el PATCH no llegó a la base y nadie se entera.
    await page.reload();
    await expect(page.getByText(`Gestión: ${destino}`)).toBeVisible({ timeout: 30_000 });
  } finally {
    // Restaura el estado original SIEMPRE, incluso si una aserción de arriba
    // falló — un lead real no puede quedar marcado por una corrida de test.
    await page.getByRole("button", { name: "Gestionar" }).click();
    await guardarGestion(original);
    await expect(page.getByText(`Gestión: ${original}`)).toBeVisible({ timeout: 15_000 });
  }
});
