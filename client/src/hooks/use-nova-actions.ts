import { useCallback } from 'react';
import { useLocation } from 'wouter';
import { useLYFEOS } from '@/lib/context';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { startThetaBeats, stopThetaBeats } from '@/lib/theta-beats';

let affirmationLoopActive = false;

function speakWithLoop(text: string, voice?: SpeechSynthesisVoice | null) {
  if (!affirmationLoopActive) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.92;
  utterance.pitch = 1.0;
  if (voice) utterance.voice = voice;
  utterance.onend = () => {
    if (affirmationLoopActive) {
      setTimeout(() => speakWithLoop(text, voice), 1500);
    }
  };
  utterance.onerror = () => {
    if (affirmationLoopActive) {
      setTimeout(() => speakWithLoop(text, voice), 2000);
    }
  };
  window.speechSynthesis.speak(utterance);
}

async function startAffirmationSession(text: string) {
  if (!('speechSynthesis' in window)) return;
  stopAffirmationSession();
  affirmationLoopActive = true;
  await startThetaBeats();
  const voices = window.speechSynthesis.getVoices();
  const preferred = voices.find(v => v.lang.startsWith('en') && v.name.includes('Female'))
    || voices.find(v => v.lang.startsWith('en'));
  speakWithLoop(text, preferred || null);
}

function stopAffirmationSession() {
  affirmationLoopActive = false;
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
  stopThetaBeats();
}

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
    refetchQuests,
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
        if (toolAction.affirmationText) {
          startAffirmationSession(toolAction.affirmationText);
        }
        break;
      }

      case 'generate_affirmation': {
        queryClient.invalidateQueries({ queryKey: ['/api/profile'] });
        if (toolAction.affirmationText) {
          startAffirmationSession(toolAction.affirmationText);
        }
        break;
      }

      case 'update_daily_log': {
        window.dispatchEvent(new CustomEvent("nova-daily-log-updated"));
        break;
      }

      case 'stop_affirmation': {
        stopAffirmationSession();
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
    const missionActions = ['complete_mission', 'create_mission', 'terminate_mission', 'restore_mission', 'update_mission', 'batch_create_missions', 'uncomplete_mission'];
    if (toolActions.some(ta => ta.action && missionActions.includes(ta.action))) {
      refetchQuests();
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
    if (toolActions.some(ta => ta.action === 'create_vision_goal')) {
      queryClient.invalidateQueries({ queryKey: ["/api/vision-goals"] });
    }
  }, [executeToolAction, refetchQuests]);

  return { executeToolAction, executeToolActions };
}
