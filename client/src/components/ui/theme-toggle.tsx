import React from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/themeContext";
import { toast } from "@/hooks/use-toast";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  const handleToggle = () => {
    toggleTheme();
    
    // Show theme change toast
    toast({
      title: `${theme === "dark" ? "Light" : "Dark"} Mode Activated`,
      description: `LYFEOS interface has switched to ${theme === "dark" ? "light" : "dark"} mode.`,
      variant: "default",
      className: `bg-${theme === "dark" ? "white" : "[#001E26]"} border border-primary text-${theme === "dark" ? "[#001E26]" : "white"}`,
      duration: 3000,
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      className="rounded-full hover:bg-primary/10"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 text-primary" />
      ) : (
        <Moon className="h-5 w-5 text-primary" />
      )}
    </Button>
  );
}