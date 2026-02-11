import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { useWidgetState } from "@/hooks/use-widget-state";
import { ArrowLeft, Eye, Compass, Flame, Target, Milestone, Plus, Check, Trash2, Edit2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import update from 'immutability-helper';
import { CollapsibleWidget } from '@/components/ui/collapsible-widget';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from "@/hooks/use-toast";
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

function MilestoneList({ category, placeholder }: { category: string; placeholder: string }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [newTitle, setNewTitle] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const { data: goals = [], isLoading } = useQuery<VisionGoal[]>({
    queryKey: ['/api/vision-goals', category],
    queryFn: async () => {
      const res = await fetch(`/api/vision-goals/${category}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch goals');
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vision-goals', category] });
      setNewTitle("");
      inputRef.current?.focus();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add goal.", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: number; completed: boolean }) => {
      await apiRequest(`/api/vision-goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vision-goals', category] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, title }: { id: number; title: string }) => {
      await apiRequest(`/api/vision-goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vision-goals', category] });
      setEditingId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update goal.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/vision-goals/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vision-goals', category] });
      toast({ title: "Goal removed" });
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

  const activeGoals = goals.filter(g => !g.completed);
  const completedGoals = goals.filter(g => g.completed);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          ref={inputRef}
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder={placeholder}
          className="bg-card/30 border-primary/30 focus-visible:ring-primary/30 text-sm"
          disabled={createMutation.isPending}
        />
        <Button
          type="submit"
          size="sm"
          disabled={!newTitle.trim() || createMutation.isPending}
          className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 shrink-0 gap-1"
        >
          {createMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
      </form>

      {goals.length === 0 && (
        <p className="text-sm text-muted-foreground italic py-2">No milestones yet. Add your first one above.</p>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-1">
          {activeGoals.map((goal) => (
            <div
              key={goal.id}
              className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-primary/5 transition-colors"
            >
              <button
                onClick={() => toggleMutation.mutate({ id: goal.id, completed: true })}
                className="shrink-0 h-5 w-5 rounded-full border-2 border-primary/40 hover:border-primary hover:bg-primary/20 transition-colors flex items-center justify-center"
              >
                {toggleMutation.isPending && toggleMutation.variables?.id === goal.id && (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                )}
              </button>
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
              className="group flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-primary/5 transition-colors"
            >
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
