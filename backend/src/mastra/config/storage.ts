import { PostgresStore } from "@mastra/pg";
import pg from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error(
    "DATABASE_URL is not set. Point it to the shared Postgres instance (with pgvector), e.g. postgresql://user:pass@host:5432/legalseller",
  );
}

/**
 * Single shared pool for everything: Mastra storage and raw SQL from tools.
 * keepAlive is critical behind TCP proxies (Railway) to avoid dropped
 * idle connections.
 */
const pool = new pg.Pool({
  connectionString,
  keepAlive: true,
});

// @mastra/pg >= 1.16 requires a non-empty store id (older docs omit it).
export const postgresStore = new PostgresStore({ id: "legalseller-storage", pool });

/** Exposes the shared pool to tools and services (pgvector queries). */
export function getPool(): pg.Pool {
  return pool;
}
