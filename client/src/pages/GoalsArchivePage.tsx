import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { useWidgetState } from "@/hooks/use-widget-state";
import { ArrowLeft, Eye, Compass, Flame, Target, Milestone, Plus, Check, Trash2, Edit2, Loader2, ChevronDown, ChevronRight, Info, Zap, GripVertical, Gift, Star } from "lucide-react";
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

interface CompletedMission {
  id: number;
  title: string;
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
  infoExpandedId: number | null;
  setInfoExpandedId: (id: number | null) => void;
  renderInfoPanel: (goal: VisionGoal) => React.ReactNode;
  renderGoalMissions: (goalId: number) => React.ReactNode;
  category: string;
}

function DraggableObjective({
  goal, index, moveGoal, onToggle, onEdit, onDelete,
  infoExpandedId, setInfoExpandedId, renderInfoPanel, renderGoalMissions, category,
}: DraggableObjectiveProps) {
  const ref = useRef<HTMLDivElement>(null);

  const [{ isDragging }, drag, preview] = useDrag({
    type: `${MILESTONE_ITEM}_${category}`,
    item: () => ({ index }),
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: `${MILESTONE_ITEM}_${category}`,
    hover(item: { index: number }, monitor) {
      if (!ref.current) return;
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
    <div ref={ref} style={{ opacity: isDragging ? 0.4 : 1 }}>
      <div className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-primary/5 transition-colors">
        <div ref={(node) => { drag(node); }} className="cursor-grab active:cursor-grabbing shrink-0 text-muted-foreground hover:text-primary transition-colors">
          <GripVertical className="h-4 w-4" />
        </div>
        <button
          onClick={() => onToggle(goal.id, true)}
          className="shrink-0 h-5 w-5 rounded-full border-2 border-primary/40 hover:border-primary hover:bg-primary/20 transition-colors flex items-center justify-center touch-manipulation"
        />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-foreground">{goal.title}</span>
          {(goal.rewardText || goal.bonusXp > 0) && (
            <div className="flex items-center gap-2 mt-0.5">
              {goal.rewardText && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Gift className="h-3 w-3 text-primary/50" />
                  {goal.rewardText}
                </span>
              )}
              {goal.bonusXp > 0 && (
                <span className="text-xs text-amber-400/80 font-medium">+{goal.bonusXp} XP</span>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button
            onClick={() => setInfoExpandedId(infoExpandedId === goal.id ? null : goal.id)}
            className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
          >
            <Info className="h-3 w-3" />
          </button>
          <button
            onClick={() => onEdit(goal)}
            className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
          >
            <Edit2 className="h-3 w-3" />
          </button>
          <button
            onClick={() => onDelete(goal.id)}
            className="h-6 w-6 inline-flex items-center justify-center rounded border bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30 transition-colors"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      {renderInfoPanel(goal)}
      {renderGoalMissions(goal.id)}
    </div>
  );
}

function ObjectiveList({ category, placeholder, onCreateGoal, onEditGoal }: { category: string; placeholder: string; onCreateGoal: (category: string) => void; onEditGoal: (goal: VisionGoal) => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [expandedGoalId, setExpandedGoalId] = useState<number | null>(null);
  const [infoExpandedId, setInfoExpandedId] = useState<number | null>(null);

  const queryKey = ['/api/vision-goals', category];
  const allGoalsKey = ['/api/vision-goals/all'];

  const { data: goals = [], isLoading } = useQuery<VisionGoal[]>({
    queryKey,
    queryFn: async () => {
      const res = await fetch(`/api/vision-goals/${category}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch goals');
      return res.json();
    },
    enabled: !!user,
  });

  const { data: completedMissions = [] } = useQuery<CompletedMission[]>({
    queryKey: ['/api/quests/completed-by-vision-goal', category],
    queryFn: async () => {
      const res = await fetch(`/api/quests/completed-by-vision-goal/${category}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!user,
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: number; completed: boolean }) => {
      const result = await apiRequest<VisionGoal & { xpAwarded?: number }>(`/api/vision-goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      });
      return result;
    },
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey });
      await queryClient.cancelQueries({ queryKey: allGoalsKey });
      const previous = queryClient.getQueryData<VisionGoal[]>(queryKey);
      const previousAll = queryClient.getQueryData<VisionGoal[]>(allGoalsKey);
      const updater = (old: VisionGoal[]) =>
        old.map(g => g.id === id ? { ...g, completed, completedAt: completed ? new Date().toISOString() : null } : g);
      queryClient.setQueryData<VisionGoal[]>(queryKey, (old = []) => updater(old));
      queryClient.setQueryData<VisionGoal[]>(allGoalsKey, (old = []) => updater(old));
      return { previous, previousAll };
    },
    onSuccess: (data, variables) => {
      if (variables.completed === true && data && data.title) {
        objectiveToast(data.title, data.rewardText, data.bonusXp);
      }
    },
    onError: (err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      if (context?.previousAll) queryClient.setQueryData(allGoalsKey, context.previousAll);
      toast({
        title: "Failed to update goal",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: allGoalsKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/vision-goals/${id}`, { method: 'DELETE' });
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey });
      await queryClient.cancelQueries({ queryKey: allGoalsKey });
      const previous = queryClient.getQueryData<VisionGoal[]>(queryKey);
      const previousAll = queryClient.getQueryData<VisionGoal[]>(allGoalsKey);
      queryClient.setQueryData<VisionGoal[]>(queryKey, (old = []) =>
        old.filter(g => g.id !== id)
      );
      queryClient.setQueryData<VisionGoal[]>(allGoalsKey, (old = []) =>
        old.filter(g => g.id !== id)
      );
      return { previous, previousAll };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
      if (context?.previousAll) queryClient.setQueryData(allGoalsKey, context.previousAll);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: allGoalsKey });
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await apiRequest('/api/vision-goals/reorder', {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: allGoalsKey });
    },
  });

  const activeGoalsRef = useRef<VisionGoal[]>([]);

  const moveGoal = useCallback((dragIndex: number, hoverIndex: number) => {
    const currentActive = activeGoalsRef.current;
    const newGoals = update(currentActive, {
      $splice: [
        [dragIndex, 1],
        [hoverIndex, 0, currentActive[dragIndex]],
      ],
    });
    const reordered = newGoals.map((g, i) => ({ ...g, displayOrder: i }));
    queryClient.setQueryData<VisionGoal[]>(queryKey, (old = []) => {
      const completed = old.filter(g => g.completed);
      return [...reordered, ...completed];
    });
    activeGoalsRef.current = reordered;
    reorderMutation.mutate(reordered.map(g => g.id));
  }, [queryKey]);

  const getMissionsForGoal = (goalId: number) => {
    return completedMissions.filter(m => m.visionGoalId === goalId);
  };

  const renderInfoPanel = (goal: VisionGoal) => {
    if (infoExpandedId !== goal.id) return null;
    const missions = getMissionsForGoal(goal.id);

    let avgDifficulty: string | null = null;
    if (missions.length > 0) {
      const sum = missions.reduce((acc, m) => acc + (difficultyOrder[m.difficulty] || 0), 0);
      const avg = Math.round(sum / missions.length);
      avgDifficulty = reverseOrder[avg] || null;
    }

    const uniqueCategories = Array.from(new Set(missions.map(m => m.category))).filter(c => c !== 'general');

    const totalXP = missions.reduce((acc, m) => acc + (m.experienceReward || 0), 0);
    const totalEnergy = missions.reduce((acc, m) => acc + (m.energyCost || 0), 0);

    return (
      <div className="ml-8 mt-1 bg-primary/5 border border-primary/10 rounded-lg p-3 space-y-2 text-xs">
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
          <span className="text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3" /> Bonus XP:</span>
          <span className={goal.bonusXp > 0 ? "text-amber-400 font-medium" : "italic text-muted-foreground"}>
            {goal.bonusXp > 0 ? `+${goal.bonusXp}` : "AI-assigned on completion"}
          </span>
        </div>

        <div className="flex items-center gap-4 text-muted-foreground">
          <span>Created: <span className="text-foreground/80">{new Date(goal.createdAt).toLocaleDateString()}</span></span>
          {goal.completed && goal.completedAt && (
            <span>Completed: <span className="text-green-400">{new Date(goal.completedAt).toLocaleDateString()}</span></span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">Avg Rank:</span>
          {avgDifficulty ? (
            <span className="font-mono text-primary font-medium">{avgDifficulty}</span>
          ) : (
            <span className="italic text-muted-foreground">No missions linked</span>
          )}
        </div>

        {uniqueCategories.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap">
            {uniqueCategories.map(cat => (
              <span key={cat} className="px-1.5 py-0.5 rounded bg-primary/10 text-primary/80 text-[10px] font-medium">
                {cat}
              </span>
            ))}
          </div>
        )}

        {missions.length > 0 && (
          <div className="flex items-center gap-1 text-muted-foreground">
            <Zap className="h-3 w-3 text-primary/60" />
            <span>+{totalXP} XP · -{totalEnergy} EP · {missions.length} mission{missions.length !== 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
    );
  };

  const activeGoals = [...goals.filter(g => !g.completed)].sort((a, b) => a.displayOrder - b.displayOrder);
  const completedGoals = goals.filter(g => g.completed);
  activeGoalsRef.current = activeGoals;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const renderGoalMissions = (goalId: number) => {
    const missions = getMissionsForGoal(goalId);
    if (missions.length === 0) return null;
    const isExpanded = expandedGoalId === goalId;
    return (
      <div className="ml-8 mt-1">
        <button
          onClick={(e) => { e.stopPropagation(); setExpandedGoalId(isExpanded ? null : goalId); }}
          className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <span>{missions.length} completed mission{missions.length !== 1 ? 's' : ''}</span>
        </button>
        {isExpanded && (
          <div className="mt-1 space-y-0.5 pl-4 border-l border-primary/10">
            {missions.map((m) => (
              <div key={m.id} className="flex items-center gap-2 py-0.5">
                <Check className="h-3 w-3 text-green-400 shrink-0" />
                <span className="text-xs text-muted-foreground truncate">{m.title}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {goals.length === 0 && (
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
              onToggle={(id, completed) => toggleMutation.mutate({ id, completed })}
              onEdit={onEditGoal}
              onDelete={(id) => deleteMutation.mutate(id)}
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
            <div key={goal.id}>
              <div className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-primary/5 transition-colors">
                <button
                  onClick={() => toggleMutation.mutate({ id: goal.id, completed: false })}
                  className="shrink-0 h-5 w-5 rounded-full border-2 border-primary/60 bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors touch-manipulation"
                >
                  <Check className="h-3 w-3 text-primary" />
                </button>
                <span className={cn("flex-1 text-sm line-through text-muted-foreground")}>{goal.title}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setInfoExpandedId(infoExpandedId === goal.id ? null : goal.id)}
                    className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  >
                    <Info className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onEditGoal(goal)}
                    className="h-6 w-6 inline-flex items-center justify-center rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors"
                  >
                    <Edit2 className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => deleteMutation.mutate(goal.id)}
                    className="h-6 w-6 inline-flex items-center justify-center rounded border bg-red-500/20 border-red-500/50 text-red-400 hover:bg-red-500/30 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
              {renderInfoPanel(goal)}
              {renderGoalMissions(goal.id)}
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

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState<GoalFormData>(defaultFormData);
  const [editFormData, setEditFormData] = useState<GoalFormData>(defaultFormData);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    try {
      await apiRequest('/api/vision-goals', {
        method: 'POST',
        body: JSON.stringify({
          category: createFormData.category,
          title: createFormData.title.trim(),
          description: createFormData.description.trim() || null,
          rewardText: createFormData.rewardText.trim() || null,
          bonusXp: 0,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/vision-goals', createFormData.category] });
      queryClient.invalidateQueries({ queryKey: ['/api/vision-goals/all'] });
      setIsCreateOpen(false);
      setCreateFormData(defaultFormData);
    } catch (error) {
      console.error("Error creating goal:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditGoal = async () => {
    if (!editFormData.title.trim() || !editingGoalId) return;
    setIsSubmitting(true);
    try {
      await apiRequest(`/api/vision-goals/${editingGoalId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          title: editFormData.title.trim(),
          description: editFormData.description.trim() || null,
          rewardText: editFormData.rewardText.trim() || null,
          bonusXp: 0,
        }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/vision-goals', editFormData.category] });
      queryClient.invalidateQueries({ queryKey: ['/api/vision-goals/all'] });
      CATEGORY_OPTIONS.forEach(cat => {
        queryClient.invalidateQueries({ queryKey: ['/api/vision-goals', cat.value] });
      });
      setIsEditOpen(false);
      setEditFormData(defaultFormData);
      setEditingGoalId(null);
    } catch (error) {
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
              >
                <ObjectiveList
                  category={widget.id}
                  placeholder={widget.placeholder}
                  onCreateGoal={handleOpenCreate}
                  onEditGoal={handleOpenEdit}
                />
              </CollapsibleWidget>
            );
          })}
        </div>
      </div>
  );
}
