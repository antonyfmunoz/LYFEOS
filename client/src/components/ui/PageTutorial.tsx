import { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { ChevronRight, ChevronLeft, X, Sparkles } from "lucide-react";

export interface TutorialStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
}

const TUTORIAL_PAGES = [
  "dashboard",
  "missions",
  "profile",
  "chronilog",
  "tracker",
  "rolodex",
  "timeline",
  "ai",
];

export function tutorialKey(page: string, userId?: number | null): string {
  return userId ? `lyfeos-${page}-tutorial-completed-${userId}` : `lyfeos-${page}-tutorial-completed`;
}

export function skipAllTutorials(userId?: number | null) {
  TUTORIAL_PAGES.forEach(page => localStorage.setItem(tutorialKey(page, userId), "true"));
}

export function clearAllTutorialKeys() {
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.match(/^lyfeos-.*-tutorial-completed/)) {
      localStorage.removeItem(key);
    }
  });
}

interface PageTutorialProps {
  steps: TutorialStep[];
  storageKey: string;
  isOpen: boolean;
  onComplete: () => void;
  userId?: number | null;
}

export default function PageTutorial({ steps, storageKey, isOpen, onComplete, userId }: PageTutorialProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;

  const findVisibleStep = useCallback((startIndex: number, direction: 1 | -1 = 1): number => {
    const currentSteps = stepsRef.current;
    let idx = startIndex;
    while (idx >= 0 && idx < currentSteps.length) {
      const step = currentSteps[idx];
      const el = document.querySelector(step.target);
      if (el && el.getBoundingClientRect().width > 0) {
        return idx;
      }
      idx += direction;
    }
    return -1;
  }, []);

  const updateTargetRect = useCallback(() => {
    if (!isOpen) return;
    const currentSteps = stepsRef.current;
    const step = currentSteps[currentStep];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        setTargetRect(rect);
        return;
      }
    }
    const nextVisible = findVisibleStep(currentStep, 1);
    if (nextVisible !== -1 && nextVisible !== currentStep) {
      setCurrentStep(nextVisible);
    }
  }, [isOpen, currentStep, findVisibleStep]);

  useEffect(() => {
    if (!isOpen) {
      setVisible(false);
      return;
    }

    const firstVisible = findVisibleStep(0);
    if (firstVisible !== -1) {
      setCurrentStep(firstVisible);
    }
    setVisible(true);
  }, [isOpen]);

  useEffect(() => {
    if (!visible) return;
    updateTargetRect();
    const onResize = () => updateTargetRect();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [visible, updateTargetRect]);

  useEffect(() => {
    if (!visible || !isOpen) return;
    const currentSteps = stepsRef.current;
    const step = currentSteps[currentStep];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;

    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }
    resizeObserverRef.current = new ResizeObserver(() => updateTargetRect());
    resizeObserverRef.current.observe(el);

    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const timer = setTimeout(() => updateTargetRect(), 400);

    return () => {
      clearTimeout(timer);
      resizeObserverRef.current?.disconnect();
    };
  }, [currentStep, visible, isOpen, updateTargetRect]);

  const handleNext = () => {
    const next = findVisibleStep(currentStep + 1, 1);
    if (next !== -1) {
      setCurrentStep(next);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    const prev = findVisibleStep(currentStep - 1, -1);
    if (prev !== -1) {
      setCurrentStep(prev);
    }
  };

  const handleSkip = () => {
    skipAllTutorials(userId);
    onComplete();
  };

  if (!isOpen || !visible) return null;

  const step = steps[currentStep];
  const totalVisible = steps.filter((s) => {
    const el = document.querySelector(s.target);
    return el && el.getBoundingClientRect().width > 0;
  }).length;

  const visibleIndex = steps.slice(0, currentStep + 1).filter((s) => {
    const el = document.querySelector(s.target);
    return el && el.getBoundingClientRect().width > 0;
  }).length;

  const padding = 8;
  const spotlightStyle = targetRect
    ? {
        top: targetRect.top - padding,
        left: targetRect.left - padding,
        width: targetRect.width + padding * 2,
        height: targetRect.height + padding * 2,
      }
    : null;

  const maskId = `tour-spotlight-mask-${storageKey}`;

  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 10002, maxHeight: "calc(100vh - 32px)" };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tooltipWidth = Math.max(240, Math.min(340, vw - 32));
    const measuredHeight = tooltipRef.current?.getBoundingClientRect().height || 200;
    const tooltipHeight = Math.min(measuredHeight, vh - 32);
    const maxH = vh - 32;
    const gap = 12;
    const edge = 16;

    let top: number;
    let left: number;

    const spaceBelow = vh - targetRect.bottom - padding;
    const spaceAbove = targetRect.top - padding;
    const spaceRight = vw - targetRect.right - padding;
    const spaceLeft = targetRect.left - padding;

    let pos = step.position;
    if (pos === "bottom" && spaceBelow < tooltipHeight + gap && spaceAbove > spaceBelow) pos = "top";
    else if (pos === "top" && spaceAbove < tooltipHeight + gap && spaceBelow > spaceAbove) pos = "bottom";
    else if (pos === "right" && spaceRight < tooltipWidth + gap && spaceLeft > spaceRight) pos = "left";
    else if (pos === "left" && spaceLeft < tooltipWidth + gap && spaceRight > spaceLeft) pos = "right";

    if (pos === "bottom") {
      top = targetRect.bottom + padding + gap;
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    } else if (pos === "top") {
      top = targetRect.top - padding - gap - tooltipHeight;
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    } else if (pos === "right") {
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      left = targetRect.right + padding + gap;
    } else {
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      left = targetRect.left - padding - gap - tooltipWidth;
    }

    left = Math.max(edge, Math.min(left, vw - tooltipWidth - edge));
    top = Math.max(edge, Math.min(top, vh - tooltipHeight - edge));

    return { position: "fixed", zIndex: 10002, maxWidth: tooltipWidth, width: tooltipWidth, top, left, maxHeight: maxH };
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0" style={{ zIndex: 10000 }}>
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 10000 }}>
        <defs>
          <mask id={maskId}>
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {spotlightStyle && (
              <rect
                x={spotlightStyle.left}
                y={spotlightStyle.top}
                width={spotlightStyle.width}
                height={spotlightStyle.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.75)"
          mask={`url(#${maskId})`}
        />
      </svg>

      {spotlightStyle && (
        <div
          className="absolute rounded-xl border-2 border-primary shadow-[0_0_20px_var(--primary-shadow)] pointer-events-none transition-all duration-300"
          style={{
            ...spotlightStyle,
            zIndex: 10001,
          }}
        />
      )}

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10001 }} />

      <div
        ref={tooltipRef}
        className="glassmorphic rounded-xl border border-primary/40 shadow-xl p-5 animate-in fade-in slide-in-from-bottom-2 duration-300 overflow-y-auto"
        style={getTooltipStyle()}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-mono text-primary/70 uppercase tracking-wider">
              Tutorial {visibleIndex}/{totalVisible}
            </span>
          </div>
          <button
            onClick={handleSkip}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-primary/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <h3 className="font-orbitron text-base text-[#D6F4FF] mb-2">{step.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">{step.description}</p>

        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            {currentStep > 0 && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg border border-primary/30 text-primary hover:bg-primary/10 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Back
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors font-medium"
            >
              {findVisibleStep(currentStep + 1, 1) === -1 ? "Finish" : "Next"}
              {findVisibleStep(currentStep + 1, 1) !== -1 && <ChevronRight className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex justify-center gap-1.5 mt-3">
          {Array.from({ length: totalVisible }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i + 1 === visibleIndex ? "w-4 bg-primary" : "w-1.5 bg-primary/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
