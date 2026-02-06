import { useState, useEffect, useRef, useCallback } from "react";
import { Pause, Play, Square, Timer } from "lucide-react";
import { Button } from "@/components/ui/button";

interface MissionTimerProps {
  missionTitle: string;
  onEnd: (elapsedSeconds: number) => void;
}

export default function MissionTimer({ missionTitle, onEnd }: MissionTimerProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startInterval = useCallback(() => {
    if (intervalRef.current) return;
    intervalRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
  }, []);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    startInterval();
    return () => stopInterval();
  }, [startInterval, stopInterval]);

  const handlePauseResume = () => {
    if (isPaused) {
      startInterval();
      setIsPaused(false);
    } else {
      stopInterval();
      setIsPaused(true);
    }
  };

  const handleEnd = () => {
    stopInterval();
    onEnd(elapsedSeconds);
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
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
      <div className="glassmorphic rounded-xl p-4 border border-primary/40 shadow-[0_0_20px_rgba(0,224,255,0.2)]">
        <div className="flex items-center gap-2 mb-3">
          <Timer className="h-4 w-4 text-primary animate-pulse" />
          <span className="text-xs text-muted-foreground truncate flex-1">{missionTitle}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className={`font-mono text-2xl font-bold tracking-wider ${isPaused ? "text-muted-foreground" : "text-primary"}`}>
            {formatTime(elapsedSeconds)}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 border-primary/50 text-primary hover:bg-primary/10"
              onClick={handlePauseResume}
            >
              {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
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
    </div>
  );
}
