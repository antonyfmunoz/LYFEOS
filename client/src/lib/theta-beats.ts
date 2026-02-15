let audioCtx: AudioContext | null = null;
let leftOsc: OscillatorNode | null = null;
let rightOsc: OscillatorNode | null = null;
let leftGain: GainNode | null = null;
let rightGain: GainNode | null = null;
let merger: ChannelMergerNode | null = null;
let isPlaying = false;

const BASE_FREQ = 200;
const THETA_OFFSET = 6;
const FADE_DURATION = 2.0;
const BEAT_VOLUME = 0.12;

function getOrCreateContext(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

export function startThetaBeats(): void {
  if (isPlaying) return;

  const ctx = getOrCreateContext();
  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  merger = ctx.createChannelMerger(2);

  leftOsc = ctx.createOscillator();
  leftOsc.type = 'sine';
  leftOsc.frequency.setValueAtTime(BASE_FREQ, ctx.currentTime);

  rightOsc = ctx.createOscillator();
  rightOsc.type = 'sine';
  rightOsc.frequency.setValueAtTime(BASE_FREQ + THETA_OFFSET, ctx.currentTime);

  leftGain = ctx.createGain();
  leftGain.gain.setValueAtTime(0, ctx.currentTime);
  leftGain.gain.linearRampToValueAtTime(BEAT_VOLUME, ctx.currentTime + FADE_DURATION);

  rightGain = ctx.createGain();
  rightGain.gain.setValueAtTime(0, ctx.currentTime);
  rightGain.gain.linearRampToValueAtTime(BEAT_VOLUME, ctx.currentTime + FADE_DURATION);

  leftOsc.connect(leftGain);
  leftGain.connect(merger, 0, 0);

  rightOsc.connect(rightGain);
  rightGain.connect(merger, 0, 1);

  merger.connect(ctx.destination);

  leftOsc.start();
  rightOsc.start();
  isPlaying = true;
}

export function stopThetaBeats(): void {
  if (!isPlaying || !audioCtx) return;

  const ctx = audioCtx;
  const now = ctx.currentTime;

  if (leftGain) {
    leftGain.gain.cancelScheduledValues(now);
    leftGain.gain.setValueAtTime(leftGain.gain.value, now);
    leftGain.gain.linearRampToValueAtTime(0, now + FADE_DURATION);
  }
  if (rightGain) {
    rightGain.gain.cancelScheduledValues(now);
    rightGain.gain.setValueAtTime(rightGain.gain.value, now);
    rightGain.gain.linearRampToValueAtTime(0, now + FADE_DURATION);
  }

  setTimeout(() => {
    try {
      leftOsc?.stop();
      rightOsc?.stop();
      leftOsc?.disconnect();
      rightOsc?.disconnect();
      leftGain?.disconnect();
      rightGain?.disconnect();
      merger?.disconnect();
    } catch {}
    leftOsc = null;
    rightOsc = null;
    leftGain = null;
    rightGain = null;
    merger = null;
    isPlaying = false;
  }, FADE_DURATION * 1000 + 100);
}

export function isThetaBeatsPlaying(): boolean {
  return isPlaying;
}
