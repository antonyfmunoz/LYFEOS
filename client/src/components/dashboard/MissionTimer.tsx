import { useState, useEffect, useCallback } from "react";
import { Pause, Play, Square, GripHorizontal } from "lucide-react";
import { useDraggable } from "@/hooks/use-draggable";

interface MissionTimerProps {
  timerStartedAt: number | null;
  timerPausedElapsed: number;
  timerIsPaused: boolean;
  onEnd: (elapsedSeconds: number) => void;
  onPauseResume: () => void;
  missionTitle?: string;
}

export default function MissionTimer({ timerStartedAt, timerPausedElapsed, timerIsPaused, onEnd, onPauseResume }: MissionTimerProps) {
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const { elementRef, dragStyle, dragHandleProps } = useDraggable();

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
    <div
      ref={elementRef}
      className="bg-card rounded-xl px-4 py-2 border border-primary/40 shadow-[0_0_20px_rgba(0,224,255,0.2)]"
      style={dragStyle}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 mr-2">
          <div {...dragHandleProps} className="shrink-0 flex items-center">
            <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/50" />
          </div>
          <span className={`font-mono text-sm font-bold tracking-wider ${timerIsPaused ? "text-muted-foreground" : "text-primary"}`}>
            {formatTime(displaySeconds)}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            className="h-6 w-6 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center justify-center"
            onClick={onPauseResume}
          >
            {timerIsPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>
          <button
            className="h-6 w-6 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center justify-center"
            onClick={handleEnd}
          >
            <Square className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
