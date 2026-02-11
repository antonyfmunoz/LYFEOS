import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { useWidgetState } from "@/hooks/use-widget-state";
import { ArrowLeft, Eye, Compass, Flame, Target, Milestone, Edit2, Save, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import update from 'immutability-helper';
import { CollapsibleWidget } from '@/components/ui/collapsible-widget';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from "@/hooks/use-toast";

interface VisionWidget {
  id: string;
  title: string;
  icon: React.ReactNode;
  dataKey: string;
  stateKey: string;
  placeholder: string;
}

function VisionEditor({ dataKey, value, placeholder }: { dataKey: string; value: string; placeholder: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || "");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(textareaRef.current.value.length, textareaRef.current.value.length);
    }
  }, [editing]);

  const saveMutation = useMutation({
    mutationFn: async (text: string) => {
      await apiRequest('/api/profile', {
        method: 'PATCH',
        body: JSON.stringify({ [dataKey]: text }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
      setEditing(false);
      toast({ title: "Vision saved", description: "Your goals have been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save. Please try again.", variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate(draft.trim());
  };

  const handleCancel = () => {
    setDraft(value || "");
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <Textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="min-h-[120px] bg-card/30 border-primary/30 focus-visible:ring-primary/30 text-sm text-foreground resize-y"
        />
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="bg-primary/20 border border-primary/50 text-primary hover:bg-primary/30 gap-1.5"
          >
            {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Save
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCancel}
            disabled={saveMutation.isPending}
            className="text-muted-foreground hover:text-foreground gap-1.5"
          >
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group relative">
      {value ? (
        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{value}</p>
      ) : (
        <p className="text-sm text-muted-foreground italic">{placeholder}</p>
      )}
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setEditing(true)}
        className="mt-2 text-primary hover:bg-primary/10 gap-1.5 h-8 text-xs"
      >
        <Edit2 className="h-3 w-3" />
        {value ? "Edit" : "Write your vision"}
      </Button>
    </div>
  );
}

export default function GoalsArchivePage() {
  usePageTitle('Vision');

  const { user } = useAuth();
  const [, navigate] = useLocation();

  const { data: profileData } = useQuery<any>({
    queryKey: ["/api/profile"],
    enabled: !!user?.id,
  });

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
      dataKey: 'vision10YearLegacy',
      stateKey: 'goals.legacy-vision',
      placeholder: "What legacy do you want to leave behind? What impact do you want to make on the world?",
    },
    {
      id: '10year',
      title: '10-Year Vision',
      icon: <Target className="h-5 w-5 text-primary" />,
      dataKey: 'vision10Year',
      stateKey: 'goals.10year-vision',
      placeholder: "Where do you see yourself in 10 years? Describe your ideal life, career, and relationships.",
    },
    {
      id: '5year',
      title: '5-Year Vision',
      icon: <Compass className="h-5 w-5 text-primary" />,
      dataKey: 'vision5Year',
      stateKey: 'goals.5year-vision',
      placeholder: "What do you want to achieve in the next 5 years? Think about major milestones and goals.",
    },
    {
      id: '18month',
      title: '18-Month Vision',
      icon: <Milestone className="h-5 w-5 text-primary" />,
      dataKey: 'vision18Month',
      stateKey: 'goals.18month-vision',
      placeholder: "What are your key goals for the next 18 months? What projects, skills, or habits will you focus on?",
    },
    {
      id: '90day',
      title: '90-Day Vision',
      icon: <Flame className="h-5 w-5 text-primary" />,
      dataKey: 'vision90Day',
      stateKey: 'goals.90day-vision',
      placeholder: "What are your top priorities for the next 90 days? Be specific about what you'll accomplish.",
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
          <p className="text-[#7DAAB2]">Document your life vision and goals at different time horizons</p>
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
                <VisionEditor
                  dataKey={widget.dataKey}
                  value={profileData?.[widget.dataKey] || ""}
                  placeholder={widget.placeholder}
                />
              </CollapsibleWidget>
            );
          })}
        </div>
      </div>
  );
}
