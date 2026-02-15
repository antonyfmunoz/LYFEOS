let audioElement: HTMLAudioElement | null = null;
let blobUrl: string | null = null;
let isPlaying = false;

const BASE_FREQ = 350;
const THETA_OFFSET = 6;
const SAMPLE_RATE = 44100;
const DURATION_SECONDS = 30;
const VOLUME = 0.4;

function generateThetaWav(): Blob {
  const numSamples = SAMPLE_RATE * DURATION_SECONDS;
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  function writeString(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + numSamples * 2, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, numSamples * 2, true);

  const freq1 = BASE_FREQ;
  const freq2 = BASE_FREQ + THETA_OFFSET;
  const twoPi = 2 * Math.PI;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const sample = VOLUME * (
      Math.sin(twoPi * freq1 * t) +
      Math.sin(twoPi * freq2 * t)
    ) / 2;

    let fadeMultiplier = 1;
    if (t < 2) fadeMultiplier = t / 2;

    const value = Math.max(-1, Math.min(1, sample * fadeMultiplier));
    view.setInt16(44 + i * 2, value * 32767, true);
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

let cachedBlob: Blob | null = null;

function getOrCreateBlob(): Blob {
  if (!cachedBlob) {
    cachedBlob = generateThetaWav();
    console.log('[theta] Generated WAV blob, size:', cachedBlob.size, 'bytes');
  }
  return cachedBlob;
}

export async function startThetaBeats(): Promise<void> {
  console.log('[theta] startThetaBeats called, isPlaying:', isPlaying);
  if (isPlaying) return;

  try {
    const blob = getOrCreateBlob();

    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
    }
    blobUrl = URL.createObjectURL(blob);

    audioElement = new Audio(blobUrl);
    audioElement.loop = true;
    audioElement.volume = 1.0;

    console.log('[theta] Audio element created, attempting to play...');

    await audioElement.play();

    isPlaying = true;
    console.log('[theta] Audio playing! Base freq:', BASE_FREQ, 'Hz, beat freq:', THETA_OFFSET, 'Hz');
  } catch (e) {
    console.error('[theta] Failed to play audio:', e);
    cleanup();
  }
}

function cleanup() {
  if (audioElement) {
    audioElement.pause();
    audioElement.src = '';
    audioElement = null;
  }
  if (blobUrl) {
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  }
  isPlaying = false;
}

export function stopThetaBeats(): void {
  console.log('[theta] stopThetaBeats called, isPlaying:', isPlaying);
  if (!isPlaying || !audioElement) return;

  const fadeDuration = 2000;
  const steps = 40;
  const stepTime = fadeDuration / steps;
  let currentStep = 0;
  const startVolume = audioElement.volume;

  const fadeInterval = setInterval(() => {
    currentStep++;
    if (!audioElement || currentStep >= steps) {
      clearInterval(fadeInterval);
      cleanup();
      console.log('[theta] Stopped and cleaned up');
      return;
    }
    audioElement.volume = startVolume * (1 - currentStep / steps);
  }, stepTime);
}

export function isThetaBeatsPlaying(): boolean {
  return isPlaying;
}
