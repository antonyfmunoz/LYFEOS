import { describe, expect, it, vi } from "vitest";
import { databasePoolErrorMetadata, observeDatabasePoolErrors } from "../server/database-pool-observability";

class FakePool {
  private errorListener: ((error: Error) => void) | undefined;

  on(event: "error", listener: (error: Error) => void) {
    if (event === "error") this.errorListener = listener;
  }

  emitIdleConnectionError(error: Error) {
    this.errorListener?.(error);
  }
}

describe("database pool observability", () => {
  it("observes an idle client failure without rethrowing it", () => {
    const pool = new FakePool();
    const report = vi.fn();
    observeDatabasePoolErrors(pool, report);

    const error = Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" });
    expect(() => pool.emitIdleConnectionError(error)).not.toThrow();
    expect(report).toHaveBeenCalledWith(error);
    expect(databasePoolErrorMetadata(error)).toEqual({ name: "Error", code: "ECONNRESET" });
  });

  it("contains a reporter failure at the EventEmitter boundary", () => {
    const pool = new FakePool();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    observeDatabasePoolErrors(pool, () => { throw new Error("Sentry unavailable"); });

    expect(() => pool.emitIdleConnectionError(new Error("Connection terminated unexpectedly"))).not.toThrow();
    expect(consoleError).toHaveBeenCalledWith("[database] unable to report an idle pool connection error");
  });
});
