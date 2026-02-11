import { useState, useCallback, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { usePageTitle } from "@/hooks/use-page-title";
import { useAuth } from "@/lib/authContext";
import { useWidgetState } from "@/hooks/use-widget-state";
import { ArrowLeft, Eye, Compass, Flame, Target, Milestone } from "lucide-react";
import { Button } from "@/components/ui/button";
import update from 'immutability-helper';
import { CollapsibleWidget } from '@/components/ui/collapsible-widget';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface VisionWidget {
  id: string;
  title: string;
  icon: React.ReactNode;
  dataKey: string;
  stateKey: string;
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
    },
    {
      id: '10year',
      title: '10-Year Vision',
      icon: <Target className="h-5 w-5 text-primary" />,
      dataKey: 'vision10Year',
      stateKey: 'goals.10year-vision',
    },
    {
      id: '5year',
      title: '5-Year Vision',
      icon: <Compass className="h-5 w-5 text-primary" />,
      dataKey: 'vision5Year',
      stateKey: 'goals.5year-vision',
    },
    {
      id: '18month',
      title: '18-Month Vision',
      icon: <Milestone className="h-5 w-5 text-primary" />,
      dataKey: 'vision18Month',
      stateKey: 'goals.18month-vision',
    },
    {
      id: '90day',
      title: '90-Day Vision',
      icon: <Flame className="h-5 w-5 text-primary" />,
      dataKey: 'vision90Day',
      stateKey: 'goals.90day-vision',
    },
  ]);

  const { data: widgetLayouts } = useQuery<Record<string, string[]>>({
    queryKey: ['/api/widget-layouts'],
    enabled: !!user,
  });

  const layoutAppliedRef = useRef(false);
  useEffect(() => {
    if (!widgetLayouts || layoutAppliedRef.current) return;
    layoutAppliedRef.current = true;
    if (widgetLayouts.vision) {
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
        return ordered;
      });
    }
  }, [widgetLayouts]);

  const moveWidget = useCallback((dragIndex: number, hoverIndex: number) => {
    setWidgets((prev) => {
      const newWidgets = update(prev, {
        $splice: [
          [dragIndex, 1],
          [hoverIndex, 0, prev[dragIndex]],
        ],
      });
      const newOrder = newWidgets.map(w => w.id);
      apiRequest('/api/widget-layouts', {
        method: 'PUT',
        body: JSON.stringify({ page: 'vision', order: newOrder }),
      });
      queryClient.setQueryData<Record<string, string[]>>(['/api/widget-layouts'], (old) => ({
        ...old,
        vision: newOrder,
      }));
      return newWidgets;
    });
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
                <span className="text-sm text-foreground">
                  {profileData?.[widget.dataKey] || "\u2014"}
                </span>
              </CollapsibleWidget>
            );
          })}
        </div>
      </div>
  );
}
