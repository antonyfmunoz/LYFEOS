import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { useLYFEOS } from "@/lib/context";
import { useWidgetState } from "@/hooks/use-widget-state";
import { ArrowLeft, Eye, Compass, Flame, Target, Milestone, Check, Trash2, Edit2, Loader2, Info, GripVertical, Undo2, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RichTextArea } from "@/components/ui/rich-text-toolbar";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  disconnectedMissionIds: number[] | null;
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
  timeCost: number;
  attentionCost: number;
  category: string;
  isRitualized: boolean;
  parentRitualId: number | null;
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

function DroppableCategory({ category, onDropGoal, children }: { category: string; onDropGoal: (item: { goalId: number; sourceCategory: string }, targetCategory: string) => void; children: React.ReactNode }) {
  const dropRef = useRef<HTMLDivElement>(null);
  const onDropGoalRef = useRef(onDropGoal);
  onDropGoalRef.current = onDropGoal;
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: MILESTONE_ITEM,
    canDrop: (item: { goalId: number; sourceCategory: string }) => item.sourceCategory !== category,
    drop: (item: { goalId: number; sourceCategory: string }) => {
      if (item.sourceCategory !== category) {
        onDropGoalRef.current(item, category);
        return { handled: true };
      }
    },
    collect: (monitor: any) => ({
      isOver: monitor.isOver(),
      canDrop: monitor.canDrop(),
    }),
  }), [category]);
  drop(dropRef);
  const isActive = isOver && canDrop;
  return (
    <div ref={dropRef} className={`${isActive ? 'ring-2 ring-primary/60 bg-primary/5 rounded-xl transition-all' : canDrop ? 'ring-1 ring-primary/20 rounded-xl transition-all' : ''}`}>
      {children}
    </div>
  );
}

interface DraggableObjectiveProps {
  goal: VisionGoal;
  index: number;
  moveGoal: (dragIndex: number, hoverIndex: number) => void;
  onDragEnd: (wasCrossCategoryDrop?: boolean) => void;
  onToggle: (id: number, completed: boolean) => void;
  onEdit: (goal: VisionGoal) => void;
  onDelete: (id: number) => void;
  isMutating: boolean;
  infoExpandedId: number | null;
  setInfoExpandedId: (id: number | null) => void;
  renderInfoPanel: (goal: VisionGoal) => React.ReactNode;
  getMissionsForGoal: (goalId: number) => LinkedMission[];
  category: string;
}

function DraggableObjective({
  goal, index, moveGoal, onDragEnd, onToggle, onEdit, onDelete, isMutating,
  infoExpandedId, setInfoExpandedId, renderInfoPanel, getMissionsForGoal, category,
}: DraggableObjectiveProps) {
  const ref = useRef<HTMLDivElement>(null);
  const onDragEndRef = useRef(onDragEnd);
  onDragEndRef.current = onDragEnd;

  const [{ isDragging }, drag, preview] = useDrag({
    type: MILESTONE_ITEM,
    item: () => ({ index, goalId: goal.id, sourceCategory: category }),
    end: (_item, monitor) => {
      const dropResult = monitor.getDropResult() as { handled?: boolean } | null;
      if (dropResult?.handled) {
        onDragEndRef.current(true);
        return;
      }
      onDragEndRef.current(false);
    },
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  });

  const [, drop] = useDrop({
    accept: MILESTONE_ITEM,
    canDrop: (item: { index: number; goalId: number; sourceCategory: string }) => item.sourceCategory === category,
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

  const allMissions = getMissionsForGoal(goal.id);
  const activeMissions = allMissions.filter(m => !m.completed);
  const completedMissions = allMissions.filter(m => m.completed);
  const totalEP = allMissions.reduce((acc, m) => acc + (m.energyCost || 0), 0);
  const totalTT = allMissions.reduce((acc, m) => acc + (m.timeCost || 0), 0);
  const totalAT = allMissions.reduce((acc, m) => acc + (m.attentionCost || 0), 0);
  const difficultyMultipliers: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
  const totalXP = allMissions.reduce((acc, m) => acc + Math.floor((m.experienceReward || 0) * (difficultyMultipliers[m.difficulty] || 1)), 0) + (goal.bonusXp || 0);

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
          <div className="flex items-center gap-3 mt-1 flex-wrap text-xs font-mono text-muted-foreground">
            <span className="text-primary/80">-{totalAT} AT</span>
            <span className="text-primary/80">-{totalTT} TT</span>
            <span className="text-primary/80">-{totalEP} EP</span>
            <span className="text-primary/80">+{totalXP} XP</span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>Created: {new Date(goal.createdAt).toLocaleDateString()}</span>
            {goal.completedAt && (
              <span className="text-foreground">Completed: {new Date(goal.completedAt).toLocaleDateString()}</span>
            )}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            {allMissions.length} linked mission{allMissions.length !== 1 ? 's' : ''} ({activeMissions.length} active, {completedMissions.length} done)
          </div>
          {renderInfoPanel(goal)}
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
}

function ObjectiveList({ category, placeholder, goals, linkedMissions, isLoading, onCreateGoal, onEditGoal, onToggle, onDelete, onReorder }: ObjectiveListProps) {
  const { toast } = useToast();
  const [infoExpandedId, setInfoExpandedId] = useState<number | null>(null);
  const [activeMissionsExpanded, setActiveMissionsExpanded] = useState<Record<number, boolean>>({});
  const [completedMissionsExpanded, setCompletedMissionsExpanded] = useState<Record<number, boolean>>({});
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

    const difficultyDescriptions: Record<string, string> = {
      S: 'Extreme effort. Multi-day or life-changing.',
      A: 'High effort. Significant commitment.',
      B: 'Moderate effort. Requires focus and planning.',
      C: 'Light effort. Simple but requires attention.',
      D: 'Minimal effort. Quick and easy.',
    };

    return (
      <div className="text-sm mt-2 p-2 rounded-lg bg-primary/5 border border-primary/10 space-y-1.5">
        <p className="text-muted-foreground text-xs">
          <span className="text-primary font-mono">Objective Description:</span> {goal.description || "No description"}
        </p>
        {uniqueCategories.length > 0 && (
          <p className="text-muted-foreground text-xs">
            <span className="text-primary font-mono">Objective Type:</span> <span className="capitalize">{uniqueCategories.join(', ')}</span>
          </p>
        )}
        <p className="text-muted-foreground text-xs">
          <span className="text-primary font-mono">Objective Difficulty:</span> Rank {avgDifficulty || 'D'}
        </p>
        <p className="text-muted-foreground text-xs">
          <span className="text-primary font-mono">Objective Reward:</span> {goal.rewardText || "No reward set"}
        </p>

        {activeMissions.length > 0 && (
          <div className="border-t border-primary/10 pt-2 mt-1">
            <button
              className="flex items-center gap-1 w-full text-left"
              onClick={(e) => { e.stopPropagation(); setActiveMissionsExpanded(prev => ({ ...prev, [goal.id]: !prev[goal.id] })); }}
            >
              {activeMissionsExpanded[goal.id] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
              <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Active Missions ({activeMissions.length})</span>
            </button>
            {activeMissionsExpanded[goal.id] && (
              <div className="mt-1 space-y-0.5 pl-4">
                {activeMissions.map(m => (
                  <div key={m.id} className="flex items-center gap-1.5 py-0.5">
                    <Target className="h-3 w-3 text-primary shrink-0" />
                    <span className="text-xs text-primary font-mono capitalize">{m.category}</span>
                    <span className="text-xs text-muted-foreground">—</span>
                    <span className="text-xs text-foreground/70 truncate">{m.title}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {completedMissions.length > 0 && (() => {
          const grouped: { key: string; category: string; title: string; count: number }[] = [];
          completedMissions.forEach(m => {
            const groupKey = m.isRitualized ? String(m.parentRitualId || m.id) : String(m.id);
            const existing = grouped.find(g => g.key === groupKey);
            if (existing) {
              existing.count++;
              existing.title = m.title;
            } else {
              grouped.push({ key: groupKey, category: m.category, title: m.title, count: 1 });
            }
          });
          return (
            <div className="border-t border-primary/10 pt-2 mt-1">
              <button
                className="flex items-center gap-1 w-full text-left"
                onClick={(e) => { e.stopPropagation(); setCompletedMissionsExpanded(prev => ({ ...prev, [goal.id]: !prev[goal.id] })); }}
              >
                {completedMissionsExpanded[goal.id] ? <ChevronDown className="h-3 w-3 text-muted-foreground" /> : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
                <span className="text-muted-foreground text-[10px] uppercase tracking-wider">Completed Missions ({completedMissions.length})</span>
              </button>
              {completedMissionsExpanded[goal.id] && (
                <div className="mt-1 space-y-0.5 pl-4">
                  {grouped.map(g => (
                    <div key={g.key} className="flex items-center gap-1.5 py-0.5">
                      <Check className="h-3 w-3 text-primary shrink-0" />
                      <span className="text-xs text-primary font-mono capitalize">{g.category}</span>
                      <span className="text-xs text-muted-foreground">—</span>
                      <span className="text-xs text-muted-foreground truncate">{g.title}{g.count > 1 ? ` (x${g.count})` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    );
  };

  const computedActiveGoals = [...categoryGoals.filter(g => !g.completed)].sort((a, b) => a.displayOrder - b.displayOrder);
  const completedGoals = categoryGoals.filter(g => g.completed);
  const [localReorder, setLocalReorder] = useState<VisionGoal[] | null>(null);
  const isDraggingRef = useRef(false);
  const activeGoals = localReorder || computedActiveGoals;
  const activeGoalsRef = useRef<VisionGoal[]>([]);
  activeGoalsRef.current = activeGoals;

  useEffect(() => {
    setLocalReorder(null);
    isDraggingRef.current = false;
  }, [goals]);

  const moveGoal = useCallback((dragIndex: number, hoverIndex: number) => {
    isDraggingRef.current = true;
    const currentActive = activeGoalsRef.current;
    const newGoals = update(currentActive, {
      $splice: [
        [dragIndex, 1],
        [hoverIndex, 0, currentActive[dragIndex]],
      ],
    });
    const reordered = newGoals.map((g, i) => ({ ...g, displayOrder: i }));
    setLocalReorder(reordered);
    activeGoalsRef.current = reordered;
  }, []);

  const commitReorder = useCallback((wasCrossCategoryDrop?: boolean) => {
    isDraggingRef.current = false;
    setLocalReorder(null);
    if (wasCrossCategoryDrop) return;
    const current = activeGoalsRef.current;
    if (current.length > 0) {
      onReorder(category, current.map(g => g.id));
    }
  }, [category, onReorder]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }


  return (
    <div className="space-y-3">
      {categoryGoals.length === 0 && (
        <p className="text-sm text-muted-foreground italic py-2">No mission objectives yet. Use "Create Objective" above to add one.</p>
      )}

      {activeGoals.length > 0 && (
        <div className="space-y-1">
          {activeGoals.map((goal, index) => (
            <DraggableObjective
              key={goal.id}
              goal={goal}
              index={index}
              moveGoal={moveGoal}
              onDragEnd={commitReorder}
              onToggle={onToggle}
              onEdit={onEditGoal}
              onDelete={onDelete}
              isMutating={isMutating}
              infoExpandedId={infoExpandedId}
              setInfoExpandedId={setInfoExpandedId}
              renderInfoPanel={renderInfoPanel}
              getMissionsForGoal={getMissionsForGoal}
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
          {completedGoals.map((goal) => {
            const allMissions = getMissionsForGoal(goal.id);
            const activeMissions = allMissions.filter(m => !m.completed);
            const completedMissions = allMissions.filter(m => m.completed);
            const totalEP = allMissions.reduce((acc, m) => acc + (m.energyCost || 0), 0);
            const totalTT = allMissions.reduce((acc, m) => acc + (m.timeCost || 0), 0);
            const totalAT = allMissions.reduce((acc, m) => acc + (m.attentionCost || 0), 0);
            const diffMults: Record<string, number> = { D: 1, C: 1.5, B: 2, A: 3, S: 5 };
            const totalXP = allMissions.reduce((acc, m) => acc + Math.floor((m.experienceReward || 0) * (diffMults[m.difficulty] || 1)), 0) + (goal.bonusXp || 0);
            return (
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
                    <div className="flex items-center gap-3 mt-1 flex-wrap text-xs font-mono text-muted-foreground opacity-50">
                      <span className="text-primary/80">-{totalAT} AT</span>
                      <span className="text-primary/80">-{totalTT} TT</span>
                      <span className="text-primary/80">-{totalEP} EP</span>
                      <span className="text-primary/80">+{totalXP} XP</span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground opacity-50">
                      <span>Created: {new Date(goal.createdAt).toLocaleDateString()}</span>
                      {goal.completedAt && (
                        <span className="text-foreground">Completed: {new Date(goal.completedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground opacity-50">
                      {allMissions.length} linked mission{allMissions.length !== 1 ? 's' : ''} ({activeMissions.length} active, {completedMissions.length} done)
                    </div>
                    {renderInfoPanel(goal)}
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
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function GoalsArchivePage() {
  usePageTitle('Vision');

  const { user } = useAuth();
  const { updateUserStats, refetchQuests, quests } = useLYFEOS();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [createFormData, setCreateFormData] = useState<GoalFormData>(defaultFormData);
  const [editFormData, setEditFormData] = useState<GoalFormData>(defaultFormData);
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [goals, setGoals] = useState<VisionGoal[]>([]);
  const [goalsQueryLoading, setGoalsQueryLoading] = useState(true);

  const fetchGoals = useCallback(async () => {
    if (!user) {
      setGoalsQueryLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/vision-goals/all', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch goals');
      const data = await res.json();
      setGoals(data);
    } catch (err) {
      console.error('Failed to fetch goals:', err);
    } finally {
      setGoalsQueryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchGoals();
  }, [fetchGoals]);

  const linkedCategories = ['legacy', '10year', '5year', '18month', '90day'];
  const [linkedMissionsMap, setLinkedMissionsMap] = useState<Record<string, LinkedMission[]>>({
    legacy: [], '10year': [], '5year': [], '18month': [], '90day': [],
  });
  const linkedMissionsRef = useRef(linkedMissionsMap);
  linkedMissionsRef.current = linkedMissionsMap;

  const fetchLinkedMissions = useCallback(async () => {
    if (!user) return;
    try {
      const results = await Promise.all(
        linkedCategories.map(async (cat) => {
          const res = await fetch(`/api/quests/linked-by-vision-goal/${cat}`, { credentials: 'include' });
          if (!res.ok) return [];
          return res.json();
        })
      );
      const map: Record<string, LinkedMission[]> = {};
      linkedCategories.forEach((cat, i) => { map[cat] = results[i]; });
      setLinkedMissionsMap(map);
    } catch (err) {
      console.error('Failed to fetch linked missions:', err);
    }
  }, [user]);

  useEffect(() => {
    fetchLinkedMissions();
  }, [fetchLinkedMissions]);

  const getLinkedMissionsForCategory = (category: string): LinkedMission[] => {
    return linkedMissionsMap[category] || [];
  };

  const setLinkedMissionsForCategory = useCallback((category: string, missions: LinkedMission[]) => {
    setLinkedMissionsMap(prev => ({ ...prev, [category]: missions }));
  }, []);

  const disconnectedMissionsRef = useRef<Record<number, LinkedMission[]>>({});
  const goalsRef = useRef(goals);
  goalsRef.current = goals;

  const handleToggle = async (id: number, completed: boolean) => {
    const snapshotGoals = [...goalsRef.current];
    const targetGoal = goalsRef.current.find(g => g.id === id);
    const category = targetGoal?.category || '';

    const updatedGoals = goalsRef.current.map(g =>
      g.id === id ? { ...g, completed, completedAt: completed ? new Date().toISOString() : null } : g
    );
    setGoals(updatedGoals);

    const currentMissions = linkedMissionsRef.current[category] || [];
    const snapshotMissions = [...currentMissions];

    if (completed) {
      const activeRitualMissions = currentMissions.filter(m => m.visionGoalId === id && !m.completed && m.isRitualized);
      disconnectedMissionsRef.current[id] = activeRitualMissions;
      if (activeRitualMissions.length > 0) {
        const disconnectIds = new Set(activeRitualMissions.map(m => m.id));
        setLinkedMissionsForCategory(category, currentMissions.filter(m => !disconnectIds.has(m.id)));
      }
    } else {
      let missionsToRestore: LinkedMission[] = [];
      const storedMissions = disconnectedMissionsRef.current[id];
      if (storedMissions && storedMissions.length > 0) {
        missionsToRestore = storedMissions;
      } else if (targetGoal?.disconnectedMissionIds && targetGoal.disconnectedMissionIds.length > 0) {
        const disconnectedIds = new Set(targetGoal.disconnectedMissionIds);
        missionsToRestore = quests
          .filter(q => disconnectedIds.has(Number(q.id)))
          .map(q => ({
            id: Number(q.id),
            title: q.title,
            completed: q.completed,
            completedAt: q.completedAt || null,
            visionGoalId: id,
            difficulty: q.difficulty || "D",
            experienceReward: q.experienceReward || 0,
            energyCost: q.energyCost || 0,
            timeCost: q.timeCost || 0,
            attentionCost: q.attentionCost || 0,
            category: q.category || "general",
            isRitualized: q.isRitualized || false,
            parentRitualId: q.parentRitualId || null,
          }));
      }
      if (missionsToRestore.length > 0) {
        const existingIds = new Set(currentMissions.map(m => m.id));
        const toRestore = missionsToRestore.filter(m => !existingIds.has(m.id));
        if (toRestore.length > 0) {
          setLinkedMissionsForCategory(category, [...currentMissions, ...toRestore]);
        }
      }
      delete disconnectedMissionsRef.current[id];
    }

    try {
      const result = await apiRequest<VisionGoal & { xpAwarded?: number; xpRemoved?: number; updatedStats?: any; disconnectedMissionIds?: number[]; remainingLinkedMissions?: LinkedMission[] }>(`/api/vision-goals/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ completed }),
      });
      setGoals(prev => prev.map(g => g.id === id ? { ...g, ...result } : g));

      if (result.remainingLinkedMissions) {
        const currentCatMissions = linkedMissionsRef.current[category] || [];
        const otherGoalMissions = currentCatMissions.filter(m => m.visionGoalId !== id);
        setLinkedMissionsForCategory(category, [...otherGoalMissions, ...result.remainingLinkedMissions]);
      }

      if (completed && result.disconnectedMissionIds && result.disconnectedMissionIds.length > 0) {
        const serverDisconnected = snapshotMissions.filter(m => result.disconnectedMissionIds!.includes(m.id));
        if (serverDisconnected.length > 0) {
          disconnectedMissionsRef.current[id] = serverDisconnected;
        }
      }

      refetchQuests();
      if (result.updatedStats) {
        updateUserStats(result.updatedStats);
      } else if (user) {
        try {
          const statsRes = await fetch(`/api/users/${user.id}/stats`, { credentials: 'include' });
          if (statsRes.ok) {
            const statsData = await statsRes.json();
            if (statsData.stats) updateUserStats(statsData.stats);
          }
        } catch {}
      }
      if (completed && result && result.title) {
        objectiveToast(result.title, result.rewardText, result.xpAwarded || result.bonusXp);
      }
    } catch (err) {
      setGoals(snapshotGoals);
      setLinkedMissionsForCategory(category, snapshotMissions);
      if (completed) {
        delete disconnectedMissionsRef.current[id];
      }
      toast({
        title: "Failed to update goal",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async (id: number) => {
    const snapshotGoals = [...goalsRef.current];
    setGoals(prev => prev.filter(g => g.id !== id));

    try {
      await apiRequest(`/api/vision-goals/${id}`, { method: 'DELETE' });
    } catch (err) {
      setGoals(snapshotGoals);
      toast({
        title: "Failed to delete goal",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    }
  };

  const handleReorder = async (category: string, ids: number[]) => {
    const snapshotGoals = [...goalsRef.current];
    setGoals(prev => {
      const updated = [...prev];
      ids.forEach((id, index) => {
        const goalIndex = updated.findIndex(g => g.id === id);
        if (goalIndex !== -1) updated[goalIndex] = { ...updated[goalIndex], displayOrder: index };
      });
      return updated;
    });
    try {
      await apiRequest('/api/vision-goals/reorder', {
        method: 'PUT',
        body: JSON.stringify({ ids }),
      });
    } catch (err) {
      console.error("Failed to save reorder:", err);
      setGoals(snapshotGoals);
    }
  };

  const movingGoalsRef = useRef<Set<number>>(new Set());
  const handleMoveToCategory = async (goalId: number, newCategory: string) => {
    if (movingGoalsRef.current.has(goalId)) return;
    movingGoalsRef.current.add(goalId);
    const snapshotGoals = [...goalsRef.current];
    const oldGoal = goalsRef.current.find(g => g.id === goalId);
    const oldCategory = oldGoal?.category || '';
    const previousLinkedMissions = { ...linkedMissionsRef.current };
    setGoals(prev => prev.map(g => g.id === goalId ? { ...g, category: newCategory, displayOrder: 999 } : g));

    if (oldCategory && oldCategory !== newCategory) {
      const oldMissions = linkedMissionsRef.current[oldCategory] || [];
      const missionsToMove = oldMissions.filter(m => m.visionGoalId === goalId);
      if (missionsToMove.length > 0) {
        const remainingOld = oldMissions.filter(m => m.visionGoalId !== goalId);
        const newCatMissions = linkedMissionsRef.current[newCategory] || [];
        setLinkedMissionsForCategory(oldCategory, remainingOld);
        setLinkedMissionsForCategory(newCategory, [...newCatMissions, ...missionsToMove]);
      }
    }

    try {
      const result = await apiRequest<VisionGoal>(`/api/vision-goals/${goalId}`, {
        method: 'PATCH',
        body: JSON.stringify({ category: newCategory }),
      });
      setGoals(prev => prev.map(g => g.id === goalId ? { ...g, ...result } : g));
      queryClient.invalidateQueries({ queryKey: ['/api/vision-goals/all'] });
      fetchLinkedMissions();
    } catch (err) {
      setGoals(snapshotGoals);
      setLinkedMissionsMap(previousLinkedMissions);
      toast({
        title: "Failed to move goal",
        description: err instanceof Error ? err.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      movingGoalsRef.current.delete(goalId);
    }
  };

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
      title: 'Legacy',
      icon: <Eye className="h-5 w-5 text-primary" />,
      stateKey: 'goals.legacy-vision',
      placeholder: "e.g., Build a company that impacts 1M lives",
    },
    {
      id: '10year',
      title: '10-Year',
      icon: <Target className="h-5 w-5 text-primary" />,
      stateKey: 'goals.10year-vision',
      placeholder: "e.g., Reach $1M net worth",
    },
    {
      id: '5year',
      title: '5-Year',
      icon: <Compass className="h-5 w-5 text-primary" />,
      stateKey: 'goals.5year-vision',
      placeholder: "e.g., Launch my own product",
    },
    {
      id: '18month',
      title: '18-Month',
      icon: <Milestone className="h-5 w-5 text-primary" />,
      stateKey: 'goals.18month-vision',
      placeholder: "e.g., Earn $10k/month consistently",
    },
    {
      id: '90day',
      title: '90-Day',
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
      disconnectedMissionIds: null,
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
    const oldGoal = goalsRef.current.find(g => g.id === editedId);
    const oldCategory = oldGoal?.category || '';
    const newCategory = editFormData.category;
    const categoryChanged = oldCategory !== newCategory && oldCategory !== '';
    const optimisticUpdates = {
      title: editFormData.title.trim(),
      description: editFormData.description.trim() || null,
      rewardText: editFormData.rewardText.trim() || null,
      category: newCategory,
    };
    const previousGoals = [...goalsRef.current];
    const previousLinkedMissions = { ...linkedMissionsRef.current };
    setIsEditOpen(false);
    setEditFormData(defaultFormData);
    setEditingGoalId(null);
    setGoals(prev => prev.map(g => g.id === editedId ? { ...g, ...optimisticUpdates } : g));
    if (categoryChanged) {
      const oldMissions = linkedMissionsRef.current[oldCategory] || [];
      const missionsToMove = oldMissions.filter(m => m.visionGoalId === editedId);
      if (missionsToMove.length > 0) {
        const remainingOld = oldMissions.filter(m => m.visionGoalId !== editedId);
        const newCatMissions = linkedMissionsRef.current[newCategory] || [];
        setLinkedMissionsForCategory(oldCategory, remainingOld);
        setLinkedMissionsForCategory(newCategory, [...newCatMissions, ...missionsToMove]);
      }
    }
    try {
      const updatedGoal = await apiRequest<VisionGoal>(`/api/vision-goals/${editedId}`, {
        method: 'PATCH',
        body: JSON.stringify(optimisticUpdates),
      });
      setGoals(prev => prev.map(g => g.id === editedId ? { ...g, ...updatedGoal } : g));
      queryClient.invalidateQueries({ queryKey: ['/api/vision-goals/all'] });
      fetchLinkedMissions();
    } catch (error) {
      setGoals(previousGoals);
      if (categoryChanged) {
        setLinkedMissionsMap(previousLinkedMissions);
      }
      console.error("Error updating goal:", error);
      toast({
        title: "Failed to update goal",
        description: error instanceof Error ? error.message : "Please try again",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderGoalForm = (formData: GoalFormData, setFormData: (fn: (prev: GoalFormData) => GoalFormData) => void, onSubmit: () => void, submitLabel: string, showCategorySelect: boolean) => (
    <form className="space-y-4 mt-4" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); onSubmit(); }}>
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
        <RichTextArea
          id="goal-description"
          placeholder="What does achieving this goal look like?"
          value={formData.description}
          onChange={(val) => setFormData(prev => ({ ...prev, description: val }))}
          textareaClassName="bg-background/50 border-primary/30 min-h-[80px]"
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
        type="submit"
        className="w-full mt-4 text-sm font-mono px-4 py-2.5 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors disabled:opacity-40 inline-flex items-center justify-center"
        disabled={!formData.title.trim() || isSubmitting}
      >
        {isSubmitting ? "Saving..." : submitLabel}
      </button>
    </form>
  );

  return (
      <div className="pb-20">
        <div className="mb-4 flex items-center justify-between">
          <Button 
            className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs" 
            size="sm"
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
              <Button className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 font-mono text-xs" size="sm" onClick={() => handleOpenCreate()}>
                Create Objective
              </Button>
            </DialogTrigger>
            <DialogContent
              className="glassmorphic border-primary/30 w-full max-w-full max-h-full left-0 top-12 h-[calc(100%-6rem)] translate-x-0 translate-y-0 rounded-t-xl rounded-b-xl sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[90vh] sm:h-auto sm:rounded-lg overflow-y-auto pb-20 sm:pb-6"
              onOpenAutoFocus={(e) => e.preventDefault()}
              onPointerDownOutside={(e) => e.preventDefault()}
              onInteractOutside={(e) => e.preventDefault()}
            >
              <DialogHeader>
                <DialogTitle className="font-orbitron text-xl">Create New Objective</DialogTitle>
                <DialogDescription className="sr-only">Fill out the form to create a new vision objective</DialogDescription>
              </DialogHeader>
              {renderGoalForm(createFormData, setCreateFormData, handleCreateGoal, "Create Objective", true)}
            </DialogContent>
          </Dialog>
        </div>
        
        <div className="mb-6">
          <h1 className="text-2xl font-orbitron mb-1">Vision</h1>
          <p className="text-muted-foreground">Set mission objectives for each time horizon and check them off as you reach them</p>
        </div>

        <Dialog open={isEditOpen} onOpenChange={(open) => {
          setIsEditOpen(open);
          if (!open) {
            setEditFormData(defaultFormData);
            setEditingGoalId(null);
          }
        }}>
          <DialogContent
            className="glassmorphic border-primary/30 w-full max-w-full max-h-full left-0 top-12 h-[calc(100%-6rem)] translate-x-0 translate-y-0 rounded-t-xl rounded-b-xl sm:top-[50%] sm:left-[50%] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:max-w-lg sm:max-h-[90vh] sm:h-auto sm:rounded-lg overflow-y-auto pb-20 sm:pb-6"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onPointerDownOutside={(e) => e.preventDefault()}
            onInteractOutside={(e) => e.preventDefault()}
          >
            <DialogHeader>
              <DialogTitle className="font-orbitron text-xl flex items-center gap-2">
                <Edit2 className="h-5 w-5" />
                Edit Goal
              </DialogTitle>
              <DialogDescription className="sr-only">Edit the details of your vision goal</DialogDescription>
            </DialogHeader>
            {renderGoalForm(editFormData, setEditFormData, handleEditGoal, "Save Changes", true)}
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
                <DroppableCategory
                  category={widget.id}
                  onDropGoal={(item, targetCategory) => {
                    handleMoveToCategory(item.goalId, targetCategory);
                  }}
                >
                  <ObjectiveList
                    category={widget.id}
                    placeholder={widget.placeholder}
                    goals={goals}
                    linkedMissions={getLinkedMissionsForCategory(widget.id)}
                    isLoading={goalsQueryLoading && goals.length === 0}
                    onCreateGoal={handleOpenCreate}
                    onEditGoal={handleOpenEdit}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                    onReorder={handleReorder}
                  />
                </DroppableCategory>
              </CollapsibleWidget>
            );
          })}
        </div>
      </div>
  );
}
