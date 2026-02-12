import { useState, useRef } from "react";
import { useDrag, useDrop } from "react-dnd";
import { Quest } from "../../lib/types";
import { Trash2, Calendar, Clock, Bell, Edit3, Info, Timer, Undo2, GripVertical, Repeat, Coffee, Target } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/authContext";
import { Button } from "@/components/ui/button";

export const QUEST_DND_TYPE = 'QUEST_ITEM';

export interface DragItem {
  index: number;
  id: number | string;
  type: string;
  section: string;
  quest: Quest;
}

interface QuestItemProps {
  quest: Quest;
  index: number;
  section: string;
  onToggle: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onStart?: () => void;
  onResume?: () => void;
  onDone?: () => void;
  onUndo?: () => void;
  onRestart?: (questId: string) => void;
  onMoveQuest?: (dragIndex: number, hoverIndex: number) => void;
  elapsedSeconds?: number;
  breakSeconds?: number;
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

interface UserCategoryOption {
  id: number;
  value: string;
  label: string;
  description: string | null;
}

const ONBOARDING_DESCRIPTIONS: Record<string, string> = {
  "Access & Quickstart": "Log in, explore the dashboard, and complete your first quick mission to get familiar with LYFEOS.",
  "Archetype Calibration": "Discover your player archetype through a guided assessment to personalize your LYFEOS experience.",
  "Identity & Direction": "Define your core identity pillars and set your life direction compass.",
  "Craft & Mastery": "Identify your key skills and craft areas to track mastery progression.",
  "Capacity & Constraints": "Set your daily energy, attention, and time capacity limits for balanced resource management.",
  "Baselines & States": "Establish your baseline stats and current life state for accurate tracking.",
  "History & Roots": "Record your background and personal history to inform your growth trajectory.",
  "Systems & Rituals": "Set up your daily rituals and recurring systems for consistent progress.",
};

export default function QuestItem({ quest, index, section, onToggle, onDelete, onEdit, onStart, onResume, onDone, onUndo, onRestart, onMoveQuest, elapsedSeconds, breakSeconds, isTimerActive, timerBlocked }: QuestItemProps) {
  const [showDescription, setShowDescription] = useState(false);
  const { user } = useAuth();
  const { title, description, completed, energyCost, attentionCost, timeCost, experienceReward, startDate, startTime, endDate, endTime, notificationEnabled, difficulty, category, visionGoalId } = quest;

  const { data: allVisionGoals = [] } = useQuery<{ id: number; category: string; title: string }[]>({
    queryKey: ['/api/vision-goals/all'],
    enabled: !!user && !!visionGoalId,
  });

  const { data: userCategories = [] } = useQuery<UserCategoryOption[]>({
    queryKey: ['/api/user-categories'],
    enabled: !!user,
  });

  const linkedMilestone = visionGoalId ? allVisionGoals.find(g => g.id === visionGoalId) : null;
  const categoryLabels: Record<string, string> = { legacy: "Legacy", "10year": "10-Year", "5year": "5-Year", "18month": "18-Month", "90day": "90-Day" };

  const difficultyStyle = "bg-primary/20 border-primary/50 text-primary";
  const difficultyMultipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
  const xpMultiplier = difficultyMultipliers[difficulty || 'D'] || 1;
  const adjustedXp = Math.floor(experienceReward * xpMultiplier);

  const ref = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLDivElement>(null);

  const [{ handlerId }, drop] = useDrop({
    accept: QUEST_DND_TYPE,
    collect(monitor: any) {
      return { handlerId: monitor.getHandlerId() };
    },
    hover(item: DragItem, monitor: any) {
      if (!ref.current) return;
      if (item.section !== section) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;
      onMoveQuest?.(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  const [{ isDragging }, drag, preview] = useDrag({
    type: QUEST_DND_TYPE,
    item: () => ({ id: quest.id, index, section, type: QUEST_DND_TYPE, quest }),
    collect: (monitor: any) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  preview(drop(ref));
  drag(dragHandleRef);

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
    <div 
      ref={ref}
      data-handler-id={handlerId}
      className={`glassmorphic rounded-xl p-4 mb-3 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition neon-border ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start">
        {category !== "onboarding" ? (
          <div ref={dragHandleRef} className="mt-1 cursor-move flex-shrink-0">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
        ) : (
          <div className="w-4 flex-shrink-0" />
        )}
        <div className="ml-2 flex-grow">
          <div className="flex justify-between items-start">
            <h3 className={`font-medium ${completed ? "text-muted-foreground line-through" : ""}`}>
              {title.replace(/^Onboarding:\s*/, '')}
              {quest.isRitualized && (
                <Repeat className="inline-block ml-1.5 h-3 w-3 text-primary opacity-70" />
              )}
              {notificationEnabled && (
                <Bell className="inline-block ml-1.5 h-3 w-3 text-primary opacity-70" />
              )}
            </h3>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <button
                className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDescription(!showDescription);
                }}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              {onEdit && category !== "onboarding" && (
                <button
                  className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit();
                  }}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
              )}
              {onDelete && category !== "onboarding" && (
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
          {category !== "event" && (
            <div className={`flex items-center gap-3 mt-1 flex-wrap ${completed ? "opacity-50" : ""}`}>
              <span className="text-primary text-xs font-mono whitespace-nowrap">-{Math.max(attentionCost ? 1 : 0, Math.round(((attentionCost ?? 0) / 1440) * 100))}% AT</span>
              <span className="text-primary text-xs font-mono whitespace-nowrap">-{Math.max(timeCost ? 1 : 0, Math.round(((timeCost ?? 0) / 1440) * 100))}% TT</span>
              <span className="text-primary text-xs font-mono whitespace-nowrap">-{Math.max(energyCost ? 1 : 0, Math.round(((energyCost ?? 0) / 1440) * 100))}% EP</span>
              <span className="text-primary text-xs font-mono whitespace-nowrap">+{adjustedXp} XP</span>
            </div>
          )}
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
            <div className="flex items-center gap-3 mt-1.5">
              <div className="flex items-center gap-1.5">
                <Timer className={`h-3 w-3 ${completed ? "text-muted-foreground" : "text-primary"}`} />
                <span className={`text-xs font-mono ${completed ? "text-muted-foreground" : "text-primary"}`}>{formatElapsed(elapsedSeconds)}</span>
              </div>
              {breakSeconds !== undefined && breakSeconds > 0 && (
                <div className="flex items-center gap-1.5">
                  <Coffee className={`h-3 w-3 ${completed ? "text-muted-foreground" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-mono ${completed ? "text-muted-foreground" : "text-muted-foreground"}`}>{formatElapsed(breakSeconds)}</span>
                </div>
              )}
            </div>
          )}
          {showDescription && (
            <div className={`text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 space-y-2 ${completed ? "opacity-50" : ""}`}>
              {(() => {
                const onboardingDesc = category === "onboarding" && title
                  ? ONBOARDING_DESCRIPTIONS[title.replace(/^Onboarding:\s*/, '')] 
                  : null;
                const displayDesc = onboardingDesc || description;
                return displayDesc ? (
                  <p className="text-muted-foreground">{displayDesc}</p>
                ) : null;
              })()}
              <div className="border-t border-primary/10 pt-2 space-y-1">
                {linkedMilestone && (
                  <div className="flex items-center gap-1.5 mb-1">
                    <Target className="h-3 w-3 text-primary flex-shrink-0" />
                    <span className="text-xs text-primary font-mono">
                      [{categoryLabels[linkedMilestone.category] || linkedMilestone.category}]
                    </span>
                    <span className="text-xs text-muted-foreground">{linkedMilestone.title}</span>
                  </div>
                )}
                {category && category !== "general" && category !== "onboarding" && (
                  <p className="text-muted-foreground text-xs">
                    <span className="text-primary font-mono capitalize">{category}</span> — {
                      ({
                        work: 'Professional tasks, projects, and job-related responsibilities.',
                        health: 'Medical care, wellness checkups, and overall well-being.',
                        fitness: 'Exercise, workouts, physical training, and movement goals.',
                        finance: 'Budgeting, saving, investing, and money management.',
                        learning: 'Education, studying, courses, and skill development.',
                        creative: 'Art, music, writing, design, and creative expression.',
                        social: 'Relationships, events, gatherings, and interpersonal connections.',
                        personal: 'Self-care, errands, and individual life management.',
                        mindset: 'Mental health, meditation, mindfulness, and inner growth.',
                        career: 'Long-term professional growth, networking, and advancement.',
                        nutrition: 'Meal planning, diet, cooking, and food choices.',
                        recovery: 'Rest, rehabilitation, stress relief, and recharging.',
                        planning: 'Strategy, organization, scheduling, and goal-setting.',
                        spiritual: 'Faith, purpose, reflection, and spiritual practices.',
                        household: 'Home maintenance, cleaning, chores, and living space.',
                        event: 'Scheduled occasions, celebrations, and milestone events.',
                      } as Record<string, string>)[category] || userCategories.find(uc => uc.value === category)?.description || 'Auto-classified mission category.'
                    }
                  </p>
                )}
                <p className="text-muted-foreground text-xs">
                  <span className="text-primary font-mono">Rank {difficulty || 'D'}</span> — {
                    (difficulty || 'D') === 'S' ? 'Extreme effort. Multi-day or life-changing.' :
                    (difficulty || 'D') === 'A' ? 'High effort. Significant commitment.' :
                    (difficulty || 'D') === 'B' ? 'Moderate effort. Requires focus and planning.' :
                    (difficulty || 'D') === 'C' ? 'Light effort. Simple but requires attention.' :
                    'Minimal effort. Quick and easy.'
                  }
                </p>
              </div>
            </div>
          )}
          {!completed && (
            <div className="flex items-center gap-2 mt-2">
              {!hasBeenStarted && onStart && (
                <button
                  disabled={timerBlocked}
                  className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStart();
                  }}
                >
                  Start
                </button>
              )}
              {hasBeenStarted && !isTimerActive && onResume && (
                <button
                  disabled={timerBlocked}
                  className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40"
                  onClick={(e) => {
                    e.stopPropagation();
                    onResume();
                  }}
                >
                  Resume
                </button>
              )}
              {hasBeenStarted && !isTimerActive && onDone && (
                <button
                  className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDone();
                  }}
                >
                  Done
                </button>
              )}
              {(isTimerActive || (hasBeenStarted && !completed)) && onRestart && (
                <button
                  className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRestart(quest.id);
                  }}
                >
                  Restart
                </button>
              )}
            </div>
          )}
          {completed && onUndo && category !== "onboarding" && (
            <button
              className="mt-2 text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1.5"
              onClick={(e) => {
                e.stopPropagation();
                onUndo();
              }}
            >
              <Undo2 className="h-3 w-3" />
              Undo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
