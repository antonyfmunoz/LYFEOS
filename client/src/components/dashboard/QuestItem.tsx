import { useState } from "react";
import { Quest } from "../../lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, Calendar, Clock, Bell, Edit3, Info, Timer, Undo2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface QuestItemProps {
  quest: Quest;
  onToggle: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onStart?: () => void;
  onResume?: () => void;
  onDone?: () => void;
  onUndo?: () => void;
  onRestart?: (questId: string) => void;
  elapsedSeconds?: number;
  isTimerActive?: boolean;
  timerBlocked?: boolean;
}

function formatElapsed(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function QuestItem({ quest, onToggle, onDelete, onEdit, onStart, onResume, onDone, onUndo, onRestart, elapsedSeconds, isTimerActive, timerBlocked }: QuestItemProps) {
  const [showDescription, setShowDescription] = useState(false);
  const { title, description, completed, energyCost, attentionCost, timeCost, experienceReward, startDate, startTime, endDate, endTime, notificationEnabled, difficulty } = quest;

  const difficultyStyle = "bg-primary/20 border-primary/50 text-primary";
  const difficultyMultipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
  const xpMultiplier = difficultyMultipliers[difficulty || 'D'] || 1;
  const adjustedXp = Math.floor(experienceReward * xpMultiplier);

  const formatDate = (dateStr: string) => {
    const [year, month, day] = dateStr.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  const hasSchedule = startDate || startTime || endDate || endTime;
  const hasBeenStarted = elapsedSeconds !== undefined || isTimerActive;

  return (
    <div className="glassmorphic rounded-xl p-4 mb-3 hover:shadow-[0_0_5px_rgba(0,224,255,0.3)] transition neon-border">
      <div className="flex items-start">
        <Checkbox 
          className="mt-1 rounded border border-primary/50 data-[state=checked]:bg-primary/20 data-[state=checked]:text-primary"
          checked={completed}
          onCheckedChange={onToggle}
        />
        <div className="ml-3 flex-grow">
          <div className="flex justify-between items-start">
            <h3 className={`font-medium ${completed ? "text-muted-foreground line-through" : ""}`}>
              {title.replace(/^Onboarding:\s*/, '')}
              {notificationEnabled && (
                <Bell className="inline-block ml-2 h-3 w-3 text-primary opacity-70" />
              )}
            </h3>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              {difficulty && (
                <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded border ${difficultyStyle} ${completed ? "opacity-50" : ""}`}>
                  {difficulty}
                </span>
              )}
              {description && (
                <Button
                  variant="ghost"
                  size="icon"
                  className={`h-6 w-6 ${showDescription ? "text-primary" : "text-muted-foreground"} hover:text-primary`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDescription(!showDescription);
                  }}
                >
                  <Info className="h-3.5 w-3.5" />
                </Button>
              )}
              {onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
              )}
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className={`flex items-center gap-3 mt-1 flex-wrap ${completed ? "opacity-50" : ""}`}>
            <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((energyCost ?? 0) / 1440) * 100).toFixed(1)}% ET</span>
            <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((attentionCost ?? 0) / 1440) * 100).toFixed(1)}% AT</span>
            <span className="text-primary text-xs font-mono whitespace-nowrap">-{(((timeCost ?? 0) / 1440) * 100).toFixed(1)}% TT</span>
            <span className="text-primary text-xs font-mono whitespace-nowrap">+{adjustedXp} XP</span>
          </div>
          {hasSchedule && (
            <div className={`flex items-center gap-1 text-xs mt-1 flex-wrap ${completed ? "opacity-50" : "text-muted-foreground"}`}>
              {startDate && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Calendar className="h-3 w-3 flex-shrink-0" />
                  {formatDate(startDate)}
                </span>
              )}
              {startTime && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  {formatTime(startTime)}
                </span>
              )}
              {(endDate || endTime) && (
                <span className="text-primary flex-shrink-0">→</span>
              )}
              {endDate && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Calendar className="h-3 w-3 flex-shrink-0" />
                  {formatDate(endDate)}
                </span>
              )}
              {endTime && (
                <span className="flex items-center gap-1 whitespace-nowrap">
                  <Clock className="h-3 w-3 flex-shrink-0" />
                  {formatTime(endTime)}
                </span>
              )}
            </div>
          )}
          {elapsedSeconds !== undefined && elapsedSeconds > 0 && !isTimerActive && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Timer className={`h-3 w-3 ${completed ? "text-muted-foreground" : "text-primary"}`} />
              <span className={`text-xs font-mono ${completed ? "text-muted-foreground" : "text-primary"}`}>{formatElapsed(elapsedSeconds)}</span>
            </div>
          )}
          {showDescription && description && (
            <p className={`text-muted-foreground text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 ${completed ? "opacity-50" : ""}`}>
              {description.replace(/^Completed onboarding mission "(.+)"$/, 'Completed the "$1" mission')}
            </p>
          )}
          {!completed && (
            <div className="flex items-center gap-2 mt-2">
              {!hasBeenStarted && onStart && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={timerBlocked}
                  className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStart();
                  }}
                >
                  Start
                </Button>
              )}
              {hasBeenStarted && !isTimerActive && onResume && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={timerBlocked}
                  className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary disabled:opacity-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResume();
                  }}
                >
                  Resume
                </Button>
              )}
              {hasBeenStarted && !isTimerActive && onDone && (
                <Button
                  variant="outline"
                  size="sm"
                  className="border-primary/50 text-primary hover:bg-primary/10 hover:text-primary"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDone();
                  }}
                >
                  Done
                </Button>
              )}
              {(isTimerActive || (hasBeenStarted && !completed)) && onRestart && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-primary/50 text-primary hover:bg-primary/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestart(quest.id);
                  }}
                  title="Cancel timer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          )}
          {completed && onUndo && (
            <Button
              variant="outline"
              size="sm"
              className="mt-2 border-primary/50 text-primary hover:bg-primary/10 hover:text-primary gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                onUndo();
              }}
            >
              <Undo2 className="h-3.5 w-3.5" />
              Undo
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
