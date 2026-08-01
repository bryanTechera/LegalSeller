import { expect, test } from "@playwright/test";

test("el chat público sigue abierto sin sesión", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByLabel("Escribí tu consulta")).toBeVisible();

  // El endpoint del chat no debe pedir sesión: un 401/302 acá es el producto caído.
  const respuesta = await request.post("/api/chat/stream", {
    data: { message: "hola" },
    failOnStatusCode: false,
  });
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
