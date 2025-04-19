import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useLYFEOS } from './context';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { stats } = useLYFEOS();
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode

  // Initialize theme from localStorage or stats when component mounts
  useEffect(() => {
    const savedTheme = localStorage.getItem('lyfeos-theme');
    
    // First check if theme is saved in localStorage
    if (savedTheme) {
      setIsDarkMode(savedTheme === 'dark');
    } 
    // Otherwise use the theme from stats if available
    else if (stats && stats.darkThemeEnabled !== undefined) {
      setIsDarkMode(stats.darkThemeEnabled);
      localStorage.setItem('lyfeos-theme', stats.darkThemeEnabled ? 'dark' : 'light');
    }
  }, [stats]);

  // Apply theme class to document
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark-theme');
      document.documentElement.classList.remove('light-theme');
    } else {
      document.documentElement.classList.add('light-theme');
      document.documentElement.classList.remove('dark-theme');
    }
    
    // Save theme preference to localStorage
    localStorage.setItem('lyfeos-theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}