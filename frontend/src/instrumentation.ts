/**
 * Next.js startup hook. Runs once per server boot (nodejs runtime only):
 * validates env and registers graceful shutdown + crash logging.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { validateEnvironment } = await import("@/lib/env-validation");
  const { logger } = await import("@/utils/logger");

  validateEnvironment();

  const shutdown = (signal: string) => {
    logger.info("Shutting down", { signal });
    // 5s deadline: Railway sends SIGTERM before killing the container.
    setTimeout(() => process.exit(0), 5000).unref();
    process.exit(0);
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (reason) => {
    logger.fatal("Unhandled rejection", { reason: reason instanceof Error ? reason.message : String(reason) });
  });
  process.on("uncaughtException", (error) => {
    logger.fatal("Uncaught exception", { error: error.message, stack: error.stack });
  });
}
