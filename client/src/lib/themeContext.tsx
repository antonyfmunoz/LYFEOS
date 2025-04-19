import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useLYFEOS } from './context';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleDarkMode: () => void;
}

// Create the context
const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Provider component
export function ThemeProvider({ children }: { children: ReactNode }) {
  const { stats, updateUserStats } = useLYFEOS();
  const [isDarkMode, setIsDarkMode] = useState(true); // Default to dark mode

  // Initialize theme from stats or localStorage when component mounts
  useEffect(() => {
    if (stats && stats.darkThemeEnabled !== undefined) {
      setIsDarkMode(stats.darkThemeEnabled);
    } else {
      // Fall back to localStorage if stats are not available
      const savedTheme = localStorage.getItem('lyfeos-theme');
      if (savedTheme) {
        setIsDarkMode(savedTheme === 'dark');
      }
    }
  }, [stats]);

  // Apply theme class to document whenever isDarkMode changes
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

  // Toggle function
  const toggleDarkMode = () => {
    const newDarkModeValue = !isDarkMode;
    setIsDarkMode(newDarkModeValue);
    
    // If user is logged in, update the database
    if (stats && updateUserStats) {
      updateUserStats({
        ...stats,
        darkThemeEnabled: newDarkModeValue
      });
    }
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleDarkMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

// Hook for accessing the theme context
export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}