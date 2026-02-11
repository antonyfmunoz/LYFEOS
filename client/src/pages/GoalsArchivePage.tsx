import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { useWidgetState } from "@/hooks/use-widget-state";
import { ArrowLeft, Eye, Compass, Flame, Target, Milestone, Plus, Check, Trash2, Edit2, Loader2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import update from 'immutability-helper';
import { CollapsibleWidget } from '@/components/ui/collapsible-widget';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { cn } from "@/lib/utils";

interface VisionGoal {
  id: number;
  userId: number;
  category: string;
  title: string;
  description: string | null;
  completed: boolean;
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
}

function MilestoneList({ category, placeholder }: { category: string; placeholder: string }) {
  const { user } = useAuth();
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [expandedGoalId, setExpandedGoalId] = useState<number | null>(null);
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
    mutationFn: async (title: string) => {
      return apiRequest('/api/vision-goals', {
        method: 'POST',
        body: JSON.stringify({ category, title }),
      });
    },
    onMutate: async (title: string) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<VisionGoal[]>(queryKey);
      const tempGoal: VisionGoal = {
        id: tempIdCounter.current--,
        userId: user?.id || 0,
        category,
        title,
        description: null,
        completed: false,
        displayOrder: (previous?.length || 0) + 1,
        createdAt: new Date().toISOString(),
      };
      queryClient.setQueryData<VisionGoal[]>(queryKey, (old = []) => [...old, tempGoal]);
      setNewTitle("");
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
        old.map(g => g.id === id ? { ...g, completed } : g)
      );
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      await apiRequest(`/api/vision-goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
    },
    onMutate: async ({ id, title }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<VisionGoal[]>(queryKey);
      queryClient.setQueryData<VisionGoal[]>(queryKey, (old = []) =>
        old.map(g => g.id === id ? { ...g, title } : g)
      );
      setEditingId(null);
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

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    createMutation.mutate(newTitle.trim());
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

  const activeGoals = goals.filter(g => !g.completed);
  const completedGoals = goals.filter(g => g.completed);

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
      <form onSubmit={handleAdd} className="flex gap-2">
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
      </form>

      {goals.length === 0 && (
        <p className="text-sm text-muted-foreground italic py-2">No milestones yet. Add your first one above.</p>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-1">
          {activeGoals.map((goal) => (
            <div key={goal.id}>
              <div className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-primary/5 transition-colors">
                <button
                  onClick={() => toggleMutation.mutate({ id: goal.id, completed: true })}
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
                    <span className="flex-1 text-sm text-foreground">{goal.title}</span>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => startEdit(goal)}
                        className="h-6 w-6 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 flex items-center justify-center transition-colors"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(goal.id)}
                        className="h-6 w-6 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </>
                )}
              </div>
              {renderGoalMissions(goal.id)}
            </div>
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
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => deleteMutation.mutate(goal.id)}
                    className="h-6 w-6 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 flex items-center justify-center transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
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
