import { useState, useCallback, useRef, useEffect } from 'react';

export interface VoiceCommand {
  action: string;
  target?: string;
  raw: string;
}

interface UseVoiceControlOptions {
  onCommand: (command: VoiceCommand) => void;
  onTranscript?: (text: string) => void;
}

const NAV_ALIASES: Record<string, string> = {
  dashboard: '/dashboard',
  home: '/dashboard',
  missions: '/missions',
  mission: '/missions',
  quests: '/missions',
  quest: '/missions',
  ai: '/ai',
  nova: '/ai',
  assistant: '/ai',
  chat: '/ai',
  chronilog: '/chronilog',
  chronicle: '/chronilog',
  log: '/chronilog',
  logs: '/chronilog',
  profile: '/profile',
  settings: '/profile',
  journal: '/journal-log',
  timeline: '/chronilog/timeline',
  knowledge: '/knowledge-vault',
  goals: '/goals-archive',
  vision: '/goals-archive',
};

export function parseVoiceCommand(transcript: string): VoiceCommand {
  const text = transcript.toLowerCase().trim();

  if (/^(go to|navigate to|open|show|take me to|switch to)\s+(.+)$/i.test(text)) {
    const match = text.match(/^(?:go to|navigate to|open|show|take me to|switch to)\s+(.+)$/i);
    const target = match?.[1]?.trim() || '';
    const route = NAV_ALIASES[target];
    if (route) {
      return { action: 'navigate', target: route, raw: transcript };
    }
    return { action: 'navigate', target, raw: transcript };
  }

  if (/^(complete|finish|done|mark done|mark complete)\s+(.+)$/i.test(text)) {
    const match = text.match(/^(?:complete|finish|done|mark done|mark complete)\s+(.+)$/i);
    return { action: 'complete_mission', target: match?.[1]?.trim(), raw: transcript };
  }

  if (/^(start|begin|start timer|start mission)\s+(.+)$/i.test(text)) {
    const match = text.match(/^(?:start|begin|start timer|start mission)\s+(.+)$/i);
    return { action: 'start_mission', target: match?.[1]?.trim(), raw: transcript };
  }

  if (/^(pause|pause timer|stop timer)$/i.test(text)) {
    return { action: 'pause_timer', raw: transcript };
  }

  if (/^(resume|resume timer|continue timer|unpause)$/i.test(text)) {
    return { action: 'resume_timer', raw: transcript };
  }

  if (/^(stop|end|end timer|stop mission)$/i.test(text)) {
    return { action: 'end_timer', raw: transcript };
  }

  for (const [alias, route] of Object.entries(NAV_ALIASES)) {
    if (text === alias) {
      return { action: 'navigate', target: route, raw: transcript };
    }
  }

  return { action: 'unknown', target: text, raw: transcript };
}

export function useVoiceControl({ onCommand, onTranscript }: UseVoiceControlOptions) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(false);
  const [lastTranscript, setLastTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const isActiveRef = useRef(false);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setIsSupported(!!SpeechRecognition);
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      isActiveRef.current = true;
      setIsListening(true);
    };

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalTranscript += result[0].transcript;
        } else {
          interimTranscript += result[0].transcript;
        }
      }

      if (interimTranscript) {
        setLastTranscript(interimTranscript);
        onTranscript?.(interimTranscript);
      }

      if (finalTranscript) {
        setLastTranscript(finalTranscript);
        onTranscript?.(finalTranscript);
        const command = parseVoiceCommand(finalTranscript);
        onCommand(command);
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      isActiveRef.current = false;
      setIsListening(false);
    };

    recognition.onend = () => {
      isActiveRef.current = false;
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
    }
  }, [onCommand, onTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
    }
    isActiveRef.current = false;
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isActiveRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [startListening, stopListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
      }
    };
  }, []);

  return {
    isListening,
    isSupported,
    lastTranscript,
    startListening,
    stopListening,
    toggleListening,
  };
}
