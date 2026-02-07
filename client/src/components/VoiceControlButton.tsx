import { useState, useCallback, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Mic, MicOff, X } from 'lucide-react';
import { useVoiceControl, VoiceCommand } from '@/hooks/use-voice-control';
import { useLYFEOS } from '@/lib/context';
import { useToast } from '@/hooks/use-toast';

export default function VoiceControlButton() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const {
    quests,
    toggleQuestCompletion,
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
  const [feedbackTimeout, setFeedbackTimeout] = useState<NodeJS.Timeout | null>(null);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
    if (feedbackTimeout) clearTimeout(feedbackTimeout);
    const t = setTimeout(() => {
      setFeedback('');
      setShowOverlay(false);
    }, 2500);
    setFeedbackTimeout(t);
  }, [feedbackTimeout]);

  const handleCommand = useCallback((command: VoiceCommand) => {
    switch (command.action) {
      case 'navigate': {
        if (command.target?.startsWith('/')) {
          navigate(command.target);
          showFeedback(`Navigating to ${command.target.replace('/', '').replace(/-/g, ' ')}`);
        } else {
          showFeedback(`I didn't recognize "${command.target}" as a page`);
        }
        break;
      }

      case 'complete_mission': {
        const target = command.target?.toLowerCase() || '';
        const mission = quests.find(q =>
          !q.completed && q.title.toLowerCase().includes(target)
        );
        if (mission) {
          toggleQuestCompletion(mission.id);
          showFeedback(`Completed: ${mission.title}`);
        } else {
          showFeedback(`No active mission matching "${command.target}"`);
        }
        break;
      }

      case 'start_mission': {
        const target = command.target?.toLowerCase() || '';
        const mission = quests.find(q =>
          !q.completed && q.title.toLowerCase().includes(target)
        );
        if (mission) {
          startMissionTimer(mission);
          showFeedback(`Started timer: ${mission.title}`);
        } else {
          showFeedback(`No active mission matching "${command.target}"`);
        }
        break;
      }

      case 'pause_timer': {
        if (activeTimerQuest && !timerIsPaused) {
          pauseResumeTimer();
          showFeedback('Timer paused');
        } else {
          showFeedback('No active timer to pause');
        }
        break;
      }

      case 'resume_timer': {
        if (activeTimerQuest && timerIsPaused) {
          pauseResumeTimer();
          showFeedback('Timer resumed');
        } else {
          showFeedback('No paused timer to resume');
        }
        break;
      }

      case 'end_timer': {
        if (activeTimerQuest && timerStartedAt) {
          const elapsed = Math.floor((Date.now() - timerStartedAt) / 1000) + (timerPausedElapsed || 0);
          endMissionTimer(elapsed);
          showFeedback('Timer stopped');
        } else {
          showFeedback('No active timer');
        }
        break;
      }

      default:
        showFeedback(`Try: "Go to dashboard" or "Complete [mission name]"`);
        break;
    }
  }, [quests, toggleQuestCompletion, startMissionTimer, pauseResumeTimer, endMissionTimer, activeTimerQuest, timerIsPaused, navigate, showFeedback]);

  const { isListening, isSupported, toggleListening } = useVoiceControl({
    onCommand: handleCommand,
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
      if (feedbackTimeout) clearTimeout(feedbackTimeout);
    };
  }, [feedbackTimeout]);

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
        title="Voice Control"
      >
        {isListening ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
      </button>

      {showOverlay && (
        <div className="fixed inset-x-0 bottom-36 z-50 flex justify-center px-4 pointer-events-none">
          <div className="glassmorphic rounded-xl p-4 neon-border max-w-sm w-full pointer-events-auto shadow-[0_0_20px_rgba(0,224,255,0.2)]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isListening ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-mono text-primary">Listening...</span>
                  </>
                ) : (
                  <span className="text-xs font-mono text-muted-foreground">Voice Control</span>
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

            {!feedback && !transcript && isListening && (
              <p className="text-xs text-muted-foreground">
                Say a command like "Go to missions" or "Complete [mission name]"
              </p>
            )}

            <div className="mt-2 border-t border-primary/10 pt-2">
              <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                Navigate: "Go to [page]" | Missions: "Complete/Start [name]" | Timer: "Pause/Resume/Stop"
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
