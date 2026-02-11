import { useEffect, useRef, useState, useCallback } from "react";
import { useCelebration } from "@/lib/celebrationContext";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
  gravity: number;
  rotation: number;
  rotationSpeed: number;
  shape: "circle" | "square" | "star";
}

const MISSION_COLORS = ["#10b981", "#34d399", "#6ee7b7", "#a7f3d0", "#059669", "#047857"];
const LEVEL_UP_COLORS = ["#a78bfa", "#8b5cf6", "#c084fc", "#e879f9", "#f0abfc", "#7c3aed", "#fbbf24", "#f59e0b"];

function createParticles(
  cx: number,
  cy: number,
  count: number,
  colors: string[],
  spread: number,
  speedRange: [number, number]
): Particle[] {
  const particles: Particle[] = [];
  const shapes: Particle["shape"][] = ["circle", "square", "star"];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * spread;
    const speed = speedRange[0] + Math.random() * (speedRange[1] - speedRange[0]);
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      size: 3 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      alpha: 1,
      decay: 0.008 + Math.random() * 0.012,
      gravity: 0.08 + Math.random() * 0.04,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    });
  }
  return particles;
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const spikes = 5;
  const outerRadius = size;
  const innerRadius = size / 2;
  let rot = (Math.PI / 2) * 3;
  const step = Math.PI / spikes;
  ctx.beginPath();
  ctx.moveTo(x, y - outerRadius);
  for (let i = 0; i < spikes; i++) {
    ctx.lineTo(x + Math.cos(rot) * outerRadius, y + Math.sin(rot) * outerRadius);
    rot += step;
    ctx.lineTo(x + Math.cos(rot) * innerRadius, y + Math.sin(rot) * innerRadius);
    rot += step;
  }
  ctx.lineTo(x, y - outerRadius);
  ctx.closePath();
  ctx.fill();
}

function MissionCompleteOverlay({ onDone }: { onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    particlesRef.current = [
      ...createParticles(cx, cy, 60, MISSION_COLORS, 0.5, [3, 8]),
      ...createParticles(cx, cy - 20, 30, MISSION_COLORS, 1, [2, 5]),
    ];

    let frame = 0;
    const maxFrames = 120;

    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particlesRef.current = particlesRef.current.filter((p) => p.alpha > 0.01);

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.99;
        p.alpha -= p.decay;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === "square") {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          drawStar(ctx, 0, 0, p.size);
        }
        ctx.restore();
      }

      if (frame < maxFrames && particlesRef.current.length > 0) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        onDone();
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [onDone]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 z-[200] pointer-events-none"
      style={{ width: "100vw", height: "100vh" }}
    />
  );
}

function LevelUpOverlay({
  level,
  rankName,
  rankColor,
  rankIcon,
  onDone,
}: {
  level: number;
  rankName?: string;
  rankColor?: string;
  rankIcon?: string;
  onDone: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameRef = useRef<number>(0);
  const [phase, setPhase] = useState<"burst" | "text" | "fade">("burst");
  const [textOpacity, setTextOpacity] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const colors = rankColor
      ? [rankColor, ...LEVEL_UP_COLORS]
      : LEVEL_UP_COLORS;

    particlesRef.current = [
      ...createParticles(cx, cy, 80, colors, 0.3, [4, 12]),
      ...createParticles(cx - 60, cy + 30, 40, colors, 0.8, [3, 7]),
      ...createParticles(cx + 60, cy + 30, 40, colors, 0.8, [3, 7]),
      ...createParticles(cx, cy - 40, 40, colors, 0.6, [5, 10]),
    ];

    let frame = 0;

    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (frame < 20) {
        const flashAlpha = Math.max(0, 0.3 - frame * 0.015);
        ctx.fillStyle = `rgba(168, 85, 247, ${flashAlpha})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      const ringProgress = Math.min(1, frame / 30);
      if (ringProgress < 1) {
        const ringRadius = 50 + ringProgress * 150;
        ctx.save();
        ctx.strokeStyle = rankColor || "#a78bfa";
        ctx.globalAlpha = 1 - ringProgress;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      if (frame > 10 && frame < 50) {
        const ring2Progress = Math.min(1, (frame - 10) / 30);
        const ringRadius = 30 + ring2Progress * 200;
        ctx.save();
        ctx.strokeStyle = "#fbbf24";
        ctx.globalAlpha = (1 - ring2Progress) * 0.6;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      particlesRef.current = particlesRef.current.filter((p) => p.alpha > 0.01);

      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += p.gravity;
        p.vx *= 0.99;
        p.alpha -= p.decay * 0.6;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;

        if (p.shape === "circle") {
          ctx.beginPath();
          ctx.arc(0, 0, p.size, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.shape === "square") {
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          drawStar(ctx, 0, 0, p.size);
        }
        ctx.restore();
      }

      if (frame === 15) {
        setPhase("text");
      }

      if (frame >= 15 && frame <= 35) {
        setTextOpacity(Math.min(1, (frame - 15) / 10));
      }

      if (frame > 140) {
        setPhase("fade");
        setTextOpacity((prev) => Math.max(0, prev - 0.05));
      }

      if (frame < 180) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        onDone();
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [onDone, rankColor]);

  const accentColor = rankColor || "#a78bfa";

  return (
    <div className="fixed inset-0 z-[200] pointer-events-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ width: "100vw", height: "100vh" }}
      />
      {(phase === "text" || phase === "fade") && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center"
          style={{ opacity: textOpacity, transition: "opacity 0.1s" }}
        >
          <div
            className="text-sm font-bold tracking-[0.3em] uppercase mb-2"
            style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}80` }}
          >
            Level Up
          </div>
          <div
            className="text-6xl sm:text-8xl font-black mb-3"
            style={{
              color: "#fff",
              textShadow: `0 0 40px ${accentColor}80, 0 0 80px ${accentColor}40`,
            }}
          >
            {level}
          </div>
          {rankName && (
            <div className="flex items-center gap-2 mt-1">
              {rankIcon && <span className="text-2xl">{rankIcon}</span>}
              <span
                className="text-xl sm:text-2xl font-bold tracking-wide"
                style={{ color: accentColor, textShadow: `0 0 15px ${accentColor}60` }}
              >
                {rankName}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CelebrationOverlay() {
  const { celebration, clearCelebration } = useCelebration();

  const handleDone = useCallback(() => {
    clearCelebration();
  }, [clearCelebration]);

  if (!celebration) return null;

  if (celebration.type === "mission_complete") {
    return <MissionCompleteOverlay onDone={handleDone} />;
  }

  if (celebration.type === "level_up") {
    return (
      <LevelUpOverlay
        level={celebration.level || 1}
        rankName={celebration.rankName}
        rankColor={celebration.rankColor}
        rankIcon={celebration.rankIcon}
        onDone={handleDone}
      />
    );
  }

  return null;
}
