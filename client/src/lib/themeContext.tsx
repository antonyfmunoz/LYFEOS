import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Theme = "dark" | "light";

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  reloadWithTheme: () => void;
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

  // Toggle theme function
  const toggleTheme = () => {
    setTheme(prevTheme => {
      const newTheme = prevTheme === "dark" ? "light" : "dark";
      localStorage.setItem("lyfeos-theme", newTheme);
      return newTheme;
    });
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
  
  // Check for query params on page load
  useEffect(() => {
    // If URL contains reload parameter, clean it up
    if (window.location.search.includes('reload=')) {
      // Remove the query parameter but keep the page loading
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
      
      // Any additional initialization needed after reload
    }
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        reloadWithTheme,
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