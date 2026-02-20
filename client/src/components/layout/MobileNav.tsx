import { Link, useLocation } from "wouter";
import { useState, useEffect, useRef, useCallback } from "react";

interface MobileNavProps {
  currentPage: string;
}

export default function MobileNav({ currentPage }: MobileNavProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "missions", icon: "track_changes", label: "Missions" },
    { id: "ai", icon: "smart_toy", label: "AI" },
    { id: "chronilog", icon: "book", label: "Chronilog" },
    { id: "profile", icon: "person", label: "Profile" },
  ];

  const currentIcon = navItems.find(item => item.id === currentPage)?.icon || "menu";

  const handleClickOutside = useCallback((e: MouseEvent) => {
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

  return (
    <div
      ref={containerRef}
      data-tour="mobile-nav"
      className="lg:hidden fixed right-4 z-50"
      style={{ bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <div className="flex items-center gap-2">
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
          onClick={() => setIsOpen(!isOpen)}
          className={`w-16 h-16 rounded-full flex items-center justify-center border-2 transition-all duration-300 shadow-lg border-primary/40 bg-background/95 backdrop-blur-md text-muted-foreground shadow-[0_0_15px_var(--primary-bg-subtle)] ${
            isOpen ? "rotate-45" : ""
          }`}
        >
          <span className="material-icons text-2xl">
            {isOpen ? "close" : currentIcon}
          </span>
        </button>
      </div>
    </div>
  );
}
