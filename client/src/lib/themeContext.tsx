import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";
type PrimaryColor = "cyan" | "purple" | "blue" | "green" | "orange";

interface ThemeContextType {
  theme: Theme;
  primaryColor: PrimaryColor;
  toggleTheme: () => void;
  setPrimaryColor: (color: PrimaryColor) => void;
  reloadWithTheme: () => void;
  applyThemeChanges: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Provider component
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Use localStorage to persist theme preference
  const [theme, setTheme] = useState<Theme>(() => {
    // Check for saved theme preference or use system preference
    const savedTheme = localStorage.getItem("lyfeos-theme") as Theme;
    return savedTheme || 
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  });
  
  // State for primary color
  const [primaryColor, setPrimaryColorState] = useState<PrimaryColor>(() => {
    const savedColor = localStorage.getItem("lyfeos-primary-color") as PrimaryColor;
    return savedColor || "cyan";
  });

  // Toggle theme function
  const toggleTheme = () => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === "dark" ? "light" : "dark";
      localStorage.setItem("lyfeos-theme", newTheme);
      return newTheme;
    });
  };
  
  // Set primary color function
  const setPrimaryColor = (color: PrimaryColor) => {
    setPrimaryColorState(color);
    localStorage.setItem("lyfeos-primary-color", color);
    
    // Update CSS variables for immediate visual feedback
    updateCSSVariables(color);
  };
  
  // Update CSS variables based on color
  const updateCSSVariables = (color: PrimaryColor) => {
    const root = window.document.documentElement;
    const colorValues: Record<PrimaryColor, string> = {
      "cyan": "hsl(188 100% 50%)",
      "purple": "hsl(265 89% 78%)",
      "blue": "hsl(217 91% 60%)",
      "green": "hsl(142 71% 45%)",
      "orange": "hsl(24 94% 50%)"
    };
    
    // Update CSS variable directly
    root.style.setProperty('--primary', colorValues[color]);
  };
  
  // Apply theme changes without full reload
  const applyThemeChanges = () => {
    // Update CSS variables based on current primary color
    updateCSSVariables(primaryColor);
    
    // Apply dark/light theme
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  };
  
  // Function to force a full page reload
  const reloadWithTheme = () => {
    // Add a timestamp parameter to force a full reload with no caching
    window.location.href = `${window.location.pathname}?reload=${Date.now()}`;
  };

  // Apply theme to document when theme changes
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
  }, [theme]);
  
  // Apply primary color on initial load
  useEffect(() => {
    updateCSSVariables(primaryColor);
  }, [primaryColor]);
  
  // Check for query params on page load
  useEffect(() => {
    // If URL contains reload parameter, clean it up
    if (window.location.search.includes('reload=')) {
      // Remove the query parameter but keep the page loading
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      
      // Apply theme settings after reload
      applyThemeChanges();
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        primaryColor,
        toggleTheme,
        setPrimaryColor,
        reloadWithTheme,
        applyThemeChanges
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

// Custom hook to use the theme context
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}