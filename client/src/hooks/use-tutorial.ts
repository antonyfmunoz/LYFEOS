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

const TUTORIALS_SKIPPED_PREFIX = "lyfeos-tutorials-all-skipped-";
const TUTORIAL_COMPLETED_PREFIX = "lyfeos-tutorial-done-";

function getSkipKey(userId: number | undefined | null): string {
  return `${TUTORIALS_SKIPPED_PREFIX}${userId || "anon"}`;
}

function getPageCompleteKey(page: string, userId: number | undefined | null): string {
  return `${TUTORIAL_COMPLETED_PREFIX}${page}-${userId || "anon"}`;
}

function isAllSkippedLocally(userId: number | undefined | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(getSkipKey(userId)) === "true";
  } catch {
    return false;
  }
}

function markAllSkippedLocally(userId: number | undefined | null) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getSkipKey(userId), "true");
  } catch {}
}

function isPageCompletedLocally(page: string, userId: number | undefined | null): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(getPageCompleteKey(page, userId)) === "true";
  } catch {
    return false;
  }
}

function markPageCompletedLocally(page: string, userId: number | undefined | null) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(getPageCompleteKey(page, userId), "true");
  } catch {}
}

export function useTutorialStatus(page: string) {
  const { user, isAuthenticated } = useAuth();
  const dismissedRef = useRef(false);
  const userId = user?.id;

  const alreadyDoneLocally = isAllSkippedLocally(userId) || isPageCompletedLocally(page, userId);

  const { data: profile, isLoading } = useQuery<any>({
    queryKey: ["/api/profile"],
    enabled: isAuthenticated && !!user,
    staleTime: 60000,
  });

  const completedTutorials: string[] = profile?.completedTutorials || [];
  const isCompletedOnServer = completedTutorials.includes(page);
  const isCompleted = isCompletedOnServer || alreadyDoneLocally;

  useEffect(() => {
    if (isCompletedOnServer && !isPageCompletedLocally(page, userId)) {
      markPageCompletedLocally(page, userId);
    }
  }, [isCompletedOnServer, page, userId]);

  const isCeremonyReturn = typeof window !== "undefined" && sessionStorage.getItem("lyfeos_ceremony_complete") === "true";

  const [showTutorial, setShowTutorial] = useState(false);

  const tutorialLoading = isLoading && !alreadyDoneLocally;

  useEffect(() => {
    if (isLoading && !alreadyDoneLocally) return;
    if (dismissedRef.current) return;
    if (isCompleted) {
      setShowTutorial(false);
      return;
    }

    if (page === "dashboard" && isCeremonyReturn) {
      sessionStorage.removeItem("lyfeos_ceremony_complete");
      setShowTutorial(true);
      return;
    }

    setShowTutorial(true);
  }, [isLoading, isCompleted, page, isCeremonyReturn, alreadyDoneLocally]);

  const markComplete = useCallback(async () => {
    dismissedRef.current = true;
    setShowTutorial(false);
    markPageCompletedLocally(page, userId);
    if (user?.id) {
      try {
        const currentProfile = queryClient.getQueryData<any>(["/api/profile"]);
        const existing: string[] = currentProfile?.completedTutorials || [];
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
  }, [user?.id, userId, page]);

  const skipAll = useCallback(async () => {
    dismissedRef.current = true;
    setShowTutorial(false);
    markAllSkippedLocally(userId);
    TUTORIAL_PAGES.forEach(p => markPageCompletedLocally(p, userId));
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
  }, [user?.id, userId]);

  return {
    showTutorial,
    setShowTutorial,
    markComplete,
    skipAll,
    isLoading: tutorialLoading,
    isTutorialActive: showTutorial,
  };
}

export function isTutorialCompleted(profile: any, page: string): boolean {
  const completed: string[] = profile?.completedTutorials || [];
  return completed.includes(page);
}
