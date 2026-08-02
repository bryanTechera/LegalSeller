import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/auth.config";

const { auth } = NextAuth(authConfig);

/**
 * Gate grueso del board. Next 16 renombró `middleware.ts` a `proxy.ts`:
 * con el nombre viejo este archivo no se ejecutaría y el board quedaría
 * abierto sin ningún error visible.
 *
 * El matcher cubre SOLO el board. El chat público (`/`, `/api/chat/*`,
 * `/api/health`) queda fuera a propósito.
 *
 * `/api/revision/*` también queda fuera, por dos razones: `POST
 * /api/revision/acceso` es el login del runner de escenarios (si exigiéramos
 * sesión ahí, el runner no podría autenticarse nunca), y su credencial es un
 * HMAC que se verifica con `node:crypto`, ausente en el runtime Edge. Esas
 * rutas se protegen en el handler con `getIdentidadBoard()`, que entiende
 * las dos credenciales.
 */
export default auth((request) => {
  if (request.auth) return NextResponse.next();

  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const destino = new URL("/login", request.url);
  destino.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(destino);
});

export const config = {
  matcher: ["/board/:path*", "/api/board/:path*"],
};
