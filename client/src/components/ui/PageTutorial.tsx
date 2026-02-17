import { useState, useEffect, useCallback, useRef } from "react";
import ReactDOM from "react-dom";
import { ChevronRight, ChevronLeft, X, Sparkles } from "lucide-react";

export interface TutorialStep {
  target: string;
  title: string;
  description: string;
  position: "top" | "bottom" | "left" | "right";
  mobilePosition?: "top" | "bottom" | "left" | "right" | "center";
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

export async function markTutorialComplete(page: string, userId?: number | null) {
  localStorage.setItem(tutorialKey(page, userId), "true");
  if (userId) {
    try {
      const res = await fetch("/api/profile", { credentials: "include" });
      if (res.ok) {
        const profile = await res.json();
        const existing = profile.completedTutorials || [];
        if (!existing.includes(page)) {
          await fetch("/api/profile", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ completedTutorials: [...existing, page] }),
          });
        }
      }
    } catch (e) {
      console.error("Failed to save tutorial completion:", e);
    }
  }
}

export async function skipAllTutorials(userId?: number | null) {
  TUTORIAL_PAGES.forEach(page => localStorage.setItem(tutorialKey(page, userId), "true"));
  if (userId) {
    try {
      await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ completedTutorials: [...TUTORIAL_PAGES] }),
      });
    } catch (e) {
      console.error("Failed to save tutorial skip:", e);
    }
  }
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
  const [scrollingToTarget, setScrollingToTarget] = useState(true);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const lockedPositionRef = useRef<{ step: number; side: "top" | "bottom" | "left" | "right" } | null>(null);
  const scrollEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const lastRectRef = useRef<{ top: number; left: number; width: number; height: number } | null>(null);

  const updateTargetRect = useCallback(() => {
    if (!isOpen) return;
    const currentSteps = stepsRef.current;
    const step = currentSteps[currentStep];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0) {
        const last = lastRectRef.current;
        const threshold = 2;
        if (last &&
          Math.abs(rect.top - last.top) < threshold &&
          Math.abs(rect.left - last.left) < threshold &&
          Math.abs(rect.width - last.width) < threshold &&
          Math.abs(rect.height - last.height) < threshold
        ) {
          return;
        }
        lastRectRef.current = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
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

    lockedPositionRef.current = null;
    lastRectRef.current = null;
    const firstVisible = findVisibleStep(0);
    if (firstVisible !== -1) {
      setCurrentStep(firstVisible);
    }
    setVisible(true);
  }, [isOpen]);

  useEffect(() => {
    if (!visible) return;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      lockedPositionRef.current = null;
      lastRectRef.current = null;
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => updateTargetRect(), 100);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (resizeTimer) clearTimeout(resizeTimer);
    };
  }, [visible, updateTargetRect]);

  useEffect(() => {
    if (!visible || !isOpen) return;
    const currentSteps = stepsRef.current;
    const step = currentSteps[currentStep];
    if (!step) return;
    const el = document.querySelector(step.target);
    if (!el) return;

    setScrollingToTarget(true);
    setTargetRect(null);
    lockedPositionRef.current = null;
    lastRectRef.current = null;

    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
    }

    const finalizePosition = () => {
      updateTargetRect();
      setScrollingToTarget(false);
    };

    const onScrollDuringTransition = () => {
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      scrollEndTimerRef.current = setTimeout(finalizePosition, 100);
    };

    window.addEventListener("scroll", onScrollDuringTransition, true);

    el.scrollIntoView({ behavior: "smooth", block: "center" });

    scrollEndTimerRef.current = setTimeout(finalizePosition, 200);

    return () => {
      window.removeEventListener("scroll", onScrollDuringTransition, true);
      if (scrollEndTimerRef.current) clearTimeout(scrollEndTimerRef.current);
      resizeObserverRef.current?.disconnect();
    };
  }, [currentStep, visible, isOpen, updateTargetRect]);

  const handleNext = () => {
    const next = findVisibleStep(currentStep + 1, 1);
    if (next !== -1) {
      setScrollingToTarget(true);
      setTargetRect(null);
      lockedPositionRef.current = null;
      lastRectRef.current = null;
      setCurrentStep(next);
    } else {
      onComplete();
    }
  };

  const handlePrev = () => {
    const prev = findVisibleStep(currentStep - 1, -1);
    if (prev !== -1) {
      setScrollingToTarget(true);
      setTargetRect(null);
      lockedPositionRef.current = null;
      lastRectRef.current = null;
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

  const gap = 20;

  const getTooltipStyle = (): React.CSSProperties => {
    if (!targetRect) return { position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", zIndex: 10002, maxHeight: "calc(100vh - 32px)" };
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tooltipWidth = Math.max(240, Math.min(340, vw - 32));
    const measuredHeight = tooltipRef.current?.getBoundingClientRect().height;
    const tooltipHeight = measuredHeight && measuredHeight > 50 ? measuredHeight : 280;
    const maxH = vh - 32;
    const edge = 8;

    const targetTop = targetRect.top - padding;
    const targetBottom = targetRect.bottom + padding;
    const targetLeft = targetRect.left - padding;
    const targetRight = targetRect.right + padding;

    const spaceAbove = targetTop;
    const spaceBelow = vh - targetBottom;
    const spaceLeft = targetLeft;
    const spaceRight = vw - targetRight;

    const nearBottom = targetBottom > vh - 80;
    const nearTop = targetTop < 80;
    const targetHeight = targetBottom - targetTop;
    const isLargeTarget = targetHeight > vh * 0.35;
    const conservativeHeight = Math.max(tooltipHeight, 280);
    const canFitAbove = spaceAbove >= tooltipHeight + gap;
    const canFitBelow = spaceBelow >= tooltipHeight + gap;

    if (isLargeTarget && !nearBottom && !nearTop && spaceAbove >= conservativeHeight + gap && spaceBelow >= conservativeHeight + gap) {
      const centeredLeft = Math.max(edge, Math.min((vw - tooltipWidth) / 2, vw - tooltipWidth - edge));
      return { position: "fixed", zIndex: 10002, maxWidth: tooltipWidth, width: tooltipWidth, top: "50%", left: centeredLeft, transform: "translateY(-50%)", maxHeight: maxH };
    }

    const isMobile = vw < 768;
    if (isMobile && step.mobilePosition === "center") {
      const centeredLeft = Math.max(edge, (vw - tooltipWidth) / 2);
      return { position: "fixed", zIndex: 10002, maxWidth: tooltipWidth, width: tooltipWidth, top: "50%", left: centeredLeft, transform: "translateY(-50%)", maxHeight: maxH };
    }

    let pos: "top" | "bottom" | "left" | "right";

    if (nearBottom) {
      pos = "top";
    } else if (nearTop) {
      pos = "bottom";
    } else if (lockedPositionRef.current && lockedPositionRef.current.step === currentStep) {
      pos = lockedPositionRef.current.side;
    } else {
      const canFitLeft = spaceLeft >= tooltipWidth + gap;
      const canFitRight = spaceRight >= tooltipWidth + gap;

      const preferred = step.position;
      if (preferred === "bottom" && canFitBelow) pos = "bottom";
      else if (preferred === "top" && canFitAbove) pos = "top";
      else if (preferred === "right" && canFitRight) pos = "right";
      else if (preferred === "left" && canFitLeft) pos = "left";
      else if (canFitAbove && spaceAbove >= spaceBelow) pos = "top";
      else if (canFitBelow) pos = "bottom";
      else if (canFitRight && spaceRight >= spaceLeft) pos = "right";
      else if (canFitLeft) pos = "left";
      else pos = spaceAbove >= spaceBelow ? "top" : "bottom";
    }
    lockedPositionRef.current = { step: currentStep, side: pos };

    let top: number;
    let left: number;

    if (pos === "bottom") {
      top = targetBottom + gap;
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    } else if (pos === "top") {
      top = targetTop - gap - tooltipHeight;
      left = targetRect.left + targetRect.width / 2 - tooltipWidth / 2;
    } else if (pos === "right") {
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      left = targetRight + gap;
    } else {
      top = targetRect.top + targetRect.height / 2 - tooltipHeight / 2;
      left = targetLeft - gap - tooltipWidth;
    }

    left = Math.max(edge, Math.min(left, vw - tooltipWidth - edge));
    top = Math.max(edge, Math.min(top, vh - tooltipHeight - edge));

    const overlapsH = (left + tooltipWidth) > targetLeft && left < targetRight;
    const overlapsV = (top + tooltipHeight) > targetTop && top < targetBottom;

    if (overlapsH && overlapsV) {
      const abovePos = targetTop - gap - tooltipHeight;
      const belowPos = targetBottom + gap;
      const aboveFits = abovePos >= edge;
      const belowFits = belowPos + tooltipHeight <= vh - edge;

      if (pos === "top" || pos === "bottom") {
        if (pos === "top" && aboveFits) {
          top = abovePos;
        } else if (pos === "bottom" && belowFits) {
          top = belowPos;
        } else if (aboveFits) {
          top = abovePos;
        } else if (belowFits) {
          top = belowPos;
        } else {
          top = Math.max(edge, (vh - tooltipHeight) / 2);
        }
      } else {
        if (pos === "right") {
          left = targetRight + gap;
        } else {
          left = targetLeft - gap - tooltipWidth;
        }
        left = Math.max(edge, Math.min(left, vw - tooltipWidth - edge));
        const stillOverlapsH2 = (left + tooltipWidth) > targetLeft && left < targetRight;
        const stillOverlapsV2 = (top + tooltipHeight) > targetTop && top < targetBottom;
        if (stillOverlapsH2 && stillOverlapsV2) {
          if (aboveFits) top = abovePos;
          else if (belowFits) top = belowPos;
          else top = Math.max(edge, (vh - tooltipHeight) / 2);
        }
      }
    }

    return { position: "fixed", zIndex: 10002, maxWidth: tooltipWidth, width: tooltipWidth, top, left, maxHeight: maxH };
  };

  const transitionStyle = scrollingToTarget ? { opacity: 0, pointerEvents: "none" as const, transition: "opacity 0.15s ease" } : { opacity: 1, transition: "opacity 0.2s ease 0.05s" };

  return ReactDOM.createPortal(
    <div className="fixed inset-0" style={{ zIndex: 10000 }}>
      <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 10000, ...transitionStyle }}>
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
          className="absolute rounded-xl border-2 border-primary shadow-[0_0_20px_var(--primary-shadow)] pointer-events-none"
          style={{
            ...spotlightStyle,
            zIndex: 10001,
            ...transitionStyle,
          }}
        />
      )}

      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 10001 }} />

      <div
        ref={tooltipRef}
        className="glassmorphic rounded-xl border border-primary/40 shadow-xl p-5 overflow-y-auto"
        style={{ ...getTooltipStyle(), ...transitionStyle }}
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
