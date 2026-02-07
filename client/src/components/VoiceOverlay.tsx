import { useState, useCallback, useEffect } from 'react';
import { Loader2, Mic, MicOff, Square } from 'lucide-react';
import { useVoiceControl } from '@/hooks/use-voice-control';
import { useLYFEOS } from '@/lib/context';
import { useNovaActions } from '@/hooks/use-nova-actions';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface VoiceCommandResponse {
  speech: string;
  toolActions: any[];
  understood: boolean;
}

export default function VoiceOverlay() {
  const { activeChatSessionId, chatSessions, aiCompanionName } = useLYFEOS();
  const { executeToolActions } = useNovaActions();

  const [showOverlay, setShowOverlay] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const showFeedbackMsg = useCallback((message: string) => {
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

      showFeedbackMsg(data.speech || "Command processed.");
    } catch (error) {
      console.error("Voice command error:", error);
      showFeedbackMsg("Connection issue. Try again.");
    } finally {
      setIsProcessing(false);
    }
  }, [executeToolActions, showFeedbackMsg, getDbConversationId]);

  const onVoiceCommand = useCallback((command: { raw: string }) => {
    handleCommand(command.raw);
  }, [handleCommand]);

  const { isListening, isSupported, startListening, stopListening } = useVoiceControl({
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
      startListening();
    }
  }, [showOverlay, isListening, stopListening, startListening]);

  const handleStop = useCallback(() => {
    if (isListening) {
      stopListening();
    }
    setShowOverlay(false);
    setTranscript('');
    setFeedback('');
  }, [isListening, stopListening]);

  const handlePauseResume = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      setFeedback('');
      setTranscript('');
      startListening();
    }
  }, [isListening, stopListening, startListening]);

  useEffect(() => {
    const handler = () => {
      handleToggleVoice();
    };
    window.addEventListener('toggle-voice-control', handler);
    return () => window.removeEventListener('toggle-voice-control', handler);
  }, [handleToggleVoice]);

  if (!isSupported || !showOverlay) return null;

  return (
    <div className="fixed top-0 inset-x-0 z-50 px-4 pt-2 pb-2 pointer-events-none">
      <div className="max-w-2xl mx-auto pointer-events-auto">
        <div className="bg-card rounded-xl p-3 border border-primary/40 shadow-[0_0_20px_rgba(0,224,255,0.2)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0 mr-3">
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs text-muted-foreground truncate">{aiCompanionName || 'NOVA'} Voice</span>
                    <span className="text-sm font-mono text-primary">Processing...</span>
                  </div>
                </>
              ) : isListening ? (
                <>
                  <div className="w-3 h-3 rounded-full bg-primary animate-pulse shrink-0" />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs text-muted-foreground truncate">{aiCompanionName || 'NOVA'} Voice</span>
                    <span className="text-sm font-mono text-primary">Listening...</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-3 h-3 rounded-full bg-muted-foreground shrink-0" />
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-xs text-muted-foreground truncate">{aiCompanionName || 'NOVA'} Voice</span>
                    <span className="text-sm font-mono text-muted-foreground">Paused</span>
                  </div>
                </>
              )}
            </div>

            {(transcript || feedback) && (
              <div className="flex-1 min-w-0 mr-3">
                {transcript && !feedback && (
                  <p className="text-sm text-foreground truncate">"{transcript}"</p>
                )}
                {feedback && (
                  <p className="text-sm text-primary truncate">{feedback}</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handlePauseResume}
                disabled={isProcessing}
                className="h-8 w-8 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center justify-center disabled:opacity-40"
                title={isListening ? "Pause dictation" : "Resume dictation"}
              >
                {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={handleStop}
                className="h-8 w-8 rounded border bg-primary/20 border-primary/50 text-primary hover:bg-primary/30 transition-colors inline-flex items-center justify-center"
                title="Stop and close"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
