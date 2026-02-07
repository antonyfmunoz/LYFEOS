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
  const isOpenRef = useRef(isOpen);

  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const { data: allStates } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/widget-states"],
    staleTime: Infinity,
  });

  useEffect(() => {
    if (allStates && widgetId in allStates) {
      const serverValue = allStates[widgetId];
      if (serverValue !== isOpenRef.current) {
        setIsOpenLocal(serverValue);
      }
    }
  }, [allStates, widgetId]);

  const setIsOpen = useCallback((open: boolean) => {
    setIsOpenLocal(open);
    isOpenRef.current = open;
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
