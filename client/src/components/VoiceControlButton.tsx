import { useState, useCallback, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Loader2 } from 'lucide-react';
import { useVoiceControl } from '@/hooks/use-voice-control';
import { useLYFEOS } from '@/lib/context';
import { useNovaActions } from '@/hooks/use-nova-actions';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface VoiceCommandResponse {
  speech: string;
  toolActions: any[];
  understood: boolean;
}

export default function VoiceControlButton() {
  const { activeChatSessionId, chatSessions } = useLYFEOS();
  const { executeToolActions } = useNovaActions();

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

  const getDbConversationId = useCallback((): string | null => {
    if (!activeChatSessionId) return null;
    const session = chatSessions.find(s => s.id === activeChatSessionId);
    if (!session) return null;
    const match = session.id.match(/^db-chat-(\d+)$/);
    return match ? match[1] : null;
  }, [activeChatSessionId, chatSessions]);

  const handleCommand = useCallback(async (finalTranscript: string) => {
    setIsProcessing(true);
    setTranscript(finalTranscript);

    try {
      const conversationId = getDbConversationId();
      const data = await apiRequest<VoiceCommandResponse>("/api/voice-command", {
        method: "POST",
        body: JSON.stringify({ 
          transcript: finalTranscript,
          conversationId: conversationId || undefined,
        }),
      });

      if (data.toolActions && data.toolActions.length > 0) {
        executeToolActions(data.toolActions);
      }

      queryClient.invalidateQueries({ queryKey: ["/api/conversations"] });

      showFeedback(data.speech || "Command processed.", 4000);
    } catch (error) {
      console.error("Voice command error:", error);
      showFeedback("Connection issue. Try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [executeToolActions, showFeedback, getDbConversationId]);

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
            ? 'bg-primary text-primary-foreground shadow-[0_0_15px_var(--primary)]'
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
                Speak naturally — NOVA understands everything. Try "play my affirmation" or "schedule a meeting tomorrow"
              </p>
            )}

            <div className="mt-2 border-t border-primary/10 pt-2">
              <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
                Full control: Navigate, widgets, missions, timers, daily log, affirmations, calendar, themes
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
