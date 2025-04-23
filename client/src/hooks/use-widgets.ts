import { useState, useEffect } from 'react';

export interface Widget {
  id: string;
  type: string;
  title: string;
  enabled: boolean;
  icon?: string;
}

// Default widget configurations
export const DEFAULT_SYSTEM_WIDGETS: Widget[] = [
  { id: 'calendar', type: 'calendar', title: 'Calendar', enabled: true },
  { id: 'kanban', type: 'kanban', title: 'Boards', enabled: true },
  { id: 'rolodex', type: 'rolodex', title: 'Rolodex', enabled: true },
  { id: 'spreadsheets', type: 'spreadsheets', title: 'Spreadsheets', enabled: true },
  { id: 'canvas', type: 'canvas', title: 'Canvas', enabled: true },
  { id: 'graph', type: 'graph', title: 'Knowledge Graph', enabled: true },
  { id: 'documents', type: 'documents', title: 'Documents', enabled: true },
  { id: 'templates', type: 'templates', title: 'Templates', enabled: true },
];

export const DEFAULT_DASHBOARD_WIDGETS: Widget[] = [
  { id: 'stats', type: 'stats', title: 'Stats', enabled: true },
  { id: 'mission', type: 'mission', title: 'Mission Log', enabled: true },
  { id: 'timeline', type: 'timeline', title: 'Timeline', enabled: true },
  { id: 'reflection', type: 'reflection', title: 'Daily Reflection', enabled: true },
  { id: 'routine', type: 'routine', title: 'Routine', enabled: true },
];

export function useWidgets(pageType: 'system' | 'dashboard') {
  // Get the appropriate default widgets based on the page type
  const getDefaultWidgets = () => {
    return pageType === 'system' ? DEFAULT_SYSTEM_WIDGETS : DEFAULT_DASHBOARD_WIDGETS;
  };

  // Initialize widget state from localStorage or defaults
  const [widgets, setWidgets] = useState<Widget[]>(() => {
    const storageKey = `${pageType}Widgets`;
    const savedWidgets = localStorage.getItem(storageKey);
    
    if (savedWidgets) {
      try {
        return JSON.parse(savedWidgets);
      } catch (e) {
        console.error(`Failed to parse saved ${pageType} widgets:`, e);
        return getDefaultWidgets();
      }
    }
    
    return getDefaultWidgets();
  });

  // Save widgets to localStorage whenever they change
  useEffect(() => {
    const storageKey = `${pageType}Widgets`;
    localStorage.setItem(storageKey, JSON.stringify(widgets));
  }, [widgets, pageType]);

  // Function to move a widget from one position to another
  const moveWidget = (dragIndex: number, hoverIndex: number) => {
    setWidgets((prevWidgets) => {
      const result = Array.from(prevWidgets);
      const [removed] = result.splice(dragIndex, 1);
      result.splice(hoverIndex, 0, removed);
      return result;
    });
  };

  // Function to toggle widget visibility
  const toggleWidget = (id: string) => {
    setWidgets((prevWidgets) =>
      prevWidgets.map((widget) =>
        widget.id === id ? { ...widget, enabled: !widget.enabled } : widget
      )
    );
  };

  // Function to reset widgets to default order
  const resetWidgets = () => {
    setWidgets(getDefaultWidgets());
  };

  return {
    widgets,
    moveWidget,
    toggleWidget,
    resetWidgets,
  };
}