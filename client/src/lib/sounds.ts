let soundEnabled = true;
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === "suspended") audioCtx.resume().catch(() => {});
  return audioCtx;
}

function playTone(freq: number, duration: number, startTime: number, gain: number, type: OscillatorType = "sine", ctx: AudioContext) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, startTime);
  g.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(startTime);
  osc.stop(startTime + duration);
}

export function setSoundEnabled(enabled: boolean) {
  soundEnabled = enabled;
}

export function isSoundSupported(): boolean {
  return typeof window !== "undefined" && !!(window.AudioContext || (window as any).webkitAudioContext);
}

export function playMissionComplete() {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(523.25, 0.15, t, 0.25, "sine", ctx);
  playTone(659.25, 0.15, t + 0.1, 0.25, "sine", ctx);
  playTone(783.99, 0.25, t + 0.2, 0.3, "sine", ctx);
}

export function playLevelUp() {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    playTone(freq, 0.18, t + i * 0.12, 0.2, "sine", ctx);
  });
  playTone(1046.5, 0.4, t + 0.48, 0.3, "triangle", ctx);
}

export function playXpGain() {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(880, 0.08, t, 0.15, "sine", ctx);
  playTone(1108.73, 0.12, t + 0.06, 0.15, "sine", ctx);
}

export function playStreak() {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(587.33, 0.12, t, 0.2, "sine", ctx);
  playTone(698.46, 0.12, t + 0.1, 0.2, "sine", ctx);
  playTone(880, 0.2, t + 0.2, 0.25, "sine", ctx);
}

export function playNotification() {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(660, 0.12, t, 0.18, "sine", ctx);
  playTone(880, 0.18, t + 0.15, 0.18, "sine", ctx);
}

export function playAchievement() {
  if (!soundEnabled) return;
  const ctx = getCtx();
  if (!ctx) return;
  const t = ctx.currentTime;
  playTone(659.25, 0.1, t, 0.2, "sine", ctx);
  playTone(783.99, 0.1, t + 0.08, 0.2, "sine", ctx);
  playTone(987.77, 0.1, t + 0.16, 0.22, "sine", ctx);
  playTone(1318.51, 0.3, t + 0.24, 0.28, "triangle", ctx);
}
