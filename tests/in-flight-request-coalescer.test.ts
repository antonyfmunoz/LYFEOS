import { describe, expect, it, vi } from "vitest";
import { InFlightRequestCoalescer } from "../server/in-flight-request-coalescer";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("InFlightRequestCoalescer", () => {
  it("shares one pending load for the same key", async () => {
    const pending = deferred<{ totalXP: number }>();
    const load = vi.fn(() => pending.promise);
    const coalescer = new InFlightRequestCoalescer<number, { totalXP: number }>();

    const first = coalescer.run(42, load);
    const second = coalescer.run(42, load);

    expect(first).toBe(second);
    expect(load).toHaveBeenCalledTimes(0);

    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);

    pending.resolve({ totalXP: 1200 });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { totalXP: 1200 },
      { totalXP: 1200 },
    ]);
  });

  it("isolates simultaneous loads by key", async () => {
    const coalescer = new InFlightRequestCoalescer<number, number>();
    const loads: number[] = [];

    const [first, second] = await Promise.all([
      coalescer.run(1, async () => { loads.push(1); return 10; }),
      coalescer.run(2, async () => { loads.push(2); return 20; }),
    ]);

    expect([first, second]).toEqual([10, 20]);
    expect(loads.sort()).toEqual([1, 2]);
  });

  it("does not cache a settled result", async () => {
    const load = vi.fn(async () => load.mock.calls.length);
    const coalescer = new InFlightRequestCoalescer<string, number>();

    await expect(coalescer.run("user", load)).resolves.toBe(1);
    await expect(coalescer.run("user", load)).resolves.toBe(2);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("releases a rejected load so the next request can recover", async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockResolvedValueOnce("recovered");
    const coalescer = new InFlightRequestCoalescer<number, string>();

    await expect(coalescer.run(7, load)).rejects.toThrow("temporary failure");
    await expect(coalescer.run(7, load)).resolves.toBe("recovered");
    expect(load).toHaveBeenCalledTimes(2);
  });
});
