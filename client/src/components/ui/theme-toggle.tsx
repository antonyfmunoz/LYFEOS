import React from "react";
import { Button } from "@/components/ui/button";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/themeContext";
import { toast } from "@/hooks/use-toast";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  const handleToggle = () => {
    const newTheme = theme === "dark" ? "light" : "dark";
    toggleTheme();
    
    // Show theme change toast
    toast({
      title: `${newTheme === "light" ? "Light" : "Dark"} Mode Activated`,
      description: `LYFEOS interface has switched to ${newTheme} mode.`,
      variant: "default",
      className: "bg-background border border-primary text-foreground",
      duration: 3000,
    });
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      className="rounded-full border border-primary/30 bg-card/30 hover:bg-primary/10 shadow-[0_0_5px_var(--shadow-color)]"
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