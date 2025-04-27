declare module 'canvas-confetti' {
  interface ConfettiOptions {
    particleCount?: number;
    angle?: number;
    spread?: number;
    startVelocity?: number;
    decay?: number;
    gravity?: number;
    drift?: number;
    ticks?: number;
    origin?: {
      x?: number;
      y?: number;
    };
    colors?: string[];
    shapes?: string[];
    scalar?: number;
    zIndex?: number;
    disableForReducedMotion?: boolean;
  }

  interface ConfettiCanvasSettings {
    resize: boolean;
    disableForReducedMotion: boolean;
  }

  interface Confetti {
    (options?: ConfettiOptions): Promise<null>;
    create(
      canvas: HTMLCanvasElement,
      options?: ConfettiCanvasSettings
    ): (opts?: ConfettiOptions) => Promise<null>;
    reset(): void;
  }

  const confetti: Confetti;
  export default confetti;
}