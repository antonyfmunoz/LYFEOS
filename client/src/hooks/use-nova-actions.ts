import { useCallback } from 'react';
import { useLocation } from 'wouter';
import { useLYFEOS } from '@/lib/context';
import { apiRequest, queryClient } from '@/lib/queryClient';

export interface NovaToolAction {
  success?: boolean;
  action?: string;
  message?: string;
  widgetId?: string;
  open?: boolean;
  route?: string;
  affirmationText?: string;
  dark?: boolean;
  missionId?: number;
  levelUp?: boolean;
  xpAwarded?: number;
  [key: string]: any;
}

export function useNovaActions() {
  const [, navigate] = useLocation();
  const {
    quests,
    startMissionTimer,
    pauseResumeTimer,
    endMissionTimer,
    activeTimerQuest,
    timerIsPaused,
    timerStartedAt,
    timerPausedElapsed,
  } = useLYFEOS();

  const executeToolAction = useCallback((toolAction: NovaToolAction) => {
    const action = toolAction.action;
    if (!action) return;

    switch (action) {
      case 'navigate': {
        if (toolAction.route?.startsWith('/')) {
          navigate(toolAction.route);
        }
        break;
      }

      case 'toggle_widget': {
        if (toolAction.widgetId) {
          const openVal = toolAction.open !== false;
          queryClient.setQueryData<Record<string, boolean>>(["/api/widget-states"], (prev) => ({
            ...prev,
            [toolAction.widgetId!]: openVal,
          }));
          window.dispatchEvent(new CustomEvent("widget-state-changed", {
            detail: { widgetId: toolAction.widgetId, open: openVal },
          }));
          apiRequest("/api/widget-states", {
            method: "PUT",
            body: JSON.stringify({ widgetId: toolAction.widgetId, isOpen: openVal }),
          }).catch(() => {});
          navigate('/dashboard');
        }
        break;
      }

      case 'play_affirmation': {
        if (toolAction.affirmationText && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(toolAction.affirmationText);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          const voices = window.speechSynthesis.getVoices();
          const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Female'))
            || voices.find(v => v.lang.startsWith('en'));
          if (preferred) utterance.voice = preferred;
          window.speechSynthesis.speak(utterance);
        }
        break;
      }

      case 'generate_affirmation': {
        queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
        if (toolAction.affirmationText && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(toolAction.affirmationText);
          utterance.rate = 1.0;
          utterance.pitch = 1.0;
          window.speechSynthesis.speak(utterance);
        }
        break;
      }

      case 'update_daily_log': {
        queryClient.invalidateQueries({ queryKey: ['/api/users'] });
        queryClient.invalidateQueries({ predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key.some(k => typeof k === 'string' && k.includes('daily-log'));
        }});
        break;
      }

      case 'stop_affirmation': {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        break;
      }

      case 'toggle_theme': {
        queryClient.invalidateQueries({ queryKey: ['/api/user-stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/stats'] });
        break;
      }

      case 'start_mission_timer': {
        const mId = String(toolAction.missionId);
        const mission = mId
          ? quests.find(q => q.id === mId)
          : null;
        if (mission) {
          startMissionTimer(mission);
        }
        break;
      }

      case 'pause_timer': {
        if (activeTimerQuest && !timerIsPaused) {
          pauseResumeTimer();
        }
        break;
      }

      case 'resume_timer': {
        if (activeTimerQuest && timerIsPaused) {
          pauseResumeTimer();
        }
        break;
      }

      case 'end_timer': {
        if (activeTimerQuest && timerStartedAt) {
          const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000) + (timerPausedElapsed || 0);
          endMissionTimer(elapsed);
        }
        break;
      }

      default:
        break;
    }
  }, [quests, startMissionTimer, pauseResumeTimer, endMissionTimer, activeTimerQuest, timerIsPaused, timerStartedAt, timerPausedElapsed, navigate]);

  const executeToolActions = useCallback((toolActions: NovaToolAction[]) => {
    for (const ta of toolActions) {
      executeToolAction(ta);
    }
    if (toolActions.some(ta => ta.action === 'complete_mission' || ta.action === 'create_mission' || ta.action === 'terminate_mission' || ta.action === 'restore_mission' || ta.action === 'update_mission')) {
      queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/user-stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quests/archived"] });
    }
    if (toolActions.some(ta => ta.action === 'create_calendar_event')) {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
    }
    if (toolActions.some(ta => ta.action === 'update_profile' || ta.action === 'generate_affirmation')) {
      queryClient.invalidateQueries({ queryKey: ["/api/profile"] });
    }
  }, [executeToolAction]);

  return { executeToolAction, executeToolActions };
}
