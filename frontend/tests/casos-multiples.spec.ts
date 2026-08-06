import { expect, test } from "@playwright/test";

import { iniciarSesionBoard } from "./helpers/sesion-board";

const SECRETO = process.env.AUTH_SECRET ?? "";

test.skip(!SECRETO, "AUTH_SECRET no seteada — E2E del board deshabilitado");

test("dos temas en un chat producen dos casos en el board", async ({ page }) => {
  test.setTimeout(240_000);

  // 1) Chat público: un despido y después, en el MISMO chat, un desalojo.
  await page.goto("/");
  const composer = page.getByRole("textbox", { name: "Escribí tu consulta" });
  // El botón de enviar NO queda simplemente deshabilitado durante el stream:
  // Composer.tsx lo reemplaza por "Detener la respuesta" mientras
  // `isStreaming` es true (ChatPanel siempre pasa `onStop`), y al reaparecer
  // sigue deshabilitado porque el draft ya se vació al enviar. La señal de
  // "turno completo" es la desaparición de ese botón, no el estado de
  // "Enviar la consulta".
  const detener = page.getByRole("button", { name: "Detener la respuesta" });

  const enviarYEsperarTurno = async (mensaje: string) => {
    await composer.fill(mensaje);
    await composer.press("Enter");
    await expect(detener).toBeVisible({ timeout: 10_000 });
    await expect(detener).toBeHidden({ timeout: 90_000 });
  };

  await enviarYEsperarTurno("me despidieron sin causa después de 6 años y no me pagaron la liquidación");
  await enviarYEsperarTurno("aparte el dueño del apartamento que alquilo me quiere echar sin aviso");
  // El cambio de caso activo se aplica al turno SIGUIENTE al que marcó
  // derivar-tema: este tercer mensaje es el que lo ejercita.
  await enviarYEsperarTurno("qué puedo hacer con el desalojo?");

  // 2) Board: el chat más reciente tiene dos casos.
  await iniciarSesionBoard(page);
  await page.goto("/board/chats");
  const filas = page.locator("tbody tr");
  await expect(filas.first()).toBeVisible({ timeout: 30_000 });

  await filas.first().getByRole("link").click();
  await expect(page).toHaveURL(/\/board\/chats\/.+/);

  // El encabezado por caso (h3) sólo se renderiza con más de un caso
  // (DetalleChat.tsx) — es la señal de que el mismo chat produjo dos casos.
  // `Conversation.categoria` es first-write-wins (clasificacion.ts) y queda
  // en "laboral" para siempre, así que el <h1> del detalle TAMBIÉN dice
  // "laboral": sin `level: 3` el locator matchea dos headings (el h1 de la
  // conversación y el h3 del primer caso) y Playwright tira un strict-mode
  // violation.
  await expect(page.getByRole("heading", { name: "laboral", level: 3 })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "arrendamiento-desalojo", level: 3 })).toBeVisible();
  await expect(page.getByText("· en curso")).toBeVisible();
});
