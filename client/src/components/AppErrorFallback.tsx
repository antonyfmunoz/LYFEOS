import { useEffect, useState } from "react";
import {
  canAttemptChunkRecovery,
  CHUNK_RECOVERY_STORAGE_KEY,
  isChunkLoadError,
} from "@/lib/runtimeRecovery";

interface AppErrorFallbackProps {
  error: unknown;
  eventId?: string;
}

export function AppErrorFallback({ error, eventId }: AppErrorFallbackProps) {
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    if (!isChunkLoadError(error)) return;

    const previousAttempt = sessionStorage.getItem(CHUNK_RECOVERY_STORAGE_KEY);
    if (!canAttemptChunkRecovery(previousAttempt)) return;

    sessionStorage.setItem(CHUNK_RECOVERY_STORAGE_KEY, String(Date.now()));
    setIsRecovering(true);
    window.location.reload();
  }, [error]);

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <section className="w-full max-w-md rounded-xl border border-border bg-card p-6 text-center shadow-lg" role="alert">
        <h1 className="text-xl font-semibold">
          {isRecovering ? "Updating LyfeOS…" : "LyfeOS needs to reload"}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {isRecovering
            ? "A new version was deployed while this page was open. Your saved onboarding progress is safe."
            : "Your saved progress is safe. Reload the latest version to continue."}
        </p>
        <button
          type="button"
          className="mt-5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => window.location.reload()}
        >
          Reload LyfeOS
        </button>
        {eventId ? <p className="mt-4 text-xs text-muted-foreground">Error reference: {eventId}</p> : null}
      </section>
    </main>
  );
}
