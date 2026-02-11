import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { useWidgetState } from "@/hooks/use-widget-state";
import { ArrowLeft, Eye, Compass, Flame, Target, Milestone, Plus, Check, Trash2, Edit2, Loader2, ChevronDown, ChevronRight, Info, Zap, GripVertical, Gift, Star } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import update from 'immutability-helper';
import { useDrag, useDrop } from 'react-dnd';
import { CollapsibleWidget } from '@/components/ui/collapsible-widget';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cn } from "@/lib/utils";
import { milestoneToast } from "@/lib/gamified-toast";

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

const difficultyOrder: Record<string, number> = { 'D': 1, 'C': 2, 'B': 3, 'A': 4, 'S': 5 };
const reverseOrder: Record<number, string> = { 1: 'D', 2: 'C', 3: 'B', 4: 'A', 5: 'S' };

const MILESTONE_ITEM = "MILESTONE_ITEM";

interface DraggableMilestoneProps {
  goal: VisionGoal;
  index: number;
  moveGoal: (dragIndex: number, hoverIndex: number) => void;
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (goal: VisionGoal) => void;
  onDelete: (id: number) => void;
  editingId: number | null;
  editTitle: string;
  setEditTitle: (v: string) => void;
  handleEditSave: (id: number) => void;
  setEditingId: (id: number | null) => void;
  editInputRef: React.RefObject<HTMLInputElement | null>;
  infoExpandedId: number | null;
  setInfoExpandedId: (id: number | null) => void;
  renderInfoPanel: (goal: VisionGoal) => React.ReactNode;
  renderGoalMissions: (goalId: number) => React.ReactNode;
  category: string;
}

function DraggableMilestone({
  goal, index, moveGoal, onToggle, onEdit, onDelete,
  editingId, editTitle, setEditTitle, handleEditSave, setEditingId, editInputRef,
  infoExpandedId, setInfoExpandedId, renderInfoPanel, renderGoalMissions, category,
}: DraggableMilestoneProps) {
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
          className="shrink-0 h-5 w-5 rounded-full border-2 border-primary/40 hover:border-primary hover:bg-primary/20 transition-colors flex items-center justify-center"
        />
        {editingId === goal.id ? (
          <form
            onSubmit={(e) => { e.preventDefault(); handleEditSave(goal.id); }}
            className="flex-1 flex gap-2"
          >
            <Input
              ref={editInputRef}
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="h-7 text-sm bg-card/30 border-primary/30"
              onKeyDown={(e) => { if (e.key === 'Escape') setEditingId(null); }}
            />
            <Button type="submit" size="sm" variant="ghost" className="h-7 px-2 text-primary">
              <Check className="h-3.5 w-3.5" />
            </Button>
          </form>
        ) : (
          <>
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
          </>
        )}
      </div>
      {renderInfoPanel(goal)}
      {renderGoalMissions(goal.id)}
    </div>
  );
}

function MilestoneList({ category, placeholder }: { category: string; placeholder: string }) {
  const { user } = useAuth();
  const [newTitle, setNewTitle] = useState("");
  const [newRewardText, setNewRewardText] = useState("");
  const [newBonusXp, setNewBonusXp] = useState("0");
  const [showRewards, setShowRewards] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [expandedGoalId, setExpandedGoalId] = useState<number | null>(null);
  const [infoExpandedId, setInfoExpandedId] = useState<number | null>(null);
  const [editingDescId, setEditingDescId] = useState<number | null>(null);
  const [editDesc, setEditDesc] = useState("");
  const [editingRewardId, setEditingRewardId] = useState<number | null>(null);
  const [editReward, setEditReward] = useState("");
  const [editingXpId, setEditingXpId] = useState<number | null>(null);
  const [editXp, setEditXp] = useState("0");
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  let tempIdCounter = useRef(-1);

  const queryKey = ['/api/vision-goals', category];

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

  useEffect(() => {
    if (editingId !== null && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  const createMutation = useMutation({
    mutationFn: async ({ title, rewardText, bonusXp }: { title: string; rewardText: string; bonusXp: string }) => {
      return apiRequest('/api/vision-goals', {
        method: 'POST',
        body: JSON.stringify({ category, title, rewardText: rewardText || null, bonusXp: bonusXp || "0" }),
      });
    },
    onMutate: async ({ title, rewardText, bonusXp }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<VisionGoal[]>(queryKey);
      const tempGoal: VisionGoal = {
        id: tempIdCounter.current--,
        userId: user?.id || 0,
        category,
        title,
        description: null,
        rewardText: rewardText || null,
        bonusXp: parseInt(bonusXp) || 0,
        completed: false,
        completedAt: null,
        displayOrder: (previous?.length || 0) + 1,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<VisionGoal[]>(queryKey, (old = []) => [...old, tempGoal]);
      setNewTitle("");
      setNewRewardText("");
      setNewBonusXp("0");
      setShowRewards(false);
      inputRef.current?.focus();
      return { previous };
    },
    onError: (_err, _title, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: number; completed: boolean }) => {
      await apiRequest(`/api/vision-goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      });
    },
    onMutate: async ({ id, completed }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<VisionGoal[]>(queryKey);
      queryClient.setQueryData<VisionGoal[]>(queryKey, (old = []) =>
        old.map(g => g.id === id ? { ...g, completed, completedAt: completed ? new Date().toISOString() : null } : g)
      );
      return { previous };
    },
    onSuccess: (_data, { id, completed }) => {
      if (completed) {
        const goal = goals.find(g => g.id === id);
        if (goal) milestoneToast(goal.title, goal.rewardText, goal.bonusXp);
      }
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, title, description, rewardText, bonusXp }: { id: number; title?: string; description?: string; rewardText?: string; bonusXp?: string }) => {
      const body: Record<string, any> = {};
      if (title !== undefined) body.title = title;
      if (description !== undefined) body.description = description;
      if (rewardText !== undefined) body.rewardText = rewardText;
      if (bonusXp !== undefined) body.bonusXp = bonusXp;
      await apiRequest(`/api/vision-goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
    },
    onMutate: async ({ id, title, description, rewardText, bonusXp }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<VisionGoal[]>(queryKey);
      queryClient.setQueryData<VisionGoal[]>(queryKey, (old = []) =>
        old.map(g => {
          if (g.id !== id) return g;
          const updated = { ...g };
          if (title !== undefined) updated.title = title;
          if (description !== undefined) updated.description = description;
          if (rewardText !== undefined) updated.rewardText = rewardText || null;
          if (bonusXp !== undefined) updated.bonusXp = parseInt(bonusXp) || 0;
          return updated;
        })
      );
      setEditingId(null);
      setEditingDescId(null);
      setEditingRewardId(null);
      setEditingXpId(null);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/vision-goals/${id}`, { method: 'DELETE' });
    },
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<VisionGoal[]>(queryKey);
      queryClient.setQueryData<VisionGoal[]>(queryKey, (old = []) =>
        old.filter(g => g.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
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

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate({ title: newTitle.trim(), rewardText: newRewardText.trim(), bonusXp: newBonusXp });
  };

  const handleEditSave = (id: number) => {
    if (!editTitle.trim()) return;
    updateMutation.mutate({ id, title: editTitle.trim() });
  };

  const startEdit = (goal: VisionGoal) => {
    setEditingId(goal.id);
    setEditTitle(goal.title);
  };

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
          {editingDescId === goal.id ? (
            <div className="flex-1 flex gap-1 items-center">
              <Input
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="h-6 text-xs bg-card/30 border-primary/30 flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingDescId(null);
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    updateMutation.mutate({ id: goal.id, description: editDesc.trim() });
                  }
                }}
                autoFocus
              />
              <button
                onClick={() => updateMutation.mutate({ id: goal.id, description: editDesc.trim() })}
                className="h-5 w-5 rounded text-primary hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-1">
              {goal.description ? (
                <span className="text-foreground/80">{goal.description}</span>
              ) : (
                <span className="italic text-muted-foreground">No description</span>
              )}
              <button
                onClick={() => { setEditingDescId(goal.id); setEditDesc(goal.description || ""); }}
                className="h-5 w-5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0"
              >
                <Edit2 className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2">
          <span className="text-muted-foreground shrink-0 flex items-center gap-1"><Gift className="h-3 w-3" /> Reward:</span>
          {editingRewardId === goal.id ? (
            <div className="flex-1 flex gap-1 items-center">
              <Input
                value={editReward}
                onChange={(e) => setEditReward(e.target.value)}
                className="h-6 text-xs bg-card/30 border-primary/30 flex-1"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingRewardId(null);
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    updateMutation.mutate({ id: goal.id, rewardText: editReward.trim() });
                  }
                }}
                autoFocus
              />
              <button
                onClick={() => updateMutation.mutate({ id: goal.id, rewardText: editReward.trim() })}
                className="h-5 w-5 rounded text-primary hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex-1 flex items-center gap-1">
              {goal.rewardText ? (
                <span className="text-foreground/80">{goal.rewardText}</span>
              ) : (
                <span className="italic text-muted-foreground">No reward set</span>
              )}
              <button
                onClick={() => { setEditingRewardId(goal.id); setEditReward(goal.rewardText || ""); }}
                className="h-5 w-5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0"
              >
                <Edit2 className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-muted-foreground flex items-center gap-1"><Star className="h-3 w-3" /> Bonus XP:</span>
          {editingXpId === goal.id ? (
            <div className="flex items-center gap-1">
              <Select value={editXp} onValueChange={setEditXp}>
                <SelectTrigger className="w-[90px] h-6 text-xs bg-card/30 border-primary/30">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 25, 50, 100, 150, 200, 250, 500].map(xp => (
                    <SelectItem key={xp} value={String(xp)}>+{xp} XP</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <button
                onClick={() => updateMutation.mutate({ id: goal.id, bonusXp: editXp })}
                className="h-5 w-5 rounded text-primary hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0"
              >
                <Check className="h-3 w-3" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1">
              <span className={goal.bonusXp > 0 ? "text-amber-400 font-medium" : "italic text-muted-foreground"}>
                {goal.bonusXp > 0 ? `+${goal.bonusXp}` : "None"}
              </span>
              <button
                onClick={() => { setEditingXpId(goal.id); setEditXp(String(goal.bonusXp)); }}
                className="h-5 w-5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-colors shrink-0"
              >
                <Edit2 className="h-2.5 w-2.5" />
              </button>
            </div>
          )}
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
      <form onSubmit={handleAdd} className="space-y-2">
        <div className="flex gap-2">
          <Input
            ref={inputRef}
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={placeholder}
            className="bg-card/30 border-primary/30 focus-visible:ring-primary/30 text-sm"
          />
          <Button
            type="submit"
            size="sm"
            disabled={!newTitle.trim()}
            className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 shrink-0 gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
        <button
          type="button"
          onClick={() => setShowRewards(!showRewards)}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          {showRewards ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <Gift className="h-3 w-3" />
          Add Rewards
        </button>
        {showRewards && (
          <div className="flex gap-2 items-center bg-card/30 border border-primary/30 rounded-lg p-2">
            <Input
              value={newRewardText}
              onChange={(e) => setNewRewardText(e.target.value)}
              placeholder="e.g., Buy new shoes, Take a day off"
              className="bg-card/30 border-primary/30 focus-visible:ring-primary/30 text-xs h-8 flex-1"
            />
            <Select value={newBonusXp} onValueChange={setNewBonusXp}>
              <SelectTrigger className="w-[100px] h-8 text-xs bg-card/30 border-primary/30">
                <SelectValue placeholder="Bonus XP" />
              </SelectTrigger>
              <SelectContent>
                {[0, 25, 50, 100, 150, 200, 250, 500].map(xp => (
                  <SelectItem key={xp} value={String(xp)}>+{xp} XP</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form>

      {goals.length === 0 && (
        <p className="text-sm text-muted-foreground italic py-2">No milestones yet. Add your first one above.</p>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-1">
          {activeGoals.map((goal, index) => (
            <DraggableMilestone
              key={goal.id}
              goal={goal}
              index={index}
              moveGoal={moveGoal}
              onToggle={(id, completed) => toggleMutation.mutate({ id, completed })}
              onEdit={startEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
              editingId={editingId}
              editTitle={editTitle}
              setEditTitle={setEditTitle}
              handleEditSave={handleEditSave}
              setEditingId={setEditingId}
              editInputRef={editInputRef}
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
                  className="shrink-0 h-5 w-5 rounded-full border-2 border-primary/60 bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors"
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
                    onClick={() => startEdit(goal)}
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

  return (
      <div className="pb-20">
        <div className="mb-4">
          <Button 
            variant="ghost" 
            className="flex items-center gap-2 text-muted-foreground hover:text-primary hover:bg-primary/10" 
            onClick={() => navigate('/chronilog')}
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back</span>
          </Button>
        </div>
        
        <div className="mb-6">
          <h1 className="text-2xl font-orbitron mb-1">Vision</h1>
          <p className="text-[#7DAAB2]">Set milestone achievements for each time horizon and check them off as you reach them</p>
        </div>

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
                <MilestoneList
                  category={widget.id}
                  placeholder={widget.placeholder}
                />
              </CollapsibleWidget>
            );
          })}
        </div>
      </div>
  );
}
