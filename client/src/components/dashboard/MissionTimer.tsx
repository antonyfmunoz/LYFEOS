import { useState, useEffect, useCallback } from "react";
import { Pause, Play, Square, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MissionTimerProps {
  timerStartedAt: number | null;
  timerPausedElapsed: number;
  timerIsPaused: boolean;
  onEnd: (elapsedSeconds: number) => void;
  onPauseResume: () => void;
  onRestart: () => void;
  missionTitle?: string;
}

export default function MissionTimer({ timerStartedAt, timerPausedElapsed, timerIsPaused, onEnd, onPauseResume, onRestart, missionTitle }: MissionTimerProps) {
  const [displaySeconds, setDisplaySeconds] = useState(0);

  const getElapsed = useCallback(() => {
    if (timerIsPaused || !timerStartedAt) {
      return timerPausedElapsed;
    }
    return timerPausedElapsed + Math.floor((Date.now() - timerStartedAt) / 1000);
  }, [timerStartedAt, timerPausedElapsed, timerIsPaused]);

  useEffect(() => {
    setDisplaySeconds(getElapsed());
    if (timerIsPaused) return;

    const interval = setInterval(() => {
      setDisplaySeconds(getElapsed());
    }, 1000);
    return () => clearInterval(interval);
  }, [getElapsed, timerIsPaused]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        setDisplaySeconds(getElapsed());
      }
    };
    const handleBeforeUnload = () => {
      const elapsed = getElapsed();
      onEnd(elapsed);
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [getElapsed, onEnd]);

  const handleEnd = () => {
    onEnd(getElapsed());
  };

  const formatTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  return (
    <div className="glassmorphic rounded-xl p-3 border border-primary/40 shadow-[0_0_20px_rgba(0,224,255,0.2)]">
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5 min-w-0 mr-3">
          {missionTitle && (
            <span className="text-xs text-muted-foreground truncate">{missionTitle}</span>
          )}
          <span className={`font-mono text-2xl font-bold tracking-wider ${timerIsPaused ? "text-muted-foreground" : "text-primary"}`}>
            {formatTime(displaySeconds)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 border-primary/50 text-primary hover:bg-primary/10"
            onClick={onRestart}
            title="Restart"
          >
            <RotateCcw className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 border-primary/50 text-primary hover:bg-primary/10"
            onClick={onPauseResume}
          >
            {timerIsPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 border-destructive/50 text-destructive hover:bg-destructive/10"
            onClick={handleEnd}
          >
            <Square className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
