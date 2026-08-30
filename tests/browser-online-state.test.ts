import { describe, expect, it, vi } from "vitest";
import {
  createBrowserOnlineStateListener,
  type BrowserOnlineSource,
} from "../client/src/lib/browserOnlineState";

function createSource(initialOnline: boolean) {
  const listeners = new Map<string, Set<() => void>>();
  const navigator = { onLine: initialOnline };
  const source = {
    navigator,
    addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      const callback = listener as () => void;
      const current = listeners.get(type) || new Set<() => void>();
      current.add(callback);
      listeners.set(type, current);
    }),
    removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener as () => void);
    }),
  } as unknown as BrowserOnlineSource;

  return {
    source,
    navigator,
    dispatch(type: "online" | "offline") {
      for (const listener of listeners.get(type) || []) listener();
    },
  };
}

describe("browser online state synchronization", () => {
  it("publishes the browser's current state immediately instead of waiting for an event", () => {
    const browser = createSource(false);
    const setOnline = vi.fn();

    createBrowserOnlineStateListener(browser.source)(setOnline);

    expect(setOnline).toHaveBeenCalledTimes(1);
    expect(setOnline).toHaveBeenLastCalledWith(false);
  });

  it("reads current navigator state for both transitions and removes both listeners", () => {
    const browser = createSource(false);
    const setOnline = vi.fn();
    const cleanup = createBrowserOnlineStateListener(browser.source)(setOnline);

    browser.navigator.onLine = true;
    browser.dispatch("online");
    browser.navigator.onLine = false;
    browser.dispatch("offline");

    expect(setOnline.mock.calls.map(([online]) => online)).toEqual([false, true, false]);

    cleanup();
    browser.navigator.onLine = true;
    browser.dispatch("online");

    expect(setOnline).toHaveBeenCalledTimes(3);
    expect(browser.source.removeEventListener).toHaveBeenCalledTimes(2);
  });
});
