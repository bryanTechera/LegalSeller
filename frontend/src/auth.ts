import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";

import { authConfig } from "@/auth.config";
import { isAllowed } from "@/lib/board/allowlist";
import { enviarMagicLink } from "@/lib/board/mailer";
import { prisma } from "@/lib/prisma";
import { logger } from "@/utils/logger";

if (!process.env.ALLOWED_EMAILS?.trim()) {
  // Fail-closed es correcto, pero silencioso: sin este aviso el síntoma es
  // un login que rebota sin explicación.
  logger.warn("ALLOWED_EMAILS vacía — ningún email puede entrar al board");
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM,
      async sendVerificationRequest({ identifier, url }) {
        await enviarMagicLink({ para: identifier, url });
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    signIn({ user }) {
      return isAllowed(user.email);
    },
  },
});
