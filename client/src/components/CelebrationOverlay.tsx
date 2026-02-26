import { useEffect, useRef, useState, useCallback } from "react";
import { useCelebration } from "@/lib/celebrationContext";

function getPrimaryColor(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary-hsl").trim();
  if (raw) {
    const parts = raw.replace(/,/g, "").split(/\s+/);
    if (parts.length >= 3) {
      return `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`;
    }
  }
  return "#00e0ff";
}

function getPrimaryRgb(): [number, number, number] {
  const el = document.createElement("div");
  el.style.color = getPrimaryColor();
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  document.body.removeChild(el);
  const match = computed.match(/(\d+)/g);
  if (match && match.length >= 3) {
    return [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])];
  }
  return [0, 224, 255];
}

function hexToRgb(hex: string): [number, number, number] {
  const el = document.createElement("div");
  el.style.color = hex;
  document.body.appendChild(el);
  const computed = getComputedStyle(el).color;
  document.body.removeChild(el);
  const match = computed.match(/(\d+)/g);
  if (match && match.length >= 3) {
    return [parseInt(match[0]), parseInt(match[1]), parseInt(match[2])];
  }
  return [0, 224, 255];
}

interface HudParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  decay: number;
  type: "dot" | "line" | "diamond";
  rotation: number;
  rotationSpeed: number;
  length?: number;
}

function drawHexagon(ctx: CanvasRenderingContext2D, cx: number, cy: number, radius: number) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + radius * Math.cos(angle);
    const y = cy + radius * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawDiamond(ctx: CanvasRenderingContext2D, size: number) {
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.6, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.6, 0);
  ctx.closePath();
}

function createHudParticles(cx: number, cy: number, count: number, upward: boolean): HudParticle[] {
  const particles: HudParticle[] = [];
  const types: HudParticle["type"][] = ["dot", "line", "diamond"];
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 1.5 + Math.random() * 4;
    particles.push({
      x: cx + (Math.random() - 0.5) * 40,
      y: cy + (Math.random() - 0.5) * 40,
      vx: Math.cos(angle) * speed * 0.4,
      vy: upward ? -Math.abs(Math.sin(angle) * speed) - 1 : Math.sin(angle) * speed,
      size: 2 + Math.random() * 4,
      alpha: 0.8 + Math.random() * 0.2,
      decay: 0.006 + Math.random() * 0.008,
      type: types[Math.floor(Math.random() * types.length)],
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.08,
      length: 8 + Math.random() * 16,
    });
  }
  return particles;
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
  const particlesRef = useRef<HudParticle[]>([]);
  const animFrameRef = useRef<number>(0);
  const [phase, setPhase] = useState<"burst" | "text" | "fade">("burst");
  const [textOpacity, setTextOpacity] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const [pr, pg, pb] = getPrimaryRgb();
    const [rr, rg, rb] = rankColor ? hexToRgb(rankColor) : [pr, pg, pb];
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    particlesRef.current = [
      ...createHudParticles(cx, cy, 60, true),
      ...createHudParticles(cx, cy - 30, 30, true),
    ];

    let frame = 0;
    const totalFrames = 160;

    const animate = () => {
      frame++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const w = canvas.width;
      const h = canvas.height;

      if (frame < 15) {
        const flashA = Math.max(0, 0.25 - frame * 0.017);
        ctx.fillStyle = `rgba(${rr}, ${rg}, ${rb}, ${flashA})`;
        ctx.fillRect(0, 0, w, h);
      }

      const scanSpeed = 8;
      if (frame < 40) {
        const scanY1 = (frame * scanSpeed) % h;
        const scanY2 = h - (frame * scanSpeed) % h;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 0.12 - frame * 0.003);
        const grad1 = ctx.createLinearGradient(0, scanY1 - 30, 0, scanY1 + 30);
        grad1.addColorStop(0, `rgba(${rr}, ${rg}, ${rb}, 0)`);
        grad1.addColorStop(0.5, `rgba(${rr}, ${rg}, ${rb}, 1)`);
        grad1.addColorStop(1, `rgba(${rr}, ${rg}, ${rb}, 0)`);
        ctx.fillStyle = grad1;
        ctx.fillRect(0, scanY1 - 30, w, 60);
        const grad2 = ctx.createLinearGradient(0, scanY2 - 30, 0, scanY2 + 30);
        grad2.addColorStop(0, `rgba(${rr}, ${rg}, ${rb}, 0)`);
        grad2.addColorStop(0.5, `rgba(${rr}, ${rg}, ${rb}, 1)`);
        grad2.addColorStop(1, `rgba(${rr}, ${rg}, ${rb}, 0)`);
        ctx.fillStyle = grad2;
        ctx.fillRect(0, scanY2 - 30, w, 60);
        ctx.restore();
      }

      for (let ring = 0; ring < 3; ring++) {
        const ringDelay = ring * 8;
        if (frame > ringDelay) {
          const ringProgress = Math.min(1, (frame - ringDelay) / 35);
          const ringRadius = 30 + ringProgress * (100 + ring * 50);
          ctx.save();
          ctx.globalAlpha = (1 - ringProgress) * (0.6 - ring * 0.15);
          ctx.strokeStyle = `rgb(${rr}, ${rg}, ${rb})`;
          ctx.lineWidth = 2 - ring * 0.5;
          ctx.shadowColor = `rgba(${rr}, ${rg}, ${rb}, 0.5)`;
          ctx.shadowBlur = 20;
          drawHexagon(ctx, cx, cy, ringRadius);
          ctx.stroke();
          ctx.restore();
        }
      }

      if (frame > 10 && frame < 80) {
        const diamondProgress = Math.min(1, (frame - 10) / 20);
        const diamondSize = 60 + diamondProgress * 30;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(Math.PI / 4);
        ctx.globalAlpha = Math.min(0.5, diamondProgress) * Math.max(0, 1 - (frame - 10) / 70);
        ctx.strokeStyle = `rgb(${rr}, ${rg}, ${rb})`;
        ctx.lineWidth = 1.5;
        ctx.shadowColor = `rgba(${rr}, ${rg}, ${rb}, 0.6)`;
        ctx.shadowBlur = 15;
        ctx.strokeRect(-diamondSize / 2, -diamondSize / 2, diamondSize, diamondSize);
        ctx.restore();
      }

      const cornerSize = 20;
      const cornerAlpha = Math.max(0, Math.min(0.5, (frame - 15) / 20)) * Math.max(0, 1 - (frame - 15) / 120);
      if (cornerAlpha > 0) {
        ctx.save();
        ctx.globalAlpha = cornerAlpha;
        ctx.strokeStyle = `rgb(${rr}, ${rg}, ${rb})`;
        ctx.lineWidth = 1.5;
        const offX = 80;
        const offY = 50;
        const corners = [
          [cx - offX, cy - offY, 1, 1],
          [cx + offX, cy - offY, -1, 1],
          [cx - offX, cy + offY, 1, -1],
          [cx + offX, cy + offY, -1, -1],
        ];
        for (const [bx, by, dx, dy] of corners) {
          ctx.beginPath();
          ctx.moveTo(bx, by + dy * cornerSize);
          ctx.lineTo(bx, by);
          ctx.lineTo(bx + dx * cornerSize, by);
          ctx.stroke();
        }
        ctx.restore();
      }

      const dataStreamCount = 6;
      for (let i = 0; i < dataStreamCount; i++) {
        const streamX = cx + (i - dataStreamCount / 2) * 30 + 15;
        const streamOffset = ((frame * 3 + i * 20) % 120);
        const streamAlpha = Math.max(0, 0.3 - frame / totalFrames * 0.3);
        for (let j = 0; j < 5; j++) {
          const dotY = cy + 80 - streamOffset - j * 8;
          const dotAlpha = streamAlpha * (1 - j / 5);
          if (dotAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = dotAlpha;
            ctx.fillStyle = `rgb(${rr}, ${rg}, ${rb})`;
            ctx.fillRect(streamX, dotY, 2, 3);
            ctx.restore();
          }
        }
      }

      particlesRef.current = particlesRef.current.filter((p) => p.alpha > 0.01);
      for (const p of particlesRef.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.vy *= 0.99;
        p.alpha -= p.decay * 0.5;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.shadowColor = `rgba(${rr}, ${rg}, ${rb}, 0.4)`;
        ctx.shadowBlur = 8;

        if (p.type === "dot") {
          ctx.fillStyle = `rgba(${rr}, ${rg}, ${rb}, ${p.alpha})`;
          ctx.beginPath();
          ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === "line") {
          ctx.strokeStyle = `rgba(${rr}, ${rg}, ${rb}, ${p.alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -(p.length || 12));
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(${rr}, ${rg}, ${rb}, ${p.alpha * 0.6})`;
          drawDiamond(ctx, p.size);
          ctx.fill();
        }
        ctx.restore();
      }

      if (frame === 20) setPhase("text");
      if (frame >= 20 && frame <= 45) setTextOpacity(Math.min(1, (frame - 20) / 15));
      if (frame > 120) {
        setPhase("fade");
        setTextOpacity((prev) => Math.max(0, prev - 0.04));
      }

      if (frame < totalFrames) {
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

  const accentColor = rankColor || getPrimaryColor();

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
          style={{ opacity: textOpacity }}
        >
          <div
            className="text-[10px] font-mono font-bold tracking-[0.5em] uppercase mb-3"
            style={{ color: accentColor, textShadow: `0 0 20px ${accentColor}80, 0 0 40px ${accentColor}40` }}
          >
            // SYSTEM ALERT //
          </div>
          <div
            className="text-xs font-mono tracking-[0.3em] uppercase mb-2 opacity-70"
            style={{ color: accentColor }}
          >
            Level Achieved
          </div>
          <div
            className="text-7xl sm:text-9xl font-black mb-2 font-mono"
            style={{
              color: "#fff",
              textShadow: `0 0 30px ${accentColor}90, 0 0 60px ${accentColor}50, 0 0 100px ${accentColor}30`,
              WebkitTextStroke: `1px ${accentColor}40`,
            }}
          >
            {level}
          </div>
          {rankName && (
            <div className="flex items-center gap-3 mt-2">
              {rankIcon && <span className="text-2xl">{rankIcon}</span>}
              <span
                className="text-lg sm:text-xl font-mono font-bold tracking-[0.2em] uppercase"
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
