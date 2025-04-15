import { Link } from "wouter";
import { useEffect, useRef } from "react";

interface MobileNavProps {
  currentPage: string;
}

export default function MobileNav({ currentPage }: MobileNavProps) {
  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Home" },
    { id: "quests", icon: "star", label: "Quests" },
    { id: "ai", icon: "smart_toy", label: "AI" },
    { id: "codex", icon: "book", label: "Codex" },
    { id: "systems", icon: "settings", label: "Systems" },
  ];
  
  const indicatorRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  
  // Update the position of the indicator based on the current page
  useEffect(() => {
    if (indicatorRef.current && navRef.current) {
      const index = navItems.findIndex(item => item.id === currentPage);
      if (index >= 0) {
        const navWidth = navRef.current.offsetWidth;
        const itemWidth = navWidth / navItems.length;
        const position = index * itemWidth;
        indicatorRef.current.style.transform = `translateX(${position}px)`;
        indicatorRef.current.style.width = `${itemWidth}px`;
      }
    }
  }, [currentPage, navItems]);

  return (
    <div className="lg:hidden glassmorphic relative z-10">
      {/* Top border with futuristic pattern */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-primary/50 to-transparent"></div>
      
      {/* Active indicator with glow effect */}
      <div 
        ref={indicatorRef}
        className="absolute top-0 h-full w-1/5 transition-transform duration-300 z-0"
      >
        <div className="absolute inset-0 bg-[#001E26]/70 border-t-2 border-primary"></div>
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-10 h-[2px] bg-primary blur-[4px]"></div>
      </div>
      
      {/* Navigation items */}
      <div ref={navRef} className="flex justify-around relative z-10">
        {navItems.map((item) => (
          <Link 
            key={item.id} 
            href={`/${item.id}`}
            className={`flex flex-col items-center py-3 px-2 transition-all duration-300 relative ${
              currentPage === item.id 
                ? "text-primary text-glow transform -translate-y-[2px]" 
                : "text-[#7DAAB2] hover:text-[#D6F4FF]"
            }`}
          >
            <span className={`material-icons text-base transition-all duration-300 ${
              currentPage === item.id ? "text-primary scale-110" : ""
            }`}>
              {item.icon}
            </span>
            <span className={`text-xs mt-1 font-rajdhani font-medium transition-all duration-300 ${
              currentPage === item.id ? "font-semibold" : ""
            }`}>
              {item.label}
            </span>
            
            {/* Small animated dot for active item */}
            {currentPage === item.id && (
              <span className="absolute bottom-1 h-1 w-1 rounded-full bg-primary animate-pulse"></span>
            )}
          </Link>
        ))}
      </div>
      
      {/* Decorative elements */}
      <div className="absolute bottom-[2px] left-2 w-3 h-3 border-l-2 border-b-2 border-primary/30"></div>
      <div className="absolute bottom-[2px] right-2 w-3 h-3 border-r-2 border-b-2 border-primary/30"></div>
    </div>
  );
}
