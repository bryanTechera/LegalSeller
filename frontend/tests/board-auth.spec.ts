import { expect, test } from "@playwright/test";

test("el chat público sigue abierto sin sesión", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByLabel("Escribí tu consulta")).toBeVisible();

  // El endpoint del chat no debe pedir sesión: un 401/302 acá es el producto
  // caído. Mensaje deliberadamente inválido (falla sendMessageSchema, 400
  // instantáneo): con un mensaje real, el receptor buferea el turno COMPLETO
  // antes de que el handler devuelva siquiera el status (runReceptor drena el
  // stream entero antes de decidir si encadena a un agente de categoría), así
  // que ni leer solo el head evita esperar una generación LLM real (~90s
  // desde esta máquina) — de ahí la flakiness contra el timeout default de
  // Playwright. El punto del test es solo que la request atraviesa el proxy y
  // llega al handler; un 400 de validación lo prueba igual de bien, sin la
  // generación real ni la contención con otros specs que sí llaman al agente.
  const respuesta = await request.post("/api/chat/stream", {
    data: { message: "" },
    failOnStatusCode: false,
  });
  // <500 primero (un 500 por una causa no relacionada no debe leerse como
  // éxito), más las dos exclusiones específicas del gate de auth que este
  // test existe para cubrir.
  expect(respuesta.status()).toBeLessThan(500);
  expect(respuesta.status()).not.toBe(401);
  expect(respuesta.status()).not.toBe(302);

  const salud = await request.get("/api/health", { failOnStatusCode: false });
  expect(salud.status()).toBe(200);
});

test("/board sin sesión redirige a /login", async ({ page }) => {
  await page.goto("/board");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByLabel("Tu email")).toBeVisible();
});

test("/api/board/* sin sesión responde 401", async ({ request }) => {
  const respuesta = await request.get("/api/board/metricas?rango=7d", { failOnStatusCode: false });
  expect(respuesta.status()).toBe(401);
});
