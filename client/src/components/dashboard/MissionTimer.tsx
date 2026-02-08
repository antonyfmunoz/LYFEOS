import { useState, useEffect, useCallback } from "react";
import { Pause, Play, Square, ChevronUp, ChevronDown, GripHorizontal, Swords, Zap, Brain, Clock } from "lucide-react";
import { useDraggable } from "@/hooks/use-draggable";

interface MissionTimerProps {
  timerStartedAt: number | null;
  timerPausedElapsed: number;
  timerIsPaused: boolean;
  onEnd: (elapsedSeconds: number) => void;
  onPauseResume: () => void;
  missionTitle?: string;
  missionDescription?: string;
  missionCategory?: string;
  missionXP?: number;
  missionEnergyCost?: number;
  missionAttentionCost?: number;
  missionTimeCost?: number;
  missionDifficulty?: string;
}

export default function MissionTimer({
  timerStartedAt,
  timerPausedElapsed,
  timerIsPaused,
  onEnd,
  onPauseResume,
  missionTitle,
  missionDescription,
  missionCategory,
  missionXP,
  missionEnergyCost,
  missionAttentionCost,
  missionTimeCost,
  missionDifficulty,
}: MissionTimerProps) {
  const [displaySeconds, setDisplaySeconds] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(false);
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

  const timerDisplay = (
    <span className={`font-mono text-sm font-bold tracking-wider ${timerIsPaused ? "text-muted-foreground" : "text-primary"}`}>
      {formatTime(displaySeconds)}
    </span>
  );

  const actionButtons = (
    <>
      <button
        className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        onClick={onPauseResume}
        title={timerIsPaused ? "Resume" : "Pause"}
      >
        {timerIsPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>
      <button
        className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
        onClick={handleEnd}
        title="Stop timer"
      >
        <Square className="h-3 w-3" />
      </button>
    </>
  );

  if (isCollapsed) {
    return (
      <div
        ref={elementRef}
        className="bg-card rounded-xl px-4 py-2 neon-border max-w-sm w-full shadow-[0_0_20px_rgba(0,224,255,0.2)]"
        style={dragStyle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0 mr-2" {...dragHandleProps}>
            <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
            <Swords className="h-3.5 w-3.5 text-primary shrink-0" />
            {timerDisplay}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {actionButtons}
            <button
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              onClick={() => setIsCollapsed(false)}
              title="Expand"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={elementRef}
      className="bg-card rounded-xl p-4 neon-border max-w-sm w-full shadow-[0_0_20px_rgba(0,224,255,0.2)]"
      style={dragStyle}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2" {...dragHandleProps}>
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/50" />
          <Swords className="h-3.5 w-3.5 text-primary" />
          {timerDisplay}
        </div>
        <div className="flex items-center gap-1">
          {actionButtons}
          <button
            className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            onClick={() => setIsCollapsed(true)}
            title="Collapse"
          >
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-xs font-bold text-foreground truncate">{missionTitle || "Untitled Mission"}</span>
        {missionCategory && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0 capitalize">
            {missionCategory}
          </span>
        )}
        {missionDifficulty && (
          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20 shrink-0 capitalize">
            {missionDifficulty}
          </span>
        )}
      </div>

      {missionDescription && (
        <p className="text-xs text-muted-foreground line-clamp-1 mb-1">{missionDescription}</p>
      )}

      <div className="mt-2 border-t border-primary/10 pt-2">
        <div className="flex items-center gap-3 text-[10px] font-mono text-primary">
          {missionXP != null && missionXP > 0 && (
            <span className="text-primary">+{missionXP} XP</span>
          )}
          {missionEnergyCost != null && missionEnergyCost > 0 && (
            <span className="flex items-center gap-0.5">
              <Zap className="h-2.5 w-2.5" /> -{((missionEnergyCost / 1440) * 100).toFixed(1)}% ET
            </span>
          )}
          {missionAttentionCost != null && missionAttentionCost > 0 && (
            <span className="flex items-center gap-0.5">
              <Brain className="h-2.5 w-2.5" /> -{((missionAttentionCost / 1440) * 100).toFixed(1)}% AT
            </span>
          )}
          {missionTimeCost != null && missionTimeCost > 0 && (
            <span className="flex items-center gap-0.5">
              <Clock className="h-2.5 w-2.5" /> -{((missionTimeCost / 1440) * 100).toFixed(1)}% TT
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
