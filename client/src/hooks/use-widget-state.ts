import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

function getCachedValue(widgetId: string): boolean | undefined {
  const cached = queryClient.getQueryData<Record<string, boolean>>(["/api/widget-states"]);
  if (cached && widgetId in cached) {
    return cached[widgetId];
  }
  return undefined;
}

export function useWidgetState(widgetId: string, defaultOpen: boolean = true): [boolean, (open: boolean) => void] {
  const initialValue = getCachedValue(widgetId);
  const [isOpen, setIsOpenLocal] = useState(initialValue ?? defaultOpen);
  const initialized = useRef(initialValue !== undefined);

  const { data: allStates } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/widget-states"],
    staleTime: Infinity,
  });

  useEffect(() => {
    if (!initialized.current && allStates && widgetId in allStates) {
      setIsOpenLocal(allStates[widgetId]);
      initialized.current = true;
    }
  }, [allStates, widgetId]);

  const setIsOpen = useCallback((open: boolean) => {
    setIsOpenLocal(open);
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
