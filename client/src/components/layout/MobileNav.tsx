import { Link, useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";

interface MobileNavProps {
  currentPage: string;
}

const FAB_SIZE = 64;
const STORAGE_KEY = "fab-nav-position";
const DRAG_THRESHOLD = 8;

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
  const menuRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();
  const [position, setPosition] = useState(getDefaultPosition);

  const dragging = useRef(false);
  const moved = useRef(false);
  const startPoint = useRef({ x: 0, y: 0 });
  const startPos = useRef({ x: 0, y: 0 });
  const usedTouch = useRef(false);

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
    const target = e.target as Node;
    const inFab = containerRef.current?.contains(target);
    const inMenu = menuRef.current?.contains(target);
    if (!inFab && !inMenu) {
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

  const savePosition = useCallback((pos: { x: number; y: number }) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(pos)); } catch {}
  }, []);

  useEffect(() => {
    const onMove = (clientX: number, clientY: number) => {
      if (!dragging.current) return;
      const dx = clientX - startPoint.current.x;
      const dy = clientY - startPoint.current.y;
      if (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD) {
        moved.current = true;
      }
      if (moved.current) {
        const newPos = clampPosition(startPos.current.x + dx, startPos.current.y + dy);
        setPosition(newPos);
      }
    };

    const onEnd = () => {
      if (!dragging.current) return;
      dragging.current = false;
      if (moved.current) {
        setPosition(prev => {
          savePosition(prev);
          return prev;
        });
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (dragging.current) {
        e.preventDefault();
        onMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const handleTouchEnd = () => onEnd();
    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const handleMouseUp = () => onEnd();

    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [savePosition]);

  const handlePointerDown = useCallback((clientX: number, clientY: number, isTouch: boolean) => {
    dragging.current = true;
    moved.current = false;
    usedTouch.current = isTouch;
    startPoint.current = { x: clientX, y: clientY };
    startPos.current = { ...position };
  }, [position]);

  const fabCenterX = position.x + FAB_SIZE / 2;
  const fabCenterY = position.y + FAB_SIZE / 2;
  const MENU_WIDTH = 320;
  const MENU_HEIGHT = 72;
  const MENU_GAP = 8;
  const EDGE_MARGIN = 8;

  const getMenuPosition = () => {
    let menuX: number;
    let menuY: number;

    const fabOnRight = fabCenterX > window.innerWidth / 2;
    if (fabOnRight) {
      menuX = position.x - MENU_WIDTH - MENU_GAP;
    } else {
      menuX = position.x + FAB_SIZE + MENU_GAP;
    }

    menuY = position.y + (FAB_SIZE - MENU_HEIGHT) / 2;

    menuX = Math.max(EDGE_MARGIN, Math.min(menuX, window.innerWidth - MENU_WIDTH - EDGE_MARGIN));
    menuY = Math.max(EDGE_MARGIN, Math.min(menuY, window.innerHeight - MENU_HEIGHT - EDGE_MARGIN));

    return { menuX, menuY };
  };

  const menuPos = getMenuPosition();

  return (
    <>
      {isOpen && (
        <div
          ref={menuRef}
          className="lg:hidden fixed z-50 transition-all duration-300 ease-out"
          style={{
            left: menuPos.menuX,
            top: menuPos.menuY,
          }}
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
      )}

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
        <div
          onTouchStart={(e) => {
            handlePointerDown(e.touches[0].clientX, e.touches[0].clientY, true);
          }}
          onTouchEnd={(e) => {
            if (!moved.current) {
              e.preventDefault();
              setIsOpen(prev => !prev);
            }
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            handlePointerDown(e.clientX, e.clientY, false);
          }}
          onMouseUp={() => {
            if (!moved.current && !usedTouch.current) {
              setIsOpen(prev => !prev);
            }
          }}
          className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-colors duration-300 shadow-lg border-primary/40 bg-background/95 backdrop-blur-md text-muted-foreground shadow-[0_0_15px_var(--primary-bg-subtle)] select-none ${
            isOpen ? "rotate-45" : ""
          }`}
          role="button"
          tabIndex={0}
          style={{ cursor: "grab", WebkitUserSelect: "none", userSelect: "none" }}
        >
          <span className="material-icons text-2xl pointer-events-none">
            {isOpen ? "close" : currentIcon}
          </span>
        </div>
      </div>
    </>
  );
}
