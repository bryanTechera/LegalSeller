# ── Builder ───────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder
WORKDIR /app

RUN corepack enable pnpm

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ── Production ────────────────────────────────────────────────────────────────
FROM node:24-alpine AS production
WORKDIR /app

RUN apk add --no-cache dumb-init \
  && addgroup -g 1001 nodejs \
  && adduser -S -u 1001 -G nodejs nodejs

COPY package.json pnpm-lock.yaml ./
RUN corepack enable pnpm && pnpm install --prod --frozen-lockfile --ignore-scripts

COPY --from=builder --chown=nodejs:nodejs /app/.mastra ./.mastra

ENV NODE_ENV=production
# IPv6 for Railway's internal network.
ENV HOST=::
ENV HOSTNAME=::
ENV PORT=4112

USER nodejs
EXPOSE 4112

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- "http://[::1]:${PORT}/api/agents" || exit 1

ENTRYPOINT ["dumb-init", "--"]
CMD ["node", ".mastra/output/index.mjs"]
