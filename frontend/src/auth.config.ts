import type { NextAuthConfig } from "next-auth";

import { isAllowed } from "@/lib/board/allowlist";

const SIETE_DIAS_SEGUNDOS = 7 * 24 * 60 * 60;

export const authConfig = {
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
    verifyRequest: "/login/check-email",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.email = user.email;
        token.name = user.name;
      }
      // Re-chequea la allowlist en TODA invocación, no solo al signIn (`user`
      // solo llega en la primera). Es lo único que puede revocar una sesión
      // JWT ya emitida antes de sus 7 días de maxAge: sacar un email de
      // ALLOWED_EMAILS y redeployar no alcanza si el chequeo corre una sola
      // vez, porque no hay fila de Session que borrar (estrategia JWT).
      // Devolver null invalida el token acá mismo — lo ve el proxy (gate del
      // board) y cualquier auth() del lado servidor, sin lógica duplicada.
      if (!isAllowed(typeof token.email === "string" ? token.email : null)) {
        return null;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.email = typeof token.email === "string" ? token.email : "";
        session.user.name = typeof token.name === "string" ? token.name : null;
      }
      return session;
    },
  },
  session: { strategy: "jwt", maxAge: SIETE_DIAS_SEGUNDOS },
} satisfies NextAuthConfig;
