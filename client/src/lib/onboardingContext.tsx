import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { TooltipGuide } from '@/components/ui/guide-tooltip';
import { toast } from '@/hooks/use-toast';

// Collection of application tooltips
export const APP_GUIDES: Record<string, TooltipGuide> = {
  // Dashboard guides
  dashboard_welcome: {
    id: 'dashboard_welcome',
    title: 'LYFE OS Command Center',
    content: 'Welcome to your personal command center. This dashboard is designed to help you track your daily progress, manage tasks, and maintain your life operating system. Each section serves a specific purpose in optimizing your productivity and well-being.',
    placement: 'bottom',
    dismissible: true,
    showOnce: true,
    delay: 1000,
  },
  stats_overview: {
    id: 'stats_overview',
    title: 'Core Life Metrics',
    content: 'These are your vital signs - Attention Tokens for mental focus, Time Tokens for time management, Energy Points for physical capacity, and Health Points for overall wellbeing. Each stat influences your daily performance and can be improved through consistent habits.',
    placement: 'right',
    dismissible: true,
    showOnce: true,
  },
  mission_log: {
    id: 'mission_log',
    title: 'Daily Mission Timeline',
    content: 'Your missions appear here in chronological order. Completed missions reward XP and stat boosts. Color-coding helps categorize missions by type: blue for work tasks, green for health activities, and purple for personal development.',
    placement: 'right',
    dismissible: true,
    showOnce: true,
  },
  
  // Codex guides
  codex_welcome: {
    id: 'codex_welcome',
    title: 'The LYFE OS Codex',
    content: 'Your knowledge repository stores all mission logs, journal entries, and notes. Think of it as your second brain - everything is searchable and interconnected through wiki-links, making information retrieval effortless.',
    placement: 'bottom',
    dismissible: true,
    showOnce: true,
    delay: 1000,
  },
  mission_page_create: {
    id: 'mission_page_create',
    title: 'Create Mission Pages',
    content: 'Document objectives, track progress, and store resources related to your missions. Pages are automatically saved and can be linked to each other for a more powerful knowledge network.',
    placement: 'left',
    dismissible: true,
    showOnce: true,
  },
  
  // Markdown editor guides
  markdown_basics: {
    id: 'markdown_basics',
    title: 'Enhanced Markdown Editor',
    content: 'Format your text like in Obsidian: **bold**, *italic*, and create lists with - or 1. Use - [ ] and - [x] for interactive task lists. All changes are auto-saved as you type.',
    placement: 'bottom',
    dismissible: true,
    showOnce: true,
  },
  wiki_links: {
    id: 'wiki_links',
    title: 'Knowledge Connections',
    content: 'Create instant links between pages using the [[Page Name]] syntax. This builds a network of connected thoughts and information, making your knowledge base more powerful and accessible.',
    placement: 'bottom',
    dismissible: true,
    showOnce: true,
  },
  
  // AI companion guides
  ai_companion_intro: {
    id: 'ai_companion_intro',
    title: 'Your AI Companion',
    content: "I'm your personal assistant in LYFE OS. I can help prioritize tasks, provide insights on your metrics, offer creative solutions, and support your productivity goals. Just click the AI button to interact with me.",
    placement: 'left',
    dismissible: true,
    showOnce: true,
    delay: 2000,
  },
  chat_session: {
    id: 'chat_session',
    title: 'Specialized Conversations',
    content: 'Create different chat sessions for various aspects of your life - one for work projects, another for health goals, or a third for creative endeavors. This keeps your conversations organized and contextual.',
    placement: 'right',
    dismissible: true,
    showOnce: true,
  },
  
  // Settings guides
  settings_intro: {
    id: 'settings_intro',
    title: 'LYFE OS Customization',
    content: 'Make LYFE OS truly yours by customizing the interface, AI companion, and guidance system. Your preferences are automatically saved and applied across the system.',
    placement: 'bottom',
    dismissible: true,
    showOnce: true,
    delay: 1000,
  },
  companion_name: {
    id: 'companion_name',
    title: 'Personalize Your AI',
    content: 'Give your AI companion a name that resonates with you. This creates a more personal connection and tailored experience as you interact with your digital assistant.',
    placement: 'right',
    dismissible: true,
    showOnce: true,
  },
};

// Onboarding steps
export enum OnboardingStep {
  Welcome = 'welcome',
  Dashboard = 'dashboard',
  Stats = 'stats',
  Missions = 'missions',
  Codex = 'codex',
  AI = 'ai',
  Complete = 'complete',
}

interface OnboardingContextType {
  currentStep: OnboardingStep;
  setCurrentStep: (step: OnboardingStep) => void;
  completedSteps: Record<string, boolean>;
  markStepCompleted: (step: OnboardingStep) => void;
  isOnboardingComplete: boolean;
  restartOnboarding: () => void;
  dismissedTooltips: Record<string, boolean>;
  dismissTooltip: (id: string) => void;
  completeTooltip: (id: string) => void;
  showGuideToast: (message: string, title?: string, characterName?: string) => void;
  enabledGuides: Record<string, boolean>;
  setGuideEnabled: (id: string, enabled: boolean) => void;
}

const OnboardingContext = createContext<OnboardingContextType | undefined>(undefined);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  // Load onboarding state from localStorage
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(() => {
    const savedStep = localStorage.getItem('onboarding_current_step');
    return savedStep ? (savedStep as OnboardingStep) : OnboardingStep.Welcome;
  });
  
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>(() => {
    const savedSteps = localStorage.getItem('onboarding_completed_steps');
    return savedSteps ? JSON.parse(savedSteps) : {};
  });
  
  const [dismissedTooltips, setDismissedTooltips] = useState<Record<string, boolean>>(() => {
    const savedDismissed = localStorage.getItem('dismissed_tooltips');
    return savedDismissed ? JSON.parse(savedDismissed) : {};
  });
  
  const [enabledGuides, setEnabledGuides] = useState<Record<string, boolean>>(() => {
    const savedEnabled = localStorage.getItem('enabled_guides');
    // Default all guides to enabled if not set
    return savedEnabled ? JSON.parse(savedEnabled) : Object.keys(APP_GUIDES).reduce((acc, key) => {
      acc[key] = true;
      return acc;
    }, {} as Record<string, boolean>);
  });
  
  // Check if onboarding is complete
  const isOnboardingComplete = currentStep === OnboardingStep.Complete;
  
  // Save state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('onboarding_current_step', currentStep);
  }, [currentStep]);
  
  useEffect(() => {
    localStorage.setItem('onboarding_completed_steps', JSON.stringify(completedSteps));
  }, [completedSteps]);
  
  useEffect(() => {
    localStorage.setItem('dismissed_tooltips', JSON.stringify(dismissedTooltips));
  }, [dismissedTooltips]);
  
  useEffect(() => {
    localStorage.setItem('enabled_guides', JSON.stringify(enabledGuides));
  }, [enabledGuides]);
  
  // Mark a step as completed
  const markStepCompleted = (step: OnboardingStep) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [step]: true,
    }));
    
    // Automatically advance to the next step
    if (step === OnboardingStep.Welcome) setCurrentStep(OnboardingStep.Dashboard);
    else if (step === OnboardingStep.Dashboard) setCurrentStep(OnboardingStep.Stats);
    else if (step === OnboardingStep.Stats) setCurrentStep(OnboardingStep.Missions);
    else if (step === OnboardingStep.Missions) setCurrentStep(OnboardingStep.Codex);
    else if (step === OnboardingStep.Codex) setCurrentStep(OnboardingStep.AI);
    else if (step === OnboardingStep.AI) setCurrentStep(OnboardingStep.Complete);
  };
  
  // Restart the onboarding process
  const restartOnboarding = () => {
    setCurrentStep(OnboardingStep.Welcome);
    setCompletedSteps({});
    localStorage.removeItem('viewed_tooltips');
    setDismissedTooltips({});
  };
  
  // Dismiss a tooltip
  const dismissTooltip = (id: string) => {
    setDismissedTooltips((prev) => ({
      ...prev,
      [id]: true,
    }));
  };
  
  // Complete a tooltip
  const completeTooltip = (id: string) => {
    // Nothing additional needed here as the GuideTooltip component
    // already handles storing completed tooltips in localStorage
  };
  
  // Show a character-driven toast notification
  const showGuideToast = (message: string, title = "Hint", characterName = "Nova") => {
    toast({
      title: `${characterName}: ${title}`,
      description: message,
      variant: "default",
      className: "bg-[#001E26] border border-[#36F1CD]/50 text-white",
      duration: 5000,
    });
  };
  
  // Enable or disable a guide
  const setGuideEnabled = (id: string, enabled: boolean) => {
    setEnabledGuides((prev) => ({
      ...prev,
      [id]: enabled,
    }));
  };
  
  return (
    <OnboardingContext.Provider
      value={{
        currentStep,
        setCurrentStep,
        completedSteps,
        markStepCompleted,
        isOnboardingComplete,
        restartOnboarding,
        dismissedTooltips,
        dismissTooltip,
        completeTooltip,
        showGuideToast,
        enabledGuides,
        setGuideEnabled,
      }}
    >
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (context === undefined) {
    throw new Error('useOnboarding must be used within an OnboardingProvider');
  }
  return context;
}