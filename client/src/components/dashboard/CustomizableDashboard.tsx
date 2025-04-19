import React, { useState, useEffect } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { DashboardWidget, DashboardLayout, UserStats, CalendarEvent } from '@/lib/types';
import CompactStatsWidget from './CompactStatsWidget';
import MissionLogWidget from './MissionLogWidget';
import { Plus, Trash2, Save, Settings, Copy, PanelLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLYFEOS } from '@/lib/context';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';

// Default stats if no stats are available yet
const defaultStats: UserStats = {
  attentionTokens: {
    current: 10,
    max: 10,
  },
  timeTokens: {
    current: 10,
    max: 10,
  },
  energyPoints: {
    current: 10,
    max: 10,
  },
  healthPoints: {
    current: 10,
    max: 10,
  },
  experience: {
    current: 0,
    max: 100,
    level: 1,
  },
  streakDays: 0,
  efficiencyScore: 0,
};

const ResponsiveGridLayout = WidthProvider(Responsive);

// Set up default layout for first-time users
const defaultWidgets: DashboardWidget[] = [
  {
    id: 'stats-widget',
    type: 'stats',
    title: 'Stats',
    x: 0,
    y: 0,
    w: 12,
    h: 2,
  },
  {
    id: 'missions-widget',
    type: 'missions',
    title: 'Missions',
    x: 0,
    y: 2,
    w: 7,
    h: 5,
  },
  {
    id: 'time-widget',
    type: 'time',
    title: 'Current Time',
    x: 7,
    y: 2,
    w: 5,
    h: 2,
  },
  {
    id: 'markdown-widget',
    type: 'markdown',
    title: 'Notes',
    content: '## Today\'s Focus\n- Complete main tasks\n- Review progress\n- Plan for tomorrow',
    x: 7,
    y: 4,
    w: 5,
    h: 3,
  }
];

const defaultLayout: DashboardLayout = {
  id: 'default',
  name: 'Default Layout',
  widgets: defaultWidgets,
  isDefault: true
};

interface CustomizableDashboardProps {
  className?: string;
}

export function CustomizableDashboard({ className }: CustomizableDashboardProps) {
  const { stats } = useLYFEOS();
  const { toast } = useToast();
  
  // State for layouts and widgets
  const [layouts, setLayouts] = useState<DashboardLayout[]>([defaultLayout]);
  const [activeLayout, setActiveLayout] = useState<DashboardLayout>(defaultLayout);
  const [editMode, setEditMode] = useState(false);
  const [widgetLibraryOpen, setWidgetLibraryOpen] = useState(false);
  
  // Try to load saved layouts from localStorage
  useEffect(() => {
    try {
      const savedLayouts = localStorage.getItem('lyfeOsDashboardLayouts');
      if (savedLayouts) {
        const parsedLayouts = JSON.parse(savedLayouts);
        setLayouts(parsedLayouts);
        
        // Find the default or first layout
        const defaultLayout = parsedLayouts.find((l: DashboardLayout) => l.isDefault) || parsedLayouts[0];
        setActiveLayout(defaultLayout);
      }
    } catch (error) {
      console.error('Error loading dashboard layouts:', error);
    }
  }, []);
  
  // Save layouts to localStorage when they change
  useEffect(() => {
    try {
      localStorage.setItem('lyfeOsDashboardLayouts', JSON.stringify(layouts));
    } catch (error) {
      console.error('Error saving dashboard layouts:', error);
    }
  }, [layouts]);
  
  // Handle layout changes from react-grid-layout
  const handleLayoutChange = (currentLayout: any) => {
    if (!editMode) return;
    
    // Update widget positions and sizes in the active layout
    const updatedWidgets = activeLayout.widgets.map(widget => {
      const updatedLayoutItem = currentLayout.find((item: any) => item.i === widget.id);
      if (updatedLayoutItem) {
        return {
          ...widget,
          x: updatedLayoutItem.x,
          y: updatedLayoutItem.y,
          w: updatedLayoutItem.w,
          h: updatedLayoutItem.h
        };
      }
      return widget;
    });
    
    // Update the active layout
    const updatedActiveLayout = {
      ...activeLayout,
      widgets: updatedWidgets
    };
    
    // Update the active layout
    setActiveLayout(updatedActiveLayout);
    
    // Update the layout in the layouts array
    const updatedLayouts = layouts.map(layout => 
      layout.id === activeLayout.id ? updatedActiveLayout : layout
    );
    
    setLayouts(updatedLayouts);
  };
  
  // Create a new empty layout
  const createNewLayout = () => {
    const newLayout: DashboardLayout = {
      id: uuidv4(),
      name: `Layout ${layouts.length + 1}`,
      widgets: []
    };
    
    setLayouts([...layouts, newLayout]);
    setActiveLayout(newLayout);
    setEditMode(true);
    
    toast({
      title: 'New Layout Created',
      description: 'Start adding widgets to your new dashboard layout.',
    });
  };
  
  // Delete the current layout (prevents deleting the last one)
  const deleteCurrentLayout = () => {
    if (layouts.length <= 1) {
      toast({
        title: 'Cannot Delete',
        description: 'You must have at least one dashboard layout.',
        variant: 'destructive'
      });
      return;
    }
    
    const updatedLayouts = layouts.filter(layout => layout.id !== activeLayout.id);
    setLayouts(updatedLayouts);
    setActiveLayout(updatedLayouts[0]);
    
    toast({
      title: 'Layout Deleted',
      description: 'The dashboard layout has been removed.',
    });
  };
  
  // Duplicate the current layout
  const duplicateLayout = () => {
    const duplicatedLayout: DashboardLayout = {
      ...activeLayout,
      id: uuidv4(),
      name: `${activeLayout.name} (Copy)`,
      isDefault: false
    };
    
    setLayouts([...layouts, duplicatedLayout]);
    setActiveLayout(duplicatedLayout);
    
    toast({
      title: 'Layout Duplicated',
      description: 'A copy of the current layout has been created.',
    });
  };
  
  // Set the current layout as default
  const setAsDefault = () => {
    const updatedLayouts = layouts.map(layout => ({
      ...layout,
      isDefault: layout.id === activeLayout.id
    }));
    
    setLayouts(updatedLayouts);
    
    toast({
      title: 'Default Layout Set',
      description: 'This layout will load by default.',
    });
  };
  
  // Add a new widget to the dashboard
  const addWidget = (type: DashboardWidget['type']) => {
    // Find the highest y value to place the new widget at the bottom
    let maxY = 0;
    activeLayout.widgets.forEach(widget => {
      const bottomY = widget.y + widget.h;
      if (bottomY > maxY) maxY = bottomY;
    });
    
    // Create widget based on type
    let newWidget: DashboardWidget;
    
    switch (type) {
      case 'stats':
        newWidget = {
          id: `stats-${uuidv4()}`,
          type: 'stats',
          title: 'Stats',
          x: 0,
          y: maxY,
          w: 12,
          h: 2,
        };
        break;
      case 'missions':
        newWidget = {
          id: `missions-${uuidv4()}`,
          type: 'missions',
          title: 'Missions',
          x: 0,
          y: maxY,
          w: 7,
          h: 5,
        };
        break;
      case 'time':
        newWidget = {
          id: `time-${uuidv4()}`,
          type: 'time',
          title: 'Current Time',
          x: 0,
          y: maxY,
          w: 5,
          h: 2,
        };
        break;
      case 'markdown':
        newWidget = {
          id: `markdown-${uuidv4()}`,
          type: 'markdown',
          title: 'Notes',
          content: '## Your Notes Here\nStart typing to add content...',
          x: 0,
          y: maxY,
          w: 6,
          h: 4,
        };
        break;
      case 'calendar':
        newWidget = {
          id: `calendar-${uuidv4()}`,
          type: 'calendar',
          title: 'Calendar',
          x: 0,
          y: maxY,
          w: 6,
          h: 5,
        };
        break;
      case 'weather':
        newWidget = {
          id: `weather-${uuidv4()}`,
          type: 'weather',
          title: 'Weather',
          x: 0,
          y: maxY,
          w: 4,
          h: 3,
        };
        break;
      default:
        newWidget = {
          id: `custom-${uuidv4()}`,
          type: 'custom',
          title: 'Custom Widget',
          x: 0,
          y: maxY,
          w: 6,
          h: 4,
        };
    }
    
    // Add the new widget to the active layout
    const updatedWidgets = [...activeLayout.widgets, newWidget];
    const updatedActiveLayout = {
      ...activeLayout,
      widgets: updatedWidgets
    };
    
    setActiveLayout(updatedActiveLayout);
    
    // Update the layouts array
    const updatedLayouts = layouts.map(layout => 
      layout.id === activeLayout.id ? updatedActiveLayout : layout
    );
    
    setLayouts(updatedLayouts);
    setWidgetLibraryOpen(false);
    
    toast({
      title: 'Widget Added',
      description: `A new ${type} widget has been added to your dashboard.`,
    });
  };
  
  // Remove a widget from the dashboard
  const removeWidget = (widgetId: string) => {
    const updatedWidgets = activeLayout.widgets.filter(widget => widget.id !== widgetId);
    const updatedActiveLayout = {
      ...activeLayout,
      widgets: updatedWidgets
    };
    
    setActiveLayout(updatedActiveLayout);
    
    // Update the layouts array
    const updatedLayouts = layouts.map(layout => 
      layout.id === activeLayout.id ? updatedActiveLayout : layout
    );
    
    setLayouts(updatedLayouts);
    
    toast({
      title: 'Widget Removed',
      description: 'The widget has been removed from your dashboard.',
    });
  };
  
  // Generate widget component based on type
  const renderWidget = (widget: DashboardWidget) => {
    switch (widget.type) {
      case 'stats':
        return <CompactStatsWidget stats={stats || defaultStats} />;
      case 'missions':
        return <MissionLogWidget events={[]} maxHeight="72" compact={true} />;
      case 'time':
        return (
          <div className="glassmorphic h-full w-full flex flex-col items-center justify-center">
            <div className="text-3xl font-mono text-primary">
              {new Date().toLocaleTimeString()}
            </div>
            <div className="text-sm text-muted-foreground">
              {new Date().toLocaleDateString()}
            </div>
          </div>
        );
      case 'markdown':
        return (
          <div className="glassmorphic h-full w-full p-4 overflow-auto">
            <div className="prose prose-invert prose-sm max-w-none">
              {widget.content}
            </div>
          </div>
        );
      case 'calendar':
        return (
          <div className="glassmorphic h-full w-full p-4">
            <h3 className="text-lg font-orbitron mb-2">Calendar</h3>
            <div className="text-sm text-muted-foreground">
              Calendar widget (placeholder)
            </div>
          </div>
        );
      case 'weather':
        return (
          <div className="glassmorphic h-full w-full p-4 flex flex-col items-center justify-center">
            <h3 className="text-lg font-orbitron mb-2">Weather</h3>
            <span className="material-icons text-3xl text-cyan-500">cloud</span>
            <div className="text-2xl">23°C</div>
            <div className="text-sm text-muted-foreground">New York, NY</div>
          </div>
        );
      default:
        return (
          <div className="glassmorphic h-full w-full p-4">
            <h3 className="text-lg font-orbitron mb-2">{widget.title}</h3>
            <div className="text-sm text-muted-foreground">
              Custom widget (configurable)
            </div>
          </div>
        );
    }
  };
  
  return (
    <div className={`relative ${className}`}>
      {/* Dashboard toolbar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <select 
            className="bg-background/50 border border-primary/30 rounded px-2 py-1 text-sm"
            value={activeLayout.id}
            onChange={(e) => {
              const selectedLayout = layouts.find(layout => layout.id === e.target.value);
              if (selectedLayout) setActiveLayout(selectedLayout);
            }}
          >
            {layouts.map(layout => (
              <option key={layout.id} value={layout.id}>
                {layout.name} {layout.isDefault ? '(Default)' : ''}
              </option>
            ))}
          </select>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={createNewLayout}
          >
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>
        
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setWidgetLibraryOpen(!widgetLibraryOpen)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Widget
              </Button>
              
              <Button 
                variant="default" 
                size="sm"
                onClick={() => setEditMode(false)}
              >
                <Save className="h-4 w-4 mr-1" />
                Save Layout
              </Button>
            </>
          ) : (
            <>
              <Button 
                variant="outline" 
                size="sm"
                onClick={duplicateLayout}
              >
                <Copy className="h-4 w-4 mr-1" />
                Duplicate
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={setAsDefault}
                disabled={activeLayout.isDefault}
              >
                Set Default
              </Button>
              
              <Button 
                variant="outline" 
                size="sm"
                onClick={deleteCurrentLayout}
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete
              </Button>
              
              <Button 
                variant="default" 
                size="sm"
                onClick={() => setEditMode(true)}
              >
                <Settings className="h-4 w-4 mr-1" />
                Edit Layout
              </Button>
            </>
          )}
        </div>
      </div>
      
      {/* Widget library sidebar (shown in edit mode) */}
      {widgetLibraryOpen && editMode && (
        <div className="absolute top-14 right-0 z-10 w-64 glassmorphic border border-primary/30 rounded-lg p-4 shadow-lg">
          <h3 className="text-lg font-orbitron mb-3">Widget Library</h3>
          <div className="space-y-2">
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              onClick={() => addWidget('stats')}
            >
              <span className="material-icons mr-2 text-primary text-sm">auto_graph</span>
              Stats Widget
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              onClick={() => addWidget('missions')}
            >
              <span className="material-icons mr-2 text-primary text-sm">track_changes</span>
              Mission Log
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              onClick={() => addWidget('time')}
            >
              <span className="material-icons mr-2 text-primary text-sm">schedule</span>
              Time & Date
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              onClick={() => addWidget('markdown')}
            >
              <span className="material-icons mr-2 text-primary text-sm">description</span>
              Notes (Markdown)
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              onClick={() => addWidget('calendar')}
            >
              <span className="material-icons mr-2 text-primary text-sm">calendar_today</span>
              Calendar
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              onClick={() => addWidget('weather')}
            >
              <span className="material-icons mr-2 text-primary text-sm">cloud</span>
              Weather
            </Button>
            <Button 
              variant="ghost" 
              className="w-full justify-start" 
              onClick={() => addWidget('custom')}
            >
              <span className="material-icons mr-2 text-primary text-sm">widgets</span>
              Custom Widget
            </Button>
          </div>
        </div>
      )}
      
      {/* The reactive grid layout */}
      <ResponsiveGridLayout
        className="layout"
        layouts={{
          lg: activeLayout.widgets.map(widget => ({
            i: widget.id,
            x: widget.x,
            y: widget.y,
            w: widget.w,
            h: widget.h,
            isDraggable: editMode && (widget.isDraggable !== false),
            isResizable: editMode && (widget.isResizable !== false),
            static: widget.static || false
          }))
        }}
        breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
        cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
        rowHeight={100}
        onLayoutChange={handleLayoutChange}
        isDraggable={editMode}
        isResizable={editMode}
        margin={[16, 16]}
      >
        {activeLayout.widgets.map(widget => (
          <div key={widget.id} className="relative">
            {/* Widget content */}
            {renderWidget(widget)}
            
            {/* Widget overlay in edit mode */}
            {editMode && (
              <div className="absolute top-0 right-0 p-1">
                <button
                  className="bg-black/50 hover:bg-black/70 text-white rounded-full p-1"
                  onClick={() => removeWidget(widget.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ))}
      </ResponsiveGridLayout>
    </div>
  );
}