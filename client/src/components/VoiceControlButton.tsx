import { useState, useCallback, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
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
  const { activeChatSessionId, chatSessions, aiCompanionName } = useLYFEOS();
  const { executeToolActions } = useNovaActions();

  const [showOverlay, setShowOverlay] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const showFeedback = useCallback((message: string) => {
    setFeedback(message);
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

      showFeedback(data.speech || "Command processed.");
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

  const { isListening, isSupported, toggleListening, stopListening } = useVoiceControl({
    onCommand: onVoiceCommand,
    onTranscript: setTranscript,
  });

  const handleToggleVoice = useCallback(() => {
    if (showOverlay) {
      if (isListening) {
        stopListening();
      }
      setShowOverlay(false);
      setTranscript('');
      setFeedback('');
    } else {
      setShowOverlay(true);
      setTranscript('');
      setFeedback('');
      toggleListening();
    }
  }, [showOverlay, isListening, stopListening, toggleListening]);

  const handleCloseOverlay = useCallback(() => {
    if (isListening) {
      stopListening();
    }
    setShowOverlay(false);
    setTranscript('');
    setFeedback('');
  }, [isListening, stopListening]);

  useEffect(() => {
    const handler = () => {
      handleToggleVoice();
    };
    window.addEventListener('toggle-voice-control', handler);
    return () => window.removeEventListener('toggle-voice-control', handler);
  }, [handleToggleVoice]);

  if (!isSupported) return null;

  return (
    <>
      {showOverlay && (
        <div className="fixed inset-x-0 bottom-36 z-50 flex justify-center px-4 pointer-events-none">
          <div className="glassmorphic rounded-xl p-4 neon-border max-w-sm w-full pointer-events-auto shadow-[0_0_20px_rgba(0,224,255,0.2)]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isProcessing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    <span className="text-xs font-mono text-primary">{aiCompanionName || 'NOVA'} thinking...</span>
                  </>
                ) : isListening ? (
                  <>
                    <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                    <span className="text-xs font-mono text-primary">Listening...</span>
                  </>
                ) : (
                  <span className="text-xs font-mono text-muted-foreground">{aiCompanionName || 'NOVA'} Voice</span>
                )}
              </div>
              <button
                onClick={handleCloseOverlay}
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
                Speak naturally — {aiCompanionName || 'NOVA'} understands everything. Try "play my affirmation" or "schedule a meeting tomorrow"
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
