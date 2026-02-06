import { useState, useCallback, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

export function useWidgetState(widgetId: string, defaultOpen: boolean = true): [boolean, (open: boolean) => void] {
  const { data: allStates } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/widget-states"],
    staleTime: Infinity,
  });

  const hasServerState = allStates !== undefined && widgetId in (allStates || {});
  const serverValue = allStates?.[widgetId];
  const [localValue, setLocalValue] = useState(defaultOpen);

  useEffect(() => {
    if (hasServerState && serverValue !== undefined) {
      setLocalValue(serverValue);
    }
  }, [hasServerState, serverValue]);

  const mutation = useMutation({
    mutationFn: async ({ isOpen }: { isOpen: boolean }) => {
      return apiRequest("/api/widget-states", {
        method: "PUT",
        body: JSON.stringify({ widgetId, isOpen }),
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["/api/widget-states"], data);
    },
  });

  const setIsOpen = useCallback((open: boolean) => {
    setLocalValue(open);
    mutation.mutate({ isOpen: open });
  }, [widgetId, mutation]);

  const isOpen = hasServerState ? (serverValue ?? defaultOpen) : localValue;

  return [isOpen, setIsOpen];
}
