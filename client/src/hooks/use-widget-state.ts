import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

const STORAGE_KEY = "lyfeos-widget-states";

function readLocalStates(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalState(widgetId: string, isOpen: boolean) {
  try {
    const states = readLocalStates();
    states[widgetId] = isOpen;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch {}
}

export function useWidgetState(widgetId: string, defaultOpen: boolean = true): [boolean, (open: boolean) => void] {
  const localStates = readLocalStates();
  const initialValue = widgetId in localStates ? localStates[widgetId] : defaultOpen;
  const [isOpen, setIsOpenLocal] = useState(initialValue);
  const isOpenRef = useRef(isOpen);
  const lastLocalChangeRef = useRef(0);
  const hasSyncedFromServerRef = useRef(false);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const { data: allStates } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/widget-states"],
    staleTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (allStates && widgetId in allStates && !hasSyncedFromServerRef.current) {
      hasSyncedFromServerRef.current = true;
      const serverValue = allStates[widgetId];
      const local = readLocalStates();
      if (!(widgetId in local)) {
        setIsOpenLocal(serverValue);
        isOpenRef.current = serverValue;
        writeLocalState(widgetId, serverValue);
      }
    }
  }, [allStates, widgetId]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.widgetId === widgetId) {
        const newValue = detail.open as boolean;
        lastLocalChangeRef.current = Date.now();
        if (newValue !== isOpenRef.current) {
          setIsOpenLocal(newValue);
          isOpenRef.current = newValue;
          writeLocalState(widgetId, newValue);
        }
      }
    };
    window.addEventListener("widget-state-changed", handler);
    return () => window.removeEventListener("widget-state-changed", handler);
  }, [widgetId]);

  const setIsOpen = useCallback((open: boolean) => {
    lastLocalChangeRef.current = Date.now();
    setIsOpenLocal(open);
    isOpenRef.current = open;
    writeLocalState(widgetId, open);
    queryClient.setQueryData<Record<string, boolean>>(["/api/widget-states"], (prev) => ({
      ...prev,
      [widgetId]: open,
    }));
    apiRequest("/api/widget-states", {
      method: "PUT",
      body: JSON.stringify({ widgetId, isOpen: open }),
    }).catch(() => {});
  }, [widgetId]);

  return [isOpen, setIsOpen];
}
