let audioCtx: AudioContext | null = null;
let leftOsc: OscillatorNode | null = null;
let rightOsc: OscillatorNode | null = null;
let masterGain: GainNode | null = null;
let isPlaying = false;

const BASE_FREQ = 200;
const THETA_OFFSET = 6;
const FADE_DURATION = 2.0;
const BEAT_VOLUME = 0.35;

function ensureContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    console.log('[theta] Created AudioContext, state:', audioCtx.state, 'sampleRate:', audioCtx.sampleRate);
  }
  return audioCtx;
}

export async function startThetaBeats(): Promise<void> {
  console.log('[theta] startThetaBeats called, isPlaying:', isPlaying);
  if (isPlaying) return;

  const ctx = ensureContext();
  console.log('[theta] AudioContext state before resume:', ctx.state);

  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
      console.log('[theta] AudioContext resumed, state:', ctx.state);
    } catch (e) {
      console.error('[theta] Failed to resume AudioContext:', e);
      return;
    }
  }

  if (ctx.state !== 'running') {
    console.error('[theta] AudioContext not running after resume, state:', ctx.state);
    return;
  }

  masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(BEAT_VOLUME, ctx.currentTime + FADE_DURATION);
  masterGain.connect(ctx.destination);

  leftOsc = ctx.createOscillator();
  leftOsc.type = 'sine';
  leftOsc.frequency.setValueAtTime(BASE_FREQ, ctx.currentTime);

  rightOsc = ctx.createOscillator();
  rightOsc.type = 'sine';
  rightOsc.frequency.setValueAtTime(BASE_FREQ + THETA_OFFSET, ctx.currentTime);

  if (typeof StereoPannerNode !== 'undefined') {
    const leftPan = ctx.createStereoPanner();
    leftPan.pan.setValueAtTime(-1, ctx.currentTime);
    const rightPan = ctx.createStereoPanner();
    rightPan.pan.setValueAtTime(1, ctx.currentTime);

    leftOsc.connect(leftPan).connect(masterGain);
    rightOsc.connect(rightPan).connect(masterGain);
    console.log('[theta] Using StereoPannerNode for L/R separation');
  } else {
    leftOsc.connect(masterGain);
    rightOsc.connect(masterGain);
    console.log('[theta] StereoPannerNode not available, mixing both channels');
  }

  leftOsc.start();
  rightOsc.start();
  isPlaying = true;
  console.log('[theta] Oscillators started! Frequencies:', BASE_FREQ, 'Hz and', BASE_FREQ + THETA_OFFSET, 'Hz, volume:', BEAT_VOLUME);
}

export function stopThetaBeats(): void {
  console.log('[theta] stopThetaBeats called, isPlaying:', isPlaying);
  if (!isPlaying || !audioCtx) return;

  const now = audioCtx.currentTime;

  if (masterGain) {
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(0, now + FADE_DURATION);
  }

  setTimeout(() => {
    try {
      leftOsc?.stop();
      rightOsc?.stop();
      leftOsc?.disconnect();
      rightOsc?.disconnect();
      masterGain?.disconnect();
    } catch {}
    leftOsc = null;
    rightOsc = null;
    masterGain = null;
    isPlaying = false;
    console.log('[theta] Stopped and cleaned up');
  }, FADE_DURATION * 1000 + 100);
}

export function isThetaBeatsPlaying(): boolean {
  return isPlaying;
}
