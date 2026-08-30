export type BrowserOnlineSource = {
  navigator: Pick<Navigator, "onLine">;
  addEventListener: Window["addEventListener"];
  removeEventListener: Window["removeEventListener"];
};

export type SetOnline = (online: boolean) => void;

/**
 * TanStack Query defaults its initial connectivity state to online and only
 * learns about later browser events. Read navigator.onLine immediately as well
 * so a reload after an offline mutation cannot inherit a stale paused state.
 */
export function createBrowserOnlineStateListener(source: BrowserOnlineSource) {
  return (setOnline: SetOnline) => {
    const synchronize = () => setOnline(source.navigator.onLine);

    source.addEventListener("online", synchronize, false);
    source.addEventListener("offline", synchronize, false);
    synchronize();

    return () => {
      source.removeEventListener("online", synchronize, false);
      source.removeEventListener("offline", synchronize, false);
    };
  };
}
