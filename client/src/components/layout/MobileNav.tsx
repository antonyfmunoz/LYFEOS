import { Link, useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";

interface MobileNavProps {
  currentPage: string;
}

const FAB_SIZE = 64;
const STORAGE_KEY = "fab-nav-position";

function getDefaultPosition() {
  return {
    x: window.innerWidth - FAB_SIZE - 16,
    y: window.innerHeight - FAB_SIZE - 16,
  };
}

function loadPosition() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const pos = JSON.parse(saved);
      return clampPosition(pos.x, pos.y);
    }
  } catch {}
  return getDefaultPosition();
}

function clampPosition(x: number, y: number) {
  const margin = 4;
  return {
    x: Math.max(margin, Math.min(x, window.innerWidth - FAB_SIZE - margin)),
    y: Math.max(margin, Math.min(y, window.innerHeight - FAB_SIZE - margin)),
  };
}

export default function MobileNav({ currentPage }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const [position, setPosition] = useState(getDefaultPosition);

  const isDragging = useRef(false);
  const hasMoved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const posStart = useRef({ x: 0, y: 0 });

  useEffect(() => {
    setPosition(loadPosition());
  }, []);

  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => clampPosition(prev.x, prev.y));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "missions", icon: "track_changes", label: "Missions" },
    { id: "ai", icon: "smart_toy", label: "AI" },
    { id: "chronilog", icon: "book", label: "Chronilog" },
    { id: "profile", icon: "person", label: "Profile" },
  ];

  const currentIcon = navItems.find(item => item.id === currentPage)?.icon || "menu";

  const handleClickOutside = useCallback((e: MouseEvent | TouchEvent) => {
    if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside as any);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside as any);
    };
  }, [isOpen, handleClickOutside]);

  const handleNavClick = (id: string) => {
    setIsOpen(false);
    navigate(`/${id}`);
  };

  const onDragStart = useCallback((clientX: number, clientY: number) => {
    isDragging.current = true;
    hasMoved.current = false;
    dragStart.current = { x: clientX, y: clientY };
    posStart.current = { ...position };
  }, [position]);

  const onDragMove = useCallback((clientX: number, clientY: number) => {
    if (!isDragging.current) return;
    const dx = clientX - dragStart.current.x;
    const dy = clientY - dragStart.current.y;
    if (Math.abs(dx) > 5 || Math.abs(dy) > 5) {
      hasMoved.current = true;
    }
    const newPos = clampPosition(posStart.current.x + dx, posStart.current.y + dy);
    setPosition(newPos);
  }, []);

  const onDragEnd = useCallback(() => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (hasMoved.current) {
      setPosition(prev => {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prev)); } catch {}
        return prev;
      });
    }
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    onDragStart(touch.clientX, touch.clientY);
  }, [onDragStart]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    onDragMove(touch.clientX, touch.clientY);
  }, [onDragMove]);

  const handleTouchEnd = useCallback(() => {
    const moved = hasMoved.current;
    onDragEnd();
    if (!moved) {
      setIsOpen(prev => !prev);
    }
  }, [onDragEnd]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    onDragStart(e.clientX, e.clientY);
  }, [onDragStart]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => onDragMove(e.clientX, e.clientY);
    const handleMouseUp = () => {
      const moved = hasMoved.current;
      onDragEnd();
      if (!moved && isDragging.current === false) {
      }
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onDragMove, onDragEnd]);

  const fabOnRight = position.x > window.innerWidth / 2;

  return (
    <div
      ref={containerRef}
      data-tour="mobile-nav"
      className="lg:hidden fixed z-50"
      style={{
        left: position.x,
        top: position.y,
        touchAction: "none",
      }}
    >
      <div className={`flex items-center gap-2 ${fabOnRight ? "flex-row" : "flex-row-reverse"}`}>
        <div
          className={`flex items-center gap-1 overflow-hidden transition-all duration-300 ease-out ${
            isOpen ? "max-w-[400px] opacity-100" : "max-w-0 opacity-0"
          }`}
        >
          <div className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-background/95 backdrop-blur-md shadow-[0_0_20px_var(--primary-bg-subtle)] px-3 py-2">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className="flex flex-col items-center justify-center w-14 h-14 rounded-full transition-all duration-200 text-muted-foreground active:opacity-70"
              >
                <span className="material-icons text-xl">{item.icon}</span>
                <span className="text-[10px] mt-0.5 font-medium leading-none">{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        <button
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          onClick={(e) => {
            if (hasMoved.current) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            setIsOpen(!isOpen);
          }}
          className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-lg border-primary/40 bg-background/95 backdrop-blur-md text-muted-foreground shadow-[0_0_15px_var(--primary-bg-subtle)] ${
            isOpen ? "rotate-45" : ""
          }`}
          style={{ cursor: "grab" }}
        >
          <span className="material-icons text-2xl">
            {isOpen ? "close" : currentIcon}
          </span>
        </button>
      </div>
    </div>
  );
}
