import { Link } from "wouter";
import { useEffect, useRef } from "react";

interface MobileNavProps {
  currentPage: string;
}

export default function MobileNav({ currentPage }: MobileNavProps) {
  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Dashboard" },
    { id: "quests", icon: "track_changes", label: "Missions" },
    { id: "ai", icon: "smart_toy", label: "AI Assistant" },
    { id: "chronilog", icon: "book", label: "Chronilog" },
  ];
  
  const indicatorRef = useRef<HTMLDivElement>(null);
  
  // Update the position of the indicator based on the current page
  useEffect(() => {
    if (indicatorRef.current) {
      const index = navItems.findIndex(item => item.id === currentPage);
      const position = index >= 0 ? index * 100 : 0;
      indicatorRef.current.style.transform = `translateX(${position}%)`;
    }
  }, [currentPage, navItems]);

  return (
    <div className="lg:hidden border-t border-primary border-opacity-20 glassmorphic relative">
      <div 
        ref={indicatorRef}
        className="absolute bottom-0 left-0 h-0.5 w-1/4 bg-primary shadow-[0_0_10px_var(--primary-shadow)] transition-transform duration-300"
      ></div>
      
      <div className="flex justify-around">
        {navItems.map((item) => (
          <Link 
            key={item.id} 
            href={`/${item.id}`}
            className={`flex flex-col items-center py-3 px-4 ${
              currentPage === item.id ? "text-primary" : "text-muted-foreground"
            }`}
          >
            <span className="material-icons text-sm">{item.icon}</span>
            <span className="text-xs mt-1 font-medium">{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
