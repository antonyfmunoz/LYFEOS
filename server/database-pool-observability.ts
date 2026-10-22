export type DatabasePoolErrorSource = {
  on(event: "error", listener: (error: Error) => void): unknown;
};

export type DatabasePoolErrorReporter = (error: Error) => void;

/**
 * An idle PostgreSQL connection can be terminated by the database or network
 * independently of a request. node-postgres emits that failure through the
 * pool's EventEmitter, where an absent listener becomes an uncaught process
 * error. Keep that operational event observable without turning one discarded
 * idle client into an application shutdown.
 */
export function observeDatabasePoolErrors(pool: DatabasePoolErrorSource, report: DatabasePoolErrorReporter): void {
  pool.on("error", (error) => {
    try {
      report(error);
    } catch {
      // The pool listener is the last boundary before EventEmitter would turn a
      // reporting failure into another uncaught exception. Do not rethrow here.
      console.error("[database] unable to report an idle pool connection error");
    }
  });
}

export function databasePoolErrorMetadata(error: Error): { name: string; code?: string } {
  const code = (error as NodeJS.ErrnoException).code;
  return {
    name: error.name || "Error",
    ...(typeof code === "string" ? { code } : {}),
  };
}
