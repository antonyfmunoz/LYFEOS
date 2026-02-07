import { useState, useCallback, useEffect, type CSSProperties } from 'react';
import { Loader2, Mic, MicOff, Square, ChevronUp, ChevronDown, GripHorizontal } from 'lucide-react';
import { useVoiceControl } from '@/hooks/use-voice-control';
import { useLYFEOS } from '@/lib/context';
import { useNovaActions } from '@/hooks/use-nova-actions';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useDraggable } from '@/hooks/use-draggable';

interface VoiceCommandResponse {
  speech: string;
  toolActions: any[];
  understood: boolean;
}

export default function VoiceOverlay() {
  const { activeChatSessionId, chatSessions, aiCompanionName } = useLYFEOS();
  const { executeToolActions } = useNovaActions();
  const { elementRef, position, dragHandleProps, resetPosition } = useDraggable();

  const [showOverlay, setShowOverlay] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
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
      resetPosition();
    } else {
      setShowOverlay(true);
      setTranscript('');
      setFeedback('');
      startListening();
    }
  }, [showOverlay, isListening, stopListening, startListening, resetPosition]);

  const handleStop = useCallback(() => {
    if (isListening) {
      stopListening();
    }
    setShowOverlay(false);
    setTranscript('');
    setFeedback('');
    resetPosition();
  }, [isListening, stopListening, resetPosition]);

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

  const containerStyle: CSSProperties = position
    ? { position: 'fixed', left: position.x, top: position.y, right: 'auto', bottom: 'auto', zIndex: 50 }
    : {};

  const statusIndicator = isProcessing ? (
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
    <>
      <div className="w-2 h-2 rounded-full bg-muted-foreground" />
      <span className="text-xs font-mono text-muted-foreground">Paused</span>
    </>
  );

  if (isCollapsed) {
    return (
      <div
        className={position ? '' : 'fixed inset-x-0 top-16 z-50 flex justify-center px-4 pt-2 pointer-events-none'}
        style={position ? { ...containerStyle, width: 'auto' } : {}}
      >
        <div
          ref={elementRef}
          className="bg-card rounded-xl px-4 py-2 neon-border max-w-sm w-full pointer-events-auto shadow-[0_0_20px_rgba(0,224,255,0.2)]"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mr-2" {...dragHandleProps}>
              <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/50" />
              {statusIndicator}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePauseResume}
                disabled={isProcessing}
                className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
                title={isListening ? "Pause dictation" : "Resume dictation"}
              >
                {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => setIsCollapsed(false)}
                className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Expand"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={handleStop}
                className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
                title="Stop and close"
              >
                <Square className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={position ? '' : 'fixed inset-x-0 top-16 z-50 flex justify-center px-4 pt-2 pointer-events-none'}
      style={position ? { ...containerStyle, width: 'auto' } : {}}
    >
      <div
        ref={elementRef}
        className="bg-card rounded-xl p-4 neon-border max-w-sm w-full pointer-events-auto shadow-[0_0_20px_rgba(0,224,255,0.2)]"
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2" {...dragHandleProps}>
            <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/50" />
            {statusIndicator}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePauseResume}
              disabled={isProcessing}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-40"
              title={isListening ? "Pause dictation" : "Resume dictation"}
            >
              {isListening ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
            </button>
            <button
              onClick={() => setIsCollapsed(true)}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
              title="Collapse"
            >
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleStop}
              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
              title="Stop and close"
            >
              <Square className="h-3 w-3" />
            </button>
          </div>
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

        {!isListening && !isProcessing && !feedback && !transcript && (
          <p className="text-xs text-muted-foreground">
            Dictation paused. Tap the mic to resume or stop to close.
          </p>
        )}

        <div className="mt-2 border-t border-primary/10 pt-2">
          <p className="text-[10px] text-muted-foreground font-mono leading-relaxed">
            Full control: Navigate, widgets, missions, timers, daily log, affirmations, calendar, themes
          </p>
        </div>
      </div>
    </div>
  );
}
