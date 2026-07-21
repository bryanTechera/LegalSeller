# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
# El postinstall del frontend corre `prisma generate`; el schema debe estar presente.
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ── Production ────────────────────────────────────────────────────────────────
FROM node:24-alpine AS production
WORKDIR /app

# openssl y libc6-compat: requeridos por los engines de Prisma en Alpine (musl).
RUN apk add --no-cache dumb-init openssl libc6-compat \
  && addgroup -g 1001 nodejs \
  && adduser -S -u 1001 -G nodejs nodejs

ENV NODE_ENV=production

# node_modules completo del builder: preserva los symlinks relativos de pnpm y
# el cliente Prisma generado, y deja el CLI de Prisma para el pre-deploy migrate.
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/.next ./.next
COPY --from=builder --chown=nodejs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nodejs:nodejs /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma

USER nodejs
EXPOSE 3000

ENTRYPOINT ["dumb-init", "--"]
CMD ["node_modules/.bin/next", "start"]
