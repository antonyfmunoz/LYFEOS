import { useState, useEffect, useCallback } from "react";
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

export function useTutorialStatus(page: string) {
  const { user, isAuthenticated } = useAuth();

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/profile"],
    enabled: isAuthenticated && !!user,
    staleTime: 60000,
  });

  const completedTutorials: string[] = profile?.completedTutorials || [];
  const isCompleted = completedTutorials.includes(page);

  const isCeremonyReturn = typeof window !== "undefined" && sessionStorage.getItem("lyfeos_ceremony_complete") === "true";

  const shouldShow = !isLoading && !isCompleted;

  const [showTutorial, setShowTutorial] = useState(false);

  useEffect(() => {
    if (isLoading) return;

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
        }
      } catch (e) {
        console.error("Failed to save tutorial completion:", e);
      }
    }
  }, [user?.id, completedTutorials, page]);

  const skipAll = useCallback(async () => {
    setShowTutorial(false);
    if (user?.id) {
      try {
        queryClient.setQueryData(["/api/profile"], (old: any) => ({
          ...old,
          completedTutorials: [...TUTORIAL_PAGES],
        }));
        await apiRequest("/api/profile", {
          method: "PATCH",
          body: JSON.stringify({ completedTutorials: [...TUTORIAL_PAGES] }),
        });
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
