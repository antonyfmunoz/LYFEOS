import { useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

function getCachedState(widgetId: string): boolean | undefined {
  const cached = queryClient.getQueryData<Record<string, boolean>>(["/api/widget-states"]);
  if (cached && widgetId in cached) {
    return cached[widgetId];
  }
  return undefined;
}

export function useWidgetState(widgetId: string, defaultOpen: boolean = true): [boolean, (open: boolean) => void] {
  const { data: allStates } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/widget-states"],
    staleTime: Infinity,
  });

  const savedValue = allStates?.[widgetId];
  const isOpen = savedValue !== undefined ? savedValue : (getCachedState(widgetId) ?? defaultOpen);

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
    onMutate: async ({ isOpen }) => {
      const prev = queryClient.getQueryData<Record<string, boolean>>(["/api/widget-states"]);
      queryClient.setQueryData(["/api/widget-states"], { ...prev, [widgetId]: isOpen });
      return { prev };
    },
    onError: (_err, _vars, context) => {
      if (context?.prev) {
        queryClient.setQueryData(["/api/widget-states"], context.prev);
      }
    },
  });

  const setIsOpen = useCallback((open: boolean) => {
    mutation.mutate({ isOpen: open });
  }, [widgetId, mutation]);

  return [isOpen, setIsOpen];
}
