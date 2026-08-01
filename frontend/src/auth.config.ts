import type { NextAuthConfig } from "next-auth";

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
