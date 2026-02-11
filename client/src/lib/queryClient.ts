import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest<T = any>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      ...(options?.headers || {}),
      ...(options?.body ? { "Content-Type": "application/json" } : {}),
    },
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return await res.json() as T;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey[0] as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

let redirecting401 = false;
function handleGlobal401(error: unknown) {
  if (typeof window === "undefined") return;
  if (redirecting401) return;
  if (error instanceof Error && error.message.startsWith("401:")) {
    const currentPath = window.location.pathname;
    const publicPaths = ["/login", "/register", "/verify-email", "/forgot-password", "/reset-password", "/login-success", "/onboarding"];
    if (!publicPaths.some(p => currentPath.startsWith(p))) {
      redirecting401 = true;
      console.log("Session expired (401), clearing auth and redirecting to login");
      localStorage.removeItem("lyfeos_user");
      window.location.href = "/login";
    }
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
      onError: handleGlobal401,
    },
  },
});

queryClient.getQueryCache().subscribe((event) => {
  if (event.type === "updated" && event.action?.type === "error") {
    handleGlobal401(event.action.error);
  }
});
