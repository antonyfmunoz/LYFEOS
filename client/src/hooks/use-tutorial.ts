import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { apiRequest, queryClient } from "@/lib/queryClient";

const TUTORIAL_PAGES = [
  "dashboard",
  "missions",
  "profile",
  "chronilog",
  "tracker",
  "rolodex",
  "timeline",
  "ai",
];

const TUTORIALS_SKIPPED_KEY = "lyfeos-tutorials-all-skipped";

function isAllSkippedLocally(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(TUTORIALS_SKIPPED_KEY) === "true";
  } catch {
    return false;
  }
}

function markAllSkippedLocally() {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TUTORIALS_SKIPPED_KEY, "true");
  } catch {}
}

export function useTutorialStatus(page: string) {
  const { user, isAuthenticated } = useAuth();
  const dismissedRef = useRef(false);

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/profile"],
    enabled: isAuthenticated && !!user,
    staleTime: 60000,
  });

  const completedTutorials: string[] = profile?.completedTutorials || [];
  const isCompleted = completedTutorials.includes(page) || isAllSkippedLocally();

  const isCeremonyReturn = typeof window !== "undefined" && sessionStorage.getItem("lyfeos_ceremony_complete") === "true";

  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (dismissedRef.current) return;
    if (isAllSkippedLocally()) {
      setShowTutorial(false);
      return;
    }

    if (page === "dashboard" && isCeremonyReturn) {
      sessionStorage.removeItem("lyfeos_ceremony_complete");
      setShowTutorial(true);
      return;
    }

    if (!isCompleted) {
      setShowTutorial(true);
    } else {
      setShowTutorial(false);
    }
  }, [isLoading, isCompleted, page, isCeremonyReturn]);

  const markComplete = useCallback(async () => {
    dismissedRef.current = true;
    setShowTutorial(false);
    if (user?.id) {
      try {
        const existing = completedTutorials;
        if (!existing.includes(page)) {
          const updated = [...existing, page];
          queryClient.setQueryData(["/api/profile"], (old: any) => ({
            ...old,
            completedTutorials: updated,
          }));
          await apiRequest("/api/profile", {
            method: "PATCH",
            body: JSON.stringify({ completedTutorials: updated }),
          });
          queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
        }
      } catch (e) {
        console.error("Failed to save tutorial completion:", e);
      }
    }
  }, [user?.id, completedTutorials, page]);

  const skipAll = useCallback(async () => {
    dismissedRef.current = true;
    setShowTutorial(false);
    markAllSkippedLocally();
    if (user?.id) {
      try {
        const allPages = [...TUTORIAL_PAGES];
        queryClient.setQueryData(["/api/profile"], (old: any) => ({
          ...old,
          completedTutorials: allPages,
        }));
        await apiRequest("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({ completedTutorials: allPages }),
        });
        queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      } catch (e) {
        console.error("Failed to save tutorial skip:", e);
      }
    }
  }, [user?.id]);

  return {
    showTutorial,
    setShowTutorial,
    markComplete,
    skipAll,
    isLoading,
    isTutorialActive: showTutorial,
  };
}

export function isTutorialCompleted(profile: any, page: string): boolean {
  const completed: string[] = profile?.completedTutorials || [];
  return completed.includes(page);
}
