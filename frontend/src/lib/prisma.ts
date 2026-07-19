import "server-only";

import { PrismaClient } from "@prisma/client";

const DEFAULT_CONNECTION_LIMIT = 10;

function buildDatasourceUrl(): string | undefined {
  const base = process.env.DATABASE_URL;
  if (!base) return undefined;

  const limitRaw = process.env.PRISMA_CONNECTION_LIMIT;
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : DEFAULT_CONNECTION_LIMIT;
  const safeLimit = Number.isFinite(limit) && limit >= 1 && limit <= 100 ? limit : DEFAULT_CONNECTION_LIMIT;

  const url = new URL(base);
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", String(safeLimit));
  }
  if (!url.searchParams.has("pool_timeout")) {
    url.searchParams.set("pool_timeout", "10");
  }
  return url.toString();
}

function createPrismaClient(): PrismaClient {
  const datasourceUrl = buildDatasourceUrl();
  return new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    // During build there may be no DATABASE_URL; resolve lazily in that case.
    ...(datasourceUrl ? { datasourceUrl } : {}),
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

/** Singleton: avoids exhausting the connection pool on hot reload. */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
