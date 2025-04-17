import { Link } from "wouter";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/authContext";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuSeparator, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { LogOut, User, Settings } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface MobileNavProps {
  currentPage: string;
}

export default function MobileNav({ currentPage }: MobileNavProps) {
  const { user, logout } = useAuth();
  const navItems = [
    { id: "dashboard", icon: "dashboard", label: "Home" },
    { id: "quests", icon: "star", label: "Quests" },
    { id: "ai", icon: "smart_toy", label: "AI" },
    { id: "codex", icon: "book", label: "Codex" },
    { id: "profile", icon: "person", label: "Profile" },
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
        className="absolute bottom-0 left-0 h-0.5 w-1/5 bg-primary shadow-[0_0_10px_rgba(0,224,255,0.7)] transition-transform duration-300"
      ></div>
      
      <div className="flex justify-around">
        {navItems.map((item) => {
          if (item.id === "profile") {
            return (
              <DropdownMenu key={item.id}>
                <DropdownMenuTrigger asChild>
                  <button 
                    className={`flex flex-col items-center py-3 px-4 ${
                      currentPage === item.id ? "text-primary" : "text-[#7DAAB2]"
                    }`}
                  >
                    <span className="material-icons text-sm">{item.icon}</span>
                    <span className="text-xs mt-1 font-medium">Me</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-background border border-primary/20">
                  <Link href="/profile">
                    <DropdownMenuItem className="cursor-pointer">
                      <User className="mr-2 h-4 w-4" />
                      <span>Profile</span>
                    </DropdownMenuItem>
                  </Link>
                  <Link href="/settings">
                    <DropdownMenuItem className="cursor-pointer">
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                  </Link>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    className="cursor-pointer text-red-500"
                    onClick={() => {
                      logout();
                      toast({
                        title: "Logged Out",
                        description: "You have been successfully logged out.",
                        className: "bg-background border border-primary text-foreground",
                      });
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            );
          }
          
          return (
            <Link 
              key={item.id} 
              href={`/${item.id}`}
              className={`flex flex-col items-center py-3 px-4 ${
                currentPage === item.id ? "text-primary" : "text-[#7DAAB2]"
              }`}
            >
              <span className="material-icons text-sm">{item.icon}</span>
              <span className="text-xs mt-1 font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
