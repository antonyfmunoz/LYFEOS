import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { useWidgetState } from "@/hooks/use-widget-state";
import { ArrowLeft, Eye, Compass, Flame, Target, Milestone, Plus, Check, Trash2, Edit2, Loader2, ChevronDown, ChevronRight, Info, Zap, GripVertical, Gift, Star, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import update from 'immutability-helper';
import { useDrag, useDrop } from 'react-dnd';
import { CollapsibleWidget } from '@/components/ui/collapsible-widget';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cn } from "@/lib/utils";
import { objectiveToast } from "@/lib/gamified-toast";
import { useToast } from "@/hooks/use-toast";

interface VisionGoal {
  id: number;
  userId: number;
  category: string;
  title: string;
  description: string | null;
  rewardText: string | null;
  bonusXp: number;
  completed: boolean;
  completedAt: string | null;
  displayOrder: number;
  createdAt: string;
}

interface VisionWidget {
  id: string;
  title: string;
  icon: React.ReactNode;
  stateKey: string;
  placeholder: string;
}

interface LinkedMission {
  id: number;
  title: string;
  completed: boolean;
  completedAt: string | null;
  visionGoalId: number | null;
  difficulty: string;
  experienceReward: number;
  energyCost: number;
  category: string;
}

interface GoalFormData {
  title: string;
  description: string;
  category: string;
  rewardText: string;
}

const defaultFormData: GoalFormData = {
  title: "",
  description: "",
  category: "90day",
  rewardText: "",
};

const CATEGORY_OPTIONS = [
  { value: "legacy", label: "Legacy Vision" },
  { value: "10year", label: "10-Year Vision" },
  { value: "5year", label: "5-Year Vision" },
  { value: "18month", label: "18-Month Vision" },
  { value: "90day", label: "90-Day Vision" },
];


const difficultyOrder: Record<string, number> = { 'D': 1, 'C': 2, 'B': 3, 'A': 4, 'S': 5 };
const reverseOrder: Record<number, string> = { 1: 'D', 2: 'C', 3: 'B', 4: 'A', 5: 'S' };

const MILESTONE_ITEM = "MILESTONE_ITEM";

interface DraggableObjectiveProps {
  goal: VisionGoal;
  index: number;
  moveGoal: (dragIndex: number, hoverIndex: number) => void;
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (goal: VisionGoal) => void;
  onDelete: (id: number) => void;
  isMutating: boolean;
  infoExpandedId: number | null;
  setInfoExpandedId: (id: number | null) => void;
  renderInfoPanel: (goal: VisionGoal) => React.ReactNode;
  renderGoalMissions: (goalId: number) => React.ReactNode;
  category: string;
}

function DraggableObjective({
  goal, index, moveGoal, onToggle, onEdit, onDelete, isMutating,
  infoExpandedId, setInfoExpandedId, renderInfoPanel, renderGoalMissions, category,
}: DraggableObjectiveProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: MILESTONE_ITEM,
    item: () => ({ index, goalId: goal.id, sourceCategory: category }),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: MILESTONE_ITEM,
    hover(item: { index: number; goalId: number; sourceCategory: string }, monitor) {
      if (!ref.current) return;
      if (item.sourceCategory !== category) return;
      const dragIndex = item.index;
      const hoverIndex = index;
      if (dragIndex === hoverIndex) return;
      const hoverBoundingRect = ref.current.getBoundingClientRect();
      const hoverMiddleY = (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2;
      const clientOffset = monitor.getClientOffset();
      if (!clientOffset) return;
      const hoverClientY = clientOffset.y - hoverBoundingRect.top;
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) return;
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) return;
      moveGoal(dragIndex, hoverIndex);
      item.index = hoverIndex;
    },
  });

  preview(drop(ref));

  return (
    <div
      ref={ref}
      className={`glassmorphic rounded-xl p-4 mb-3 hover:shadow-[0_0_5px_var(--primary-glow-light)] transition neon-border ${isDragging ? "opacity-50" : ""}`}
    >
      <div className="flex items-start">
        <div ref={(node) => { drag(node); }} className="mt-1 cursor-move flex-shrink-0">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="ml-2 flex-grow">
          <div className="flex justify-between items-start">
            <h3 className="font-medium">{goal.title}</h3>
            <div className="flex items-center gap-1 flex-shrink-0 ml-2">
              <button
                className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                onClick={(e) => { e.stopPropagation(); setInfoExpandedId(infoExpandedId === goal.id ? null : goal.id); }}
              >
                <Info className="h-3.5 w-3.5" />
              </button>
              <button
                className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                onClick={(e) => { e.stopPropagation(); onEdit(goal); }}
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>
              <button
                className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-destructive/30 hover:text-destructive hover:border-destructive/50 transition-colors"
                onClick={(e) => { e.stopPropagation(); onDelete(goal.id); }}
                disabled={isMutating}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            {goal.rewardText && (
              <span className="flex items-center gap-1 text-primary text-xs font-mono whitespace-nowrap">
                <Gift className="h-3 w-3" />
                {goal.rewardText}
              </span>
            )}
            {goal.bonusXp > 0 && (
              <span className="text-primary text-xs font-mono whitespace-nowrap">+{goal.bonusXp} XP</span>
            )}
          </div>
          {renderInfoPanel(goal)}
          {renderGoalMissions(goal.id)}
          <div className="flex items-center gap-2 mt-2">
            <button
              className="text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40"
              disabled={isMutating}
              onClick={(e) => { e.stopPropagation(); onToggle(goal.id, true); }}
            >
              Complete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ObjectiveListProps {
  category: string;
  placeholder: string;
  goals: VisionGoal[];
  linkedMissions: LinkedMission[];
  isLoading: boolean;
  onCreateGoal: (category: string) => void;
  onEditGoal: (goal: VisionGoal) => void;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  onReorder: (category: string, ids: number[]) => void;
  onMoveToCategory: (goalId: number, newCategory: string) => void;
  setGoals: React.Dispatch<React.SetStateAction<VisionGoal[]>>;
}

function ObjectiveList({ category, placeholder, goals, linkedMissions, isLoading, onCreateGoal, onEditGoal, onToggle, onDelete, onReorder, onMoveToCategory, setGoals }: ObjectiveListProps) {
  const { toast } = useToast();
  const [expandedGoalId, setExpandedGoalId] = useState<number | null>(null);
  const [infoExpandedId, setInfoExpandedId] = useState<number | null>(null);
  const [isMutating, setIsMutating] = useState(false);

  const categoryGoals = goals.filter(g => g.category === category);

  const getMissionsForGoal = (goalId: number) => {
    return linkedMissions.filter(m => m.visionGoalId === goalId);
  };

  const renderInfoPanel = (goal: VisionGoal) => {
    if (infoExpandedId !== goal.id) return null;
    const allMissions = getMissionsForGoal(goal.id);
    const completedMissions = allMissions.filter(m => m.completed);
    const activeMissions = allMissions.filter(m => !m.completed);

    let avgDifficulty: string | null = null;
    if (allMissions.length > 0) {
      const sum = allMissions.reduce((acc, m) => acc + (difficultyOrder[m.difficulty] || 0), 0);
      const avg = Math.round(sum / allMissions.length);
      avgDifficulty = reverseOrder[avg] || null;
    }

    const uniqueCategories = Array.from(new Set(allMissions.map(m => m.category))).filter(c => c !== 'general');

    const totalXP = completedMissions.reduce((acc, m) => acc + (m.experienceReward || 0), 0);
    const totalEnergy = completedMissions.reduce((acc, m) => acc + (m.energyCost || 0), 0);

    return (
      <div className="mt-2 bg-primary/5 border border-primary/10 rounded-lg p-3 space-y-2 text-xs">
        <div className="flex items-start gap-2">
          <span className="text-muted-foreground shrink-0">Desc:</span>
          <span className={goal.description ? "text-foreground/80" : "italic text-muted-foreground"}>
            {goal.description || "No description"}
          </span>
        </div>

        <div className="flex items-start gap-2">
          <span className="text-muted-foreground shrink-0 flex items-center gap-1"><Gift className="h-3 w-3" /> Reward:</span>
          <span className={goal.rewardText ? "text-foreground/80" : "italic text-muted-foreground"}>
            {goal.rewardText || "No reward set"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground shrink-0">Created:</span>
          <span className="text-foreground/80">{new Date(goal.createdAt).toLocaleDateString()}</span>
        </div>

        {goal.completedAt && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0">Completed:</span>
            <span className="text-green-400/80">{new Date(goal.completedAt).toLocaleDateString()}</span>
          </div>
        )}

        {goal.bonusXp > 0 && (
          <div className="flex items-center gap-2">
            <Star className="h-3 w-3 text-foreground" />
            <span className="text-foreground font-medium">+{goal.bonusXp} Bonus XP on completion</span>
          </div>
        )}

        {avgDifficulty && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground shrink-0">Avg Difficulty:</span>
            <span className="text-primary/80 font-medium">Rank {avgDifficulty}</span>
          </div>
        )}

        {uniqueCategories.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {uniqueCategories.map(cat => (
              <span key={cat} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary/80 text-[10px] font-medium">
                {cat}
              </span>
            ))}
          </div>
        )}

        {allMissions.length > 0 && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Zap className="h-3 w-3 text-primary/60" />
            <span>+{totalXP} XP · -{totalEnergy} EP · {completedMissions.length}/{allMissions.length} mission{allMissions.length !== 1 ? 's' : ''} done</span>
          </div>
        )}

        {activeMissions.length > 0 && (
          <div className="border-t border-primary/10 pt-2 mt-1">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Active Missions</span>
            <div className="mt-1 space-y-0.5">
              {activeMissions.map(m => (
                <div key={m.id} className="flex items-center gap-1.5 py-0.5">
                  <Target className="h-3 w-3 text-primary shrink-0" />
                  <span className="text-xs text-primary font-mono capitalize">{m.category}</span>
                  <span className="text-xs text-muted-foreground">—</span>
                  <span className="text-xs text-foreground/70 truncate">{m.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {completedMissions.length > 0 && (
          <div className="border-t border-primary/10 pt-2 mt-1">
            <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Completed Missions</span>
            <div className="mt-1 space-y-0.5">
              {completedMissions.map(m => (
                <div key={m.id} className="flex items-center gap-1.5 py-0.5">
                  <Check className="h-3 w-3 text-green-400 shrink-0" />
                  <span className="text-xs text-primary font-mono capitalize">{m.category}</span>
                  <span className="text-xs text-muted-foreground">—</span>
                  <span className="text-xs text-muted-foreground truncate">{m.title}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const activeGoals = [...categoryGoals.filter(g => !g.completed)].sort((a, b) => a.displayOrder - b.displayOrder);
  const completedGoals = categoryGoals.filter(g => g.completed);
  const activeGoalsRef = useRef<VisionGoal[]>([]);
  activeGoalsRef.current = activeGoals;

  const moveGoal = useCallback((dragIndex: number, hoverIndex: number) => {
    const currentActive = activeGoalsRef.current;
    const newGoals = update(currentActive, {
      $splice: [
        [dragIndex, 1],
        [hoverIndex, 0, currentActive[dragIndex]],
      ],
    });
    const reordered = newGoals.map((g, i) => ({ ...g, displayOrder: i }));
    setGoals(prev => prev.map(g => {
      const match = reordered.find(r => r.id === g.id);
      return match ? { ...g, displayOrder: match.displayOrder } : g;
    }));
    activeGoalsRef.current = reordered;
    onReorder(category, reordered.map(g => g.id));
  }, [category, onReorder, setGoals]);

  const dropRef = useRef<HTMLDivElement>(null);
  const [{ isOver, canDrop }, categoryDrop] = useDrop({
    accept: MILESTONE_ITEM,
    canDrop: (item: { goalId: number; sourceCategory: string }) => item.sourceCategory !== category,
    drop: (item: { goalId: number; sourceCategory: string }) => {
      if (item.sourceCategory !== category) {
        onMoveToCategory(item.goalId, category);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  });
  categoryDrop(dropRef);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const renderGoalMissions = (goalId: number) => {
    const allMissions = getMissionsForGoal(goalId);
    if (allMissions.length === 0) return null;
    const activeMissions = allMissions.filter(m => !m.completed);
    const completedMissions = allMissions.filter(m => m.completed);
    const isExpanded = expandedGoalId === goalId;
    return (
      <div className="mt-2">
        <button
          onClick={(e) => { e.stopPropagation(); setExpandedGoalId(isExpanded ? null : goalId); }}
          className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>{allMissions.length} linked mission{allMissions.length !== 1 ? 's' : ''} ({activeMissions.length} active, {completedMissions.length} done)</span>
        </button>
        {isExpanded && (
          <div className="mt-1 space-y-0.5 pl-4 border-l border-primary/10">
            {activeMissions.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 py-0.5">
                <Target className="h-3 w-3 text-primary shrink-0" />
                <span className="text-xs text-primary font-mono capitalize">{m.category}</span>
                <span className="text-xs text-muted-foreground">—</span>
                <span className="text-xs text-foreground/70 truncate">{m.title}</span>
              </div>
            ))}
            {completedMissions.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 py-0.5">
                <Check className="h-3 w-3 text-green-400 shrink-0" />
                <span className="text-xs text-primary font-mono capitalize">{m.category}</span>
                <span className="text-xs text-muted-foreground">—</span>
                <span className="text-xs text-muted-foreground truncate">{m.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={dropRef} className={`space-y-3 rounded-lg transition-colors ${isOver && canDrop ? 'bg-primary/10 ring-2 ring-primary/40 ring-dashed' : ''}`}>
      {isOver && canDrop && (
        <p className="text-xs text-primary font-mono text-center py-1">Drop here to move goal</p>
      )}
      {categoryGoals.length === 0 && !isOver && (
        <p className="text-sm text-muted-foreground italic py-2">No mission objectives yet. Use "Create Goal" above to add one.</p>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-1">
          {activeGoals.map((goal, index) => (
            <DraggableObjective
              key={goal.id}
              goal={goal}
              index={index}
              moveGoal={moveGoal}
              onToggle={onToggle}
              onEdit={onEditGoal}
              onDelete={onDelete}
              isMutating={isMutating}
              infoExpandedId={infoExpandedId}
              setInfoExpandedId={setInfoExpandedId}
              renderInfoPanel={renderInfoPanel}
              renderGoalMissions={renderGoalMissions}
              category={category}
            />
          ))}
        </div>
      )}

      {completedGoals.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-primary/10">
          <p className="text-xs text-muted-foreground font-medium px-3 pb-1">
            Completed ({completedGoals.length})
          </p>
          {completedGoals.map((goal) => (
            <div
              key={goal.id}
              className="glassmorphic rounded-xl p-4 mb-3 neon-border"
            >
              <div className="flex items-start">
                <div className="w-4 flex-shrink-0" />
                <div className="ml-2 flex-grow">
                  <div className="flex justify-between items-start">
                    <h3 className="font-medium text-muted-foreground line-through">{goal.title}</h3>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <button
                        className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                        onClick={(e) => { e.stopPropagation(); setInfoExpandedId(infoExpandedId === goal.id ? null : goal.id); }}
                      >
                        <Info className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                        onClick={(e) => { e.stopPropagation(); onEditGoal(goal); }}
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                      <button
                        className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-destructive/30 hover:text-destructive hover:border-destructive/50 transition-colors"
                        onClick={(e) => { e.stopPropagation(); onDelete(goal.id); }}
                        disabled={isMutating}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap opacity-50">
                    {goal.rewardText && (
                      <span className="flex items-center gap-1 text-primary text-xs font-mono whitespace-nowrap">
                        <Gift className="h-3 w-3" />
                        {goal.rewardText}
                      </span>
                    )}
                    {goal.bonusXp > 0 && (
                      <span className="text-primary text-xs font-mono whitespace-nowrap">+{goal.bonusXp} XP</span>
                    )}
                  </div>
                  {renderInfoPanel(goal)}
                  {renderGoalMissions(goal.id)}
                  <button
                    className="mt-2 text-xs font-mono px-2 py-1 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center gap-1.5"
                    onClick={(e) => { e.stopPropagation(); onToggle(goal.id, false); }}
                  >
                    <Undo2 className="h-3 w-3" />
                    Undo
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function GoalsArchivePage() {
  usePageTitle('Vision');

  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [goals, setGoals] = useState<VisionGoal[]>([]);
  const [goalsLoaded, setGoalsLoaded] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState<GoalFormData>(defaultFormData);
  const [editFormData, setEditFormData] = useState<GoalFormData>(defaultFormData);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: fetchedGoals, isLoading: goalsQueryLoading } = useQuery<VisionGoal[]>({
    queryKey: ['/api/vision-goals/all'],
    queryFn: async () => {
      const res = await fetch('/api/vision-goals/all', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch goals');
      return res.json();
    },
    enabled: !!user,
  });

  useEffect(() => {
    if (fetchedGoals && !goalsLoaded) {
      setGoals(fetchedGoals);
      setGoalsLoaded(true);
    }
  }, [fetchedGoals, goalsLoaded]);

  const { data: legacyMissions = [] } = useQuery<LinkedMission[]>({
    queryKey: ['/api/quests/linked-by-vision-goal', 'legacy'],
    queryFn: async () => { const res = await fetch('/api/quests/linked-by-vision-goal/legacy', { credentials: 'include' }); if (!res.ok) return []; return res.json(); },
    enabled: !!user,
  });
  const { data: tenYearMissions = [] } = useQuery<LinkedMission[]>({
    queryKey: ['/api/quests/linked-by-vision-goal', '10year'],
    queryFn: async () => { const res = await fetch('/api/quests/linked-by-vision-goal/10year', { credentials: 'include' }); if (!res.ok) return []; return res.json(); },
    enabled: !!user,
  });
  const { data: fiveYearMissions = [] } = useQuery<LinkedMission[]>({
    queryKey: ['/api/quests/linked-by-vision-goal', '5year'],
    queryFn: async () => { const res = await fetch('/api/quests/linked-by-vision-goal/5year', { credentials: 'include' }); if (!res.ok) return []; return res.json(); },
    enabled: !!user,
  });
  const { data: eighteenMonthMissions = [] } = useQuery<LinkedMission[]>({
    queryKey: ['/api/quests/linked-by-vision-goal', '18month'],
    queryFn: async () => { const res = await fetch('/api/quests/linked-by-vision-goal/18month', { credentials: 'include' }); if (!res.ok) return []; return res.json(); },
    enabled: !!user,
  });
  const { data: ninetyDayMissions = [] } = useQuery<LinkedMission[]>({
    queryKey: ['/api/quests/linked-by-vision-goal', '90day'],
    queryFn: async () => { const res = await fetch('/api/quests/linked-by-vision-goal/90day', { credentials: 'include' }); if (!res.ok) return []; return res.json(); },
    enabled: !!user,
  });

  const linkedMissionsMap: Record<string, LinkedMission[]> = {
    legacy: legacyMissions,
    '10year': tenYearMissions,
    '5year': fiveYearMissions,
    '18month': eighteenMonthMissions,
    '90day': ninetyDayMissions,
  };

  const getLinkedMissionsForCategory = (category: string): LinkedMission[] => {
    return linkedMissionsMap[category] || [];
  };

  const handleToggle = useCallback(async (id: number, completed: boolean) => {
    const previousGoals = [...goals];
    setGoals(prev => prev.map(g => g.id === id ? { ...g, completed, completedAt: completed ? new Date().toISOString() : null } : g));

    try {
      const result = await apiRequest<VisionGoal & { xpAwarded?: number }>(`/api/vision-goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      });
      setGoals(prev => prev.map(g => g.id === id ? { ...g, ...result } : g));
      if (completed && result && result.title) {
        objectiveToast(result.title, result.rewardText, result.bonusXp);
      }
    } catch (err) {
      setGoals(previousGoals);
      toast({
        title: "Failed to update goal",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    }
  }, [goals, toast]);

  const handleDelete = useCallback(async (id: number) => {
    const previousGoals = [...goals];
    setGoals(prev => prev.filter(g => g.id !== id));

    try {
      await apiRequest(`/api/vision-goals/${id}`, { method: 'DELETE' });
    } catch (err) {
      setGoals(previousGoals);
      toast({
        title: "Failed to delete goal",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    }
  }, [goals, toast]);

  const handleReorder = useCallback(async (category: string, ids: number[]) => {
    try {
      await apiRequest('/api/vision-goals/reorder', {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      });
    } catch (err) {
      console.error("Failed to save reorder:", err);
    }
  }, []);

  const handleMoveToCategory = useCallback(async (goalId: number, newCategory: string) => {
    const previousGoals = [...goals];
    const previousVisionGoalsAll = queryClient.getQueryData<{ id: number; category: string; title: string }[]>(['/api/vision-goals/all']);
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, category: newCategory, displayOrder: 999 } : g));
    queryClient.setQueryData<{ id: number; category: string; title: string }[]>(
      ['/api/vision-goals/all'],
      (old) => old?.map(g => g.id === goalId ? { ...g, category: newCategory } : g)
    );

    try {
      await apiRequest(`/api/vision-goals/${goalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ category: newCategory }),
      });
    } catch (err) {
      setGoals(previousGoals);
      if (previousVisionGoalsAll) queryClient.setQueryData(['/api/vision-goals/all'], previousVisionGoalsAll);
      toast({
        title: "Failed to move goal",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    }
  }, [goals, toast]);

  const [legacyOpen, setLegacyOpen] = useWidgetState('goals.legacy-vision', false);
  const [tenYearOpen, setTenYearOpen] = useWidgetState('goals.10year-vision', false);
  const [fiveYearOpen, setFiveYearOpen] = useWidgetState('goals.5year-vision', false);
  const [eighteenMonthOpen, setEighteenMonthOpen] = useWidgetState('goals.18month-vision', false);
  const [ninetyDayOpen, setNinetyDayOpen] = useWidgetState('goals.90day-vision', false);

  const openStates: Record<string, { isOpen: boolean; setOpen: (v: boolean) => void }> = {
    'legacy': { isOpen: legacyOpen, setOpen: setLegacyOpen },
    '10year': { isOpen: tenYearOpen, setOpen: setTenYearOpen },
    '5year': { isOpen: fiveYearOpen, setOpen: setFiveYearOpen },
    '18month': { isOpen: eighteenMonthOpen, setOpen: setEighteenMonthOpen },
    '90day': { isOpen: ninetyDayOpen, setOpen: setNinetyDayOpen },
  };

  const [widgets, setWidgets] = useState<VisionWidget[]>([
    {
      id: 'legacy',
      title: 'Legacy Vision',
      icon: <Eye className="h-5 w-5 text-primary" />,
      stateKey: 'goals.legacy-vision',
      placeholder: "e.g., Build a company that impacts 1M lives",
    },
    {
      id: '10year',
      title: '10-Year Vision',
      icon: <Target className="h-5 w-5 text-primary" />,
      stateKey: 'goals.10year-vision',
      placeholder: "e.g., Reach $1M net worth",
    },
    {
      id: '5year',
      title: '5-Year Vision',
      icon: <Compass className="h-5 w-5 text-primary" />,
      stateKey: 'goals.5year-vision',
      placeholder: "e.g., Launch my own product",
    },
    {
      id: '18month',
      title: '18-Month Vision',
      icon: <Milestone className="h-5 w-5 text-primary" />,
      stateKey: 'goals.18month-vision',
      placeholder: "e.g., Earn $10k/month consistently",
    },
    {
      id: '90day',
      title: '90-Day Vision',
      icon: <Flame className="h-5 w-5 text-primary" />,
      stateKey: 'goals.90day-vision',
      placeholder: "e.g., Close 5 new clients",
    },
  ]);

  const { data: widgetLayouts } = useQuery<Record<string, string[]>>({
    queryKey: ['/api/widget-layouts'],
    enabled: !!user,
  });

  useEffect(() => {
    if (!widgetLayouts?.vision) return;
    const savedOrder = widgetLayouts.vision;
    setWidgets(prev => {
      const ordered: VisionWidget[] = [];
      for (const id of savedOrder) {
        const widget = prev.find(w => w.id === id);
        if (widget) ordered.push(widget);
      }
      for (const widget of prev) {
        if (!ordered.find(w => w.id === widget.id)) ordered.push(widget);
      }
      if (ordered.every((w, i) => w.id === prev[i]?.id)) return prev;
      return ordered;
    });
  }, [widgetLayouts]);

  const widgetsRef = useRef(widgets);
  widgetsRef.current = widgets;

  const moveWidget = useCallback((dragIndex: number, hoverIndex: number) => {
    const prev = widgetsRef.current;
    const newWidgets = update(prev, {
      $splice: [
        [dragIndex, 1],
        [hoverIndex, 0, prev[dragIndex]],
      ],
    });
    setWidgets(newWidgets);
    widgetsRef.current = newWidgets;
    const newOrder = newWidgets.map(w => w.id);
    apiRequest('/api/widget-layouts', {
      method: 'PUT',
      body: JSON.stringify({ page: 'vision', order: newOrder }),
    }).catch(() => {});
    queryClient.setQueryData<Record<string, string[]>>(['/api/widget-layouts'], (old) => ({
      ...old,
      vision: newOrder,
    }));
  }, []);

  const handleOpenCreate = (category?: string) => {
    setCreateFormData({ ...defaultFormData, category: category || "90day" });
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (goal: VisionGoal) => {
    setEditFormData({
      title: goal.title,
      description: goal.description || "",
      category: goal.category,
      rewardText: goal.rewardText || "",
    });
    setEditingGoalId(goal.id);
    setIsEditOpen(true);
  };

  const handleCreateGoal = async () => {
    if (!createFormData.title.trim()) return;
    setIsSubmitting(true);
    const tempId = -Date.now();
    const optimisticGoal: VisionGoal = {
      id: tempId,
      userId: user?.id || 0,
      category: createFormData.category,
      title: createFormData.title.trim(),
      description: createFormData.description.trim() || null,
      rewardText: createFormData.rewardText.trim() || null,
      bonusXp: 0,
      completed: false,
      completedAt: null,
      displayOrder: 999,
      createdAt: new Date().toISOString(),
    };
    setIsCreateOpen(false);
    setCreateFormData(defaultFormData);
    setGoals(prev => [...prev, optimisticGoal]);
    try {
      const newGoal = await apiRequest<VisionGoal>('/api/vision-goals', {
        method: 'POST',
        body: JSON.stringify({
          category: optimisticGoal.category,
          title: optimisticGoal.title,
          description: optimisticGoal.description,
          rewardText: optimisticGoal.rewardText,
          bonusXp: 0,
        }),
      });
      setGoals(prev => prev.map(g => g.id === tempId ? newGoal : g));
    } catch (error) {
      setGoals(prev => prev.filter(g => g.id !== tempId));
      console.error("Error creating goal:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditGoal = async () => {
    if (!editFormData.title.trim() || !editingGoalId) return;
    setIsSubmitting(true);
    const editedId = editingGoalId;
    const optimisticUpdates = {
      title: editFormData.title.trim(),
      description: editFormData.description.trim() || null,
      rewardText: editFormData.rewardText.trim() || null,
    };
    const previousGoals = [...goals];
    setIsEditOpen(false);
    setEditFormData(defaultFormData);
    setEditingGoalId(null);
    setGoals(prev => prev.map(g => g.id === editedId ? { ...g, ...optimisticUpdates } : g));
    queryClient.setQueryData<{ id: number; category: string; title: string }[]>(
      ['/api/vision-goals/all'],
      (old) => old?.map(g => g.id === editedId ? { ...g, title: optimisticUpdates.title } : g)
    );
    try {
      const updatedGoal = await apiRequest<VisionGoal>(`/api/vision-goals/${editedId}`, {
        method: 'PATCH',
        body: JSON.stringify(optimisticUpdates),
      });
      setGoals(prev => prev.map(g => g.id === editedId ? { ...g, ...updatedGoal } : g));
    } catch (error) {
      setGoals(previousGoals);
      console.error("Error updating goal:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderGoalForm = (formData: GoalFormData, setFormData: (fn: (prev: GoalFormData) => GoalFormData) => void, onSubmit: () => void, submitLabel: string, showCategorySelect: boolean) => (
    <div className="space-y-4 mt-4">
      <div className="space-y-2">
        <Label htmlFor="goal-title">Title <span className="text-primary">*</span></Label>
        <Input
          id="goal-title"
          placeholder="Enter goal title..."
          value={formData.title}
          onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
          className="bg-background/50 border-primary/30"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="goal-description">Description</Label>
        <Textarea
          id="goal-description"
          placeholder="What does achieving this goal look like?"
          value={formData.description}
          onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
          className="bg-background/50 border-primary/30 min-h-[80px]"
        />
      </div>

      {showCategorySelect && (
        <div className="space-y-2">
          <Label>Time Horizon</Label>
          <Select value={formData.category} onValueChange={(val) => setFormData(prev => ({ ...prev, category: val }))}>
            <SelectTrigger className="bg-background/50 border-primary/30">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORY_OPTIONS.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="goal-reward">Personal Reward</Label>
        <Input
          id="goal-reward"
          placeholder="e.g., Buy new shoes, take a vacation..."
          value={formData.rewardText}
          onChange={(e) => setFormData(prev => ({ ...prev, rewardText: e.target.value }))}
          className="bg-background/50 border-primary/30"
        />
        <p className="text-xs text-muted-foreground">A personal reward you'll give yourself when you complete this goal</p>
      </div>

      <button
        onClick={onSubmit}
        className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center"
        disabled={!formData.title.trim() || isSubmitting}
      >
        {isSubmitting ? "Saving..." : submitLabel}
      </button>
    </div>
  );

  return (
      <div className="pb-20">
        <div className="mb-4 flex items-center justify-between">
          <Button 
            variant="ghost" 
            className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10" 
            onClick={() => navigate('/chronilog')}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>

          <Dialog open={isCreateOpen} onOpenChange={(open) => {
            setIsCreateOpen(open);
            if (!open) setCreateFormData(defaultFormData);
          }}>
            <DialogTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={() => handleOpenCreate()}>
                <Plus className="h-4 w-4" />
                Create Goal
              </Button>
            </DialogTrigger>
            <DialogContent
              className="glassmorphic border-primary/30 w-full h-full max-w-full max-h-full left-0 top-0 translate-x-0 translate-y-0 rounded-none sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[90vh] sm:h-auto sm:rounded-lg overflow-y-auto"
              onOpenAutoFocus={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle className="font-orbitron text-xl">Create New Goal</DialogTitle>
              </DialogHeader>
              {renderGoalForm(createFormData, setCreateFormData, handleCreateGoal, "Create Goal", true)}
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="mb-6">
          <h1 className="text-2xl font-orbitron mb-1">Vision</h1>
          <p className="text-[#7DAAB2]">Set mission objectives for each time horizon and check them off as you reach them</p>
        </div>

        <Dialog open={isEditOpen} onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setEditFormData(defaultFormData);
            setEditingGoalId(null);
          }
        }}>
          <DialogContent
            className="glassmorphic border-primary/30 w-full h-full max-w-full max-h-full left-0 top-0 translate-x-0 translate-y-0 rounded-none sm:left-[50%] sm:top-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[90vh] sm:h-auto sm:rounded-lg overflow-y-auto"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="font-orbitron text-xl flex items-center gap-2">
                <Edit2 className="h-5 w-5" />
                Edit Goal
              </DialogTitle>
            </DialogHeader>
            {renderGoalForm(editFormData, setEditFormData, handleEditGoal, "Save Changes", false)}
          </DialogContent>
        </Dialog>

        <div className="space-y-6 mb-6">
          {widgets.map((widget, index) => {
            const state = openStates[widget.id];
            return (
              <CollapsibleWidget
                key={widget.id}
                id={widget.id}
                index={index}
                title={widget.title}
                icon={widget.icon}
                isOpenProp={state.isOpen}
                onOpenChange={state.setOpen}
                moveWidget={moveWidget}
                acceptExternalDrop={MILESTONE_ITEM}
                onExternalDrop={(item: { goalId: number; sourceCategory: string }) => {
                  if (item.sourceCategory !== widget.id) {
                    handleMoveToCategory(item.goalId, widget.id);
                  }
                }}
              >
                <ObjectiveList
                  category={widget.id}
                  placeholder={widget.placeholder}
                  goals={goals}
                  linkedMissions={getLinkedMissionsForCategory(widget.id)}
                  isLoading={goalsQueryLoading && !goalsLoaded}
                  onCreateGoal={handleOpenCreate}
                  onEditGoal={handleOpenEdit}
                  onToggle={handleToggle}
                  onDelete={handleDelete}
                  onReorder={handleReorder}
                  onMoveToCategory={handleMoveToCategory}
                  setGoals={setGoals}
                />
              </CollapsibleWidget>
            );
          })}
        </div>
      </div>
  );
}
