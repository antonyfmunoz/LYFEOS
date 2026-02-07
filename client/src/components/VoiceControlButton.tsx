import { useState, useCallback, useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import { Mic, MicOff, X, Loader2 } from 'lucide-react';
import { useVoiceControl } from '@/hooks/use-voice-control';
import { useLYFEOS } from '@/lib/context';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface VoiceAction {
  type: string;
  target?: string;
  open?: boolean;
  title?: string;
  description?: string;
}

interface VoiceCommandResponse {
  actions: VoiceAction[];
  speech: string;
  understood: boolean;
}

export default function VoiceControlButton() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
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

  const [showOverlay, setShowOverlay] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const feedbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showFeedback = useCallback((message: string, duration = 3500) => {
    setFeedback(message);
    if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    feedbackTimeoutRef.current = setTimeout(() => {
      setFeedback('');
      setShowOverlay(false);
    }, duration);
  }, []);

  const executeActions = useCallback((actions: VoiceAction[]) => {
    for (const action of actions) {
      switch (action.type) {
        case 'navigate':
          if (action.target?.startsWith('/')) {
            navigate(action.target);
          }
          break;

        case 'toggle_widget':
          queryClient.setQueryData<Record<string, boolean>>(["/api/widget-states"], (prev) => ({
            ...prev,
            [action.target!]: action.open !== false,
          }));
          queryClient.invalidateQueries({ queryKey: ["/api/widget-states"] });
          break;

        case 'complete_mission':
          queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
          queryClient.invalidateQueries({ queryKey: ["/api/user-stats"] });
          break;

        case 'create_mission':
          queryClient.invalidateQueries({ queryKey: ["/api/quests"] });
          break;

        case 'start_mission': {
          const targetId = action.target;
          const mission = targetId
            ? quests.find(q => String(q.id) === String(targetId))
            : null;
          if (mission) {
            startMissionTimer(mission);
          }
          break;
        }

        case 'pause_timer':
          if (activeTimerQuest && !timerIsPaused) {
            pauseResumeTimer();
          }
          break;

        case 'resume_timer':
          if (activeTimerQuest && timerIsPaused) {
            pauseResumeTimer();
          }
          break;

        case 'end_timer':
          if (activeTimerQuest && timerStartedAt) {
            const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000) + (timerPausedElapsed || 0);
            endMissionTimer(elapsed);
          }
          break;

        case 'none':
        default:
          break;
      }
    }
  }, [quests, startMissionTimer, pauseResumeTimer, endMissionTimer, activeTimerQuest, timerIsPaused, timerStartedAt, timerPausedElapsed, navigate]);

  const handleCommand = useCallback(async (finalTranscript: string) => {
    setIsProcessing(true);
    setTranscript(finalTranscript);

    try {
      const data = await apiRequest<VoiceCommandResponse>("/api/voice-command", {
        method: "POST",
        body: JSON.stringify({ transcript: finalTranscript }),
      });

      if (data.actions && data.actions.length > 0) {
        executeActions(data.actions);
      }

      showFeedback(data.speech || "Command processed.", 4000);
    } catch (error) {
      console.error("Voice command error:", error);
      showFeedback("Connection issue. Try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [executeActions, showFeedback]);

  const onVoiceCommand = useCallback((command: { raw: string }) => {
    handleCommand(command.raw);
  }, [handleCommand]);

  const { isListening, isSupported, toggleListening } = useVoiceControl({
    onCommand: onVoiceCommand,
    onTranscript: setTranscript,
  });

  useEffect(() => {
    if (isListening) {
      setShowOverlay(true);
      setTranscript('');
      setFeedback('');
    }
  }, [isListening]);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutRef.current) clearTimeout(feedbackTimeoutRef.current);
    };
  }, []);

  if (!isSupported) return null;

  return (
    <>
      <button
        onClick={toggleListening}
        className={`fixed bottom-24 right-4 z-50 w-12 h-12 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg ${
          isListening
            ? 'bg-primary text-primary-foreground shadow-[0_0_15px_var(--primary)] animate-pulse'
            : 'glassmorphic border border-primary/30 text-primary hover:border-primary/60 hover:shadow-[0_0_10px_var(--primary-glow-light)]'
        }`}
        title="Voice Control (AI-powered)"
      >
        {isListening ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </button>

      {showOverlay && (
        <div className="fixed inset-x-0 bottom-36 z-50 flex justify-center px-4 pointer-events-none">
          <div className="glassmorphic rounded-xl p-4 neon-border max-w-sm w-full pointer-events-auto shadow-[0_0_20px_rgba(0,224,255,0.2)]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    <span className="text-xs font-mono text-primary">NOVA thinking...</span>
                  </>
                ) : isListening ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-mono text-primary">Listening...</span>
                  </>
                ) : (
                  <span className="text-xs font-mono text-muted-foreground">NOVA Voice</span>
                )}
              </div>
              <button
                onClick={() => { setShowOverlay(false); if (isListening) toggleListening(); }}
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {transcript && !feedback && (
              <p className="text-sm text-foreground font-medium mb-1">"{transcript}"</p>
            )}

            {feedback && (
              <p className="text-sm text-primary font-medium mb-1">{feedback}</p>
            )}

            {!feedback && !transcript && isListening && !isProcessing && (
              <p className="text-xs text-muted-foreground">
                Speak naturally — NOVA understands context. Try "open the energy log" or "how am I doing?"
              </p>
            )}

            <div className="mt-2 border-t border-primary/10 pt-2">
              <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                AI-powered: Navigate, control widgets, manage missions, ask questions
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
