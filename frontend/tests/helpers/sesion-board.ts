import type { Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

/** El salt de Auth.js v5 ES el nombre de la cookie. Sin prefijo __Secure en HTTP local. */
const COOKIE_SESION = "authjs.session-token";

/**
 * Deja a `page` con una sesión del board ya iniciada, sin pasar por el magic
 * link (que necesitaría un inbox). Requiere que AUTH_SECRET sea el mismo que
 * usa el dev server — Playwright lo levanta con `pnpm dev`, que lee el mismo
 * `.env`, así que coinciden.
 */
export async function iniciarSesionBoard(page: Page, email = "e2e@jurco.uy"): Promise<void> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET no está seteada — el helper no puede acuñar la sesión");

  const token = await encode({
    token: { email, name: "Dra. E2E" },
    secret,
    salt: COOKIE_SESION,
  });

  await page.context().addCookies([
    { name: COOKIE_SESION, value: token, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" },
  ]);
}
